import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { artifactPackageNameIsReviewed, artifactTagIsReviewed } from "./artifact-contract.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const infrastructureRoot = join(repositoryRoot, "infrastructure/google-cloud");
const digestPattern = /^sha256:[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(`artifact_cleanup_preview_invalid: ${message}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseEnvironment(values) {
  const index = values.indexOf("--environment");
  const environment = index >= 0 ? values[index + 1] : undefined;
  if (!environment || !["uat", "production"].includes(environment) || values.length !== 2) {
    fail("expected --environment uat|production");
  }
  return environment;
}

function environmentAbbreviation(environment) {
  return environment === "production" ? "prod" : "uat";
}

function packageNameFromResource(value) {
  const marker = "/packages/";
  const index = typeof value === "string" ? value.indexOf(marker) : -1;
  if (index < 0) {
    fail("package resource name differs");
  }
  const encoded = value.slice(index + marker.length).split("/")[0];
  return decodeURIComponent(encoded);
}

function versionFromResource(value) {
  const marker = "/versions/";
  const index = typeof value === "string" ? value.indexOf(marker) : -1;
  if (index < 0) {
    fail("version resource name differs");
  }
  const packageName = packageNameFromResource(value);
  const digest = value.slice(index + marker.length);
  if (!digestPattern.test(digest)) {
    fail("version digest differs");
  }
  return { digest, packageName };
}

function tagName(value) {
  const raw =
    typeof value === "string" ? value : typeof value?.name === "string" ? value.name : value?.tag;
  if (typeof raw !== "string" || raw.length === 0) {
    fail("tag resource differs");
  }
  const marker = "/tags/";
  return decodeURIComponent(
    raw.includes(marker) ? raw.slice(raw.indexOf(marker) + marker.length) : raw,
  );
}

function imageVersion(entry) {
  const value = entry?.version ?? entry?.name;
  return versionFromResource(value);
}

function imageCreatedAt(entry) {
  const value = entry?.createTime ?? entry?.create_time ?? entry?.uploadTime;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    fail("image creation time differs");
  }
  return timestamp;
}

function imageTags(entry) {
  return (entry?.tags ?? []).map(tagName);
}

function expectedParent(reviewedEnvironment, region, repositoryId) {
  return `projects/${reviewedEnvironment.projectId}/locations/${region}/repositories/${repositoryId}/packages/-`;
}

function protectedTag(tag) {
  return ["deployed-", "rollback-", "promotion-eligible-"].some((prefix) => tag.startsWith(prefix));
}

function requiredReleaseTagsExist(environment, applicationImages, smokeImages) {
  const applicationTags = new Set(applicationImages.flatMap((entry) => imageTags(entry)));
  const smokeTags = new Set(smokeImages.flatMap((entry) => imageTags(entry)));
  if (!smokeTags.has("latest")) {
    fail("permission-smoke latest tag is missing");
  }
  if (environment === "uat") {
    if (
      !applicationTags.has("deployed-uat") ||
      ![...applicationTags].some((tag) => tag.startsWith("promotion-eligible-"))
    ) {
      fail("UAT release tags are incomplete");
    }
  } else if (
    !applicationTags.has("deployed-production") ||
    !applicationTags.has("rollback-production")
  ) {
    fail("production release tags are incomplete");
  }
  if (![...applicationTags].some((tag) => tag.startsWith("release-"))) {
    fail("commit-addressed release tag is missing");
  }
}

export function buildArtifactCleanupPreview({
  environment,
  reviewedEnvironment,
  artifactCatalog,
  logEntries,
  packageEntries,
  applicationImages,
  smokeImages,
}) {
  if (!["uat", "production"].includes(environment)) {
    fail("environment differs");
  }
  const repositoryId = `bazoria-${environmentAbbreviation(environment)}-${artifactCatalog.repository.suffix}`;
  const parent = expectedParent(reviewedEnvironment, artifactCatalog.region, repositoryId);
  const reviewedPackages = new Set([
    artifactCatalog.cleanup.applicationPackage,
    artifactCatalog.cleanup.permissionSmokePackage,
  ]);

  for (const entry of packageEntries) {
    const packageName = packageNameFromResource(entry?.name);
    const hasReservedPrefix = [...reviewedPackages].some((prefix) =>
      packageName.startsWith(prefix),
    );
    if (hasReservedPrefix && !artifactPackageNameIsReviewed(packageName, artifactCatalog)) {
      fail("reserved package prefix collision");
    }
  }

  const images = [...applicationImages, ...smokeImages];
  const imagesByVersion = new Map();
  for (const entry of images) {
    const version = imageVersion(entry);
    if (!reviewedPackages.has(version.packageName)) {
      fail("image package differs");
    }
    const tags = imageTags(entry);
    for (const tag of tags) {
      if (
        !artifactTagIsReviewed({
          environment,
          packageName: version.packageName,
          tag,
          artifactCatalog,
        })
      ) {
        fail("reserved tag vocabulary collision");
      }
    }
    imagesByVersion.set(`${version.packageName}/${version.digest}`, {
      createdAt: imageCreatedAt(entry),
      tags,
    });
  }

  requiredReleaseTagsExist(environment, applicationImages, smokeImages);

  const recentApplicationVersions = new Set(
    applicationImages
      .map((entry) => ({ ...imageVersion(entry), createdAt: imageCreatedAt(entry) }))
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, artifactCatalog.cleanup.keepRecentVersionCount)
      .map((value) => `${value.packageName}/${value.digest}`),
  );

  const candidates = new Map();
  const timestamps = [];
  for (const entry of logEntries) {
    const payload = entry?.protoPayload;
    if (
      payload?.serviceName !== "artifactregistry.googleapis.com" ||
      payload?.methodName !==
        "google.devtools.artifactregistry.v1.ArtifactRegistry.BatchDeleteVersions" ||
      payload?.request?.parent !== parent ||
      payload?.request?.validateOnly !== true
    ) {
      fail("audit-log scope differs");
    }
    const timestamp = Date.parse(entry.timestamp ?? entry.receiveTimestamp);
    if (!Number.isFinite(timestamp)) {
      fail("audit-log timestamp differs");
    }
    timestamps.push(timestamp);
    const names = payload.request.names;
    if (!Array.isArray(names) || names.length === 0) {
      fail("audit-log candidate list is empty");
    }
    for (const name of names) {
      const version = versionFromResource(name);
      const key = `${version.packageName}/${version.digest}`;
      if (!reviewedPackages.has(version.packageName)) {
        fail("cleanup candidate package differs");
      }
      candidates.set(key, version);
    }
  }
  if (candidates.size === 0) {
    fail("dry-run preview is inconclusive");
  }

  const summaryCandidates = [];
  for (const [key, candidate] of candidates) {
    const image = imagesByVersion.get(key);
    if (!image) {
      fail("cleanup candidate is absent from current repository state");
    }
    if (
      image.tags.some(protectedTag) ||
      (candidate.packageName === artifactCatalog.cleanup.permissionSmokePackage &&
        image.tags.includes(artifactCatalog.smokeArtifact.tag)) ||
      recentApplicationVersions.has(key)
    ) {
      fail("protected artifact is a cleanup candidate");
    }
    summaryCandidates.push({
      digest: `${candidate.digest.slice(0, 19)}...`,
      packageName: candidate.packageName,
      retentionClass:
        candidate.packageName === artifactCatalog.cleanup.applicationPackage
          ? `${artifactCatalog.cleanup.environmentRetentionDays[environment]}-day-application`
          : `${artifactCatalog.cleanup.permissionSmokeRetentionDays}-day-permission-smoke`,
    });
  }

  const countsByPackage = Object.fromEntries(
    [...reviewedPackages].map((packageName) => [
      packageName,
      summaryCandidates.filter((candidate) => candidate.packageName === packageName).length,
    ]),
  );
  return {
    candidateCount: summaryCandidates.length,
    candidates: summaryCandidates.sort((left, right) =>
      `${left.packageName}/${left.digest}`.localeCompare(`${right.packageName}/${right.digest}`),
    ),
    countsByPackage,
    environment,
    observationWindow: {
      firstEntryAt: new Date(Math.min(...timestamps)).toISOString(),
      freshness: "48h",
      lastEntryAt: new Date(Math.max(...timestamps)).toISOString(),
    },
    projectId: reviewedEnvironment.projectId,
    protectedTagChecks: "passed",
    region: artifactCatalog.region,
    repositoryId,
    reservedPrefixCollisionChecks: "passed",
    status: "passed",
  };
}

function runGcloudJson(arguments_, operation) {
  try {
    return JSON.parse(
      execFileSync("gcloud", arguments_, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    throw new Error(`artifact_cleanup_preview_unavailable: ${operation}`);
  }
}

function collectLiveInputs(environment, reviewedEnvironment, artifactCatalog) {
  const abbreviation = environmentAbbreviation(environment);
  const repositoryId = `bazoria-${abbreviation}-${artifactCatalog.repository.suffix}`;
  const repositoryPath = `${artifactCatalog.region}-docker.pkg.dev/${reviewedEnvironment.projectId}/${repositoryId}`;
  const parent = expectedParent(reviewedEnvironment, artifactCatalog.region, repositoryId);
  const commonImageArguments = ["artifacts", "docker", "images", "list"];
  const imageList = (packageName) =>
    runGcloudJson(
      [
        ...commonImageArguments,
        `${repositoryPath}/${packageName}`,
        "--include-tags",
        "--format=json",
      ],
      `${packageName} images`,
    );

  return {
    logEntries: runGcloudJson(
      [
        "logging",
        "read",
        `protoPayload.serviceName="artifactregistry.googleapis.com" AND protoPayload.request.parent="${parent}" AND protoPayload.request.validateOnly=true`,
        `--resource-names=projects/${reviewedEnvironment.projectId}`,
        `--project=${reviewedEnvironment.projectId}`,
        "--freshness=48h",
        "--format=json",
      ],
      "dry-run audit logs",
    ),
    packageEntries: runGcloudJson(
      [
        "artifacts",
        "packages",
        "list",
        `--project=${reviewedEnvironment.projectId}`,
        `--location=${artifactCatalog.region}`,
        `--repository=${repositoryId}`,
        "--format=json",
      ],
      "packages",
    ),
    applicationImages: imageList(artifactCatalog.cleanup.applicationPackage),
    smokeImages: imageList(artifactCatalog.cleanup.permissionSmokePackage),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const environment = parseEnvironment(process.argv.slice(2));
    const artifactCatalog = readJson(join(infrastructureRoot, "artifact-catalog.json"));
    const reviewed = readJson(join(infrastructureRoot, "inventory/reviewed-environments.json"));
    const reviewedEnvironment = reviewed.environments[environment];
    const live = collectLiveInputs(environment, reviewedEnvironment, artifactCatalog);
    process.stdout.write(
      `${JSON.stringify(
        buildArtifactCleanupPreview({
          environment,
          reviewedEnvironment,
          artifactCatalog,
          ...live,
        }),
        null,
        2,
      )}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
