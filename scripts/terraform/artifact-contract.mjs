import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const infrastructureRoot = join(repositoryRoot, "infrastructure/google-cloud");
const commitSuffixPattern = /^[0-9a-f]{40}$/;

function assertArtifact(condition, message) {
  if (!condition) {
    throw new Error(`terraform_artifact_contract_invalid: ${message}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function environmentAbbreviation(environment) {
  return environment === "production" ? "prod" : "uat";
}

export function validateArtifactCatalog(catalog, identityCatalog) {
  assertArtifact(catalog.schemaVersion === 1, "artifact catalog schema differs");
  assertArtifact(catalog.region === "europe-west3", "repository region differs");
  assertArtifact(
    JSON.stringify(catalog.cleanup) ===
      JSON.stringify({
        activationEnabledEnvironments: [],
        applicationPackage: "bazoria-web",
        environmentRetentionDays: {
          production: 30,
          uat: 14,
        },
        keepRecentVersionCount: 5,
        permissionSmokePackage: "permission-smoke",
        permissionSmokeRetentionDays: 7,
        permissionSmokeTagPrefix: "latest",
        policyIds: {
          deleteApplicationByAge: "delete-bazoria-web-by-age",
          deleteSupersededPermissionSmoke: "delete-superseded-permission-smoke",
          keepProtectedApplicationTags: "keep-bazoria-web-protected-tags",
          keepRecentApplicationVersions: "keep-recent-bazoria-web",
          keepPermissionSmokeLatest: "keep-permission-smoke-latest",
        },
        protectedApplicationTagPrefixes: ["deployed-", "rollback-", "promotion-eligible-"],
      }),
    "cleanup contract differs",
  );
  assertArtifact(
    JSON.stringify(catalog.repository) ===
      JSON.stringify({
        format: "DOCKER",
        immutableTags: false,
        mode: "STANDARD_REPOSITORY",
        purposeLabel: "container-images",
        readerServiceAccountKeys: ["terraform"],
        suffix: "containers",
        writerServiceAccountKeys: ["artifactRelease"],
      }),
    "repository contract differs",
  );
  assertArtifact(
    catalog.inheritedServiceAgentRole === "roles/run.serviceAgent",
    "inherited Cloud Run role differs",
  );
  assertArtifact(
    JSON.stringify(catalog.reservedRuntimeImagePaths) === JSON.stringify(["permission-smoke"]),
    "reserved runtime image paths differ",
  );
  assertArtifact(
    JSON.stringify(catalog.smokeArtifact) ===
      JSON.stringify({
        artifactType: "application/vnd.bazoria.permission-smoke.v1",
        deniedCrossEnvironmentPermissions: [
          "artifactregistry.files.upload",
          "artifactregistry.repositories.uploadArtifacts",
          "artifactregistry.tags.create",
          "artifactregistry.tags.update",
        ],
        fixturePath: "infrastructure/google-cloud/fixtures/permission-smoke.json",
        imagePath: "permission-smoke",
        maxBytes: 1024,
        mediaType: "application/vnd.bazoria.permission-smoke.v1+json",
        orasSetupAction: "oras-project/setup-oras@1d808f7d7f6995cc68b7bf507bfe5c5446e1dc9d",
        orasVersion: "1.3.3",
        tag: "latest",
      }),
    "permission-smoke contract differs",
  );

  for (const key of [
    ...catalog.repository.readerServiceAccountKeys,
    ...catalog.repository.writerServiceAccountKeys,
  ]) {
    assertArtifact(Boolean(identityCatalog.serviceAccounts[key]), `unknown service account ${key}`);
  }
  assertArtifact(
    catalog.smokeArtifact.imagePath === catalog.reservedRuntimeImagePaths[0],
    "permission-smoke path is not reserved",
  );
}

export function artifactPackageNameIsReviewed(packageName, artifactCatalog) {
  return [
    artifactCatalog.cleanup.applicationPackage,
    artifactCatalog.cleanup.permissionSmokePackage,
  ].includes(packageName);
}

export function artifactTagIsReviewed({ environment, packageName, tag, artifactCatalog }) {
  if (packageName === artifactCatalog.cleanup.permissionSmokePackage) {
    return tag === artifactCatalog.smokeArtifact.tag;
  }
  if (packageName !== artifactCatalog.cleanup.applicationPackage) {
    return false;
  }
  if (tag.startsWith("release-")) {
    return commitSuffixPattern.test(tag.slice("release-".length));
  }
  if (tag.startsWith("promotion-eligible-")) {
    return (
      environment === "uat" && commitSuffixPattern.test(tag.slice("promotion-eligible-".length))
    );
  }
  if (tag.startsWith("deployed-") || tag.startsWith("rollback-")) {
    return environment === "uat"
      ? tag === "deployed-uat"
      : ["deployed-production", "rollback-production"].includes(tag);
  }
  return false;
}

export function buildArtifactCleanupContract({ environment, artifactCatalog }) {
  const cleanup = artifactCatalog.cleanup;
  const condition = ({ tagState, tagPrefixes = [], packageNamePrefixes, olderThan = null }) => ({
    newerThan: null,
    olderThan,
    packageNamePrefixes: [...packageNamePrefixes].sort(),
    tagPrefixes: [...tagPrefixes].sort(),
    tagState,
    versionNamePrefixes: [],
  });
  const policies = [
    {
      action: "KEEP",
      condition: condition({
        tagState: "TAGGED",
        tagPrefixes: cleanup.protectedApplicationTagPrefixes,
        packageNamePrefixes: [cleanup.applicationPackage],
      }),
      id: cleanup.policyIds.keepProtectedApplicationTags,
      mostRecentVersions: null,
    },
    {
      action: "KEEP",
      condition: null,
      id: cleanup.policyIds.keepRecentApplicationVersions,
      mostRecentVersions: {
        keepCount: cleanup.keepRecentVersionCount,
        packageNamePrefixes: [cleanup.applicationPackage],
      },
    },
    {
      action: "DELETE",
      condition: condition({
        tagState: "ANY",
        packageNamePrefixes: [cleanup.applicationPackage],
        olderThan: `${cleanup.environmentRetentionDays[environment] * 86400}s`,
      }),
      id: cleanup.policyIds.deleteApplicationByAge,
      mostRecentVersions: null,
    },
    {
      action: "KEEP",
      condition: condition({
        tagState: "TAGGED",
        tagPrefixes: [cleanup.permissionSmokeTagPrefix],
        packageNamePrefixes: [cleanup.permissionSmokePackage],
      }),
      id: cleanup.policyIds.keepPermissionSmokeLatest,
      mostRecentVersions: null,
    },
    {
      action: "DELETE",
      condition: condition({
        tagState: "UNTAGGED",
        packageNamePrefixes: [cleanup.permissionSmokePackage],
        olderThan: `${cleanup.permissionSmokeRetentionDays * 86400}s`,
      }),
      id: cleanup.policyIds.deleteSupersededPermissionSmoke,
      mostRecentVersions: null,
    },
  ].sort((left, right) => left.id.localeCompare(right.id));

  return {
    dryRun: !cleanup.activationEnabledEnvironments.includes(environment),
    policies,
  };
}

export function normalizeArtifactCleanupPlan(repository) {
  const block = (value) => (Array.isArray(value) ? value[0] : value) ?? null;
  const list = (value) => [...(value ?? [])].sort();
  const optional = (value) => (value === "" || value === undefined ? null : value);
  const policies = (repository.cleanup_policies ?? []).map((policy) => {
    const condition = block(policy.condition);
    const mostRecent = block(policy.most_recent_versions);
    return {
      action: policy.action,
      condition:
        condition === null
          ? null
          : {
              newerThan: optional(condition.newer_than),
              olderThan: optional(condition.older_than),
              packageNamePrefixes: list(condition.package_name_prefixes),
              tagPrefixes: list(condition.tag_prefixes),
              tagState: condition.tag_state,
              versionNamePrefixes: list(condition.version_name_prefixes),
            },
      id: policy.id,
      mostRecentVersions:
        mostRecent === null
          ? null
          : {
              keepCount: mostRecent.keep_count,
              packageNamePrefixes: list(mostRecent.package_name_prefixes),
            },
    };
  });
  return {
    dryRun: repository.cleanup_policy_dry_run,
    policies: policies.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function buildArtifactRepositoryInventory({
  environment,
  reviewedEnvironment,
  identityCatalog,
  artifactCatalog,
}) {
  const abbreviation = environmentAbbreviation(environment);
  const repositoryId = `bazoria-${abbreviation}-${artifactCatalog.repository.suffix}`;
  const accountEmail = (key) =>
    `baz-${abbreviation}-${identityCatalog.serviceAccounts[key].suffix}@${reviewedEnvironment.projectId}.iam.gserviceaccount.com`;

  return {
    format: artifactCatalog.repository.format,
    immutableTags: artifactCatalog.repository.immutableTags,
    inheritedCloudRunServiceAgent: {
      principal: `serviceAccount:service-${reviewedEnvironment.projectNumber}@serverless-robot-prod.iam.gserviceaccount.com`,
      role: artifactCatalog.inheritedServiceAgentRole,
      scope: `projects/${reviewedEnvironment.projectId}`,
    },
    location: artifactCatalog.region,
    mode: artifactCatalog.repository.mode,
    name: `projects/${reviewedEnvironment.projectId}/locations/${artifactCatalog.region}/repositories/${repositoryId}`,
    purposeLabel: artifactCatalog.repository.purposeLabel,
    readerMembers: artifactCatalog.repository.readerServiceAccountKeys.map(
      (key) => `serviceAccount:${accountEmail(key)}`,
    ),
    registryHost: `${artifactCatalog.region}-docker.pkg.dev`,
    repositoryId,
    repositoryPath: `${artifactCatalog.region}-docker.pkg.dev/${reviewedEnvironment.projectId}/${repositoryId}`,
    reservedRuntimeImagePaths: [...artifactCatalog.reservedRuntimeImagePaths],
    writerMembers: artifactCatalog.repository.writerServiceAccountKeys.map(
      (key) => `serviceAccount:${accountEmail(key)}`,
    ),
  };
}

export function runtimeImagePathIsAllowed(imagePath, artifactCatalog) {
  return imagePath === artifactCatalog.cleanup.applicationPackage;
}

function validateSource(catalog) {
  const moduleSource = ["main.tf", "outputs.tf", "variables.tf"]
    .map((file) =>
      readFileSync(join(infrastructureRoot, "modules/artifact-registry-foundation", file), "utf8"),
    )
    .join("\n");
  const platformSource = readFileSync(join(infrastructureRoot, "platform/main.tf"), "utf8");
  const runtimeCatalog = readJson(join(infrastructureRoot, "runtime-catalog.json"));
  const previewSource = readFileSync(
    join(repositoryRoot, "scripts/terraform/artifact-cleanup-preview.mjs"),
    "utf8",
  );
  const workflowSource = readFileSync(
    join(repositoryRoot, ".github/workflows/artifact-release.yml"),
    "utf8",
  );
  const fixturePath = join(repositoryRoot, catalog.smokeArtifact.fixturePath);

  for (const required of [
    'resource "google_artifact_registry_repository" "containers"',
    'resource "google_artifact_registry_repository_iam_member" "writers"',
    'resource "google_artifact_registry_repository_iam_member" "readers"',
    'role       = "roles/artifactregistry.writer"',
    'role       = "roles/artifactregistry.reader"',
    "prevent_destroy = true",
    "var.repository.immutable_tags == false",
    "cleanup_policy_dry_run = var.cleanup_policy_dry_run",
    "id     = var.cleanup.policy_ids.keepProtectedApplicationTags",
    "id     = var.cleanup.policy_ids.keepRecentApplicationVersions",
    "id     = var.cleanup.policy_ids.deleteApplicationByAge",
    "id     = var.cleanup.policy_ids.keepPermissionSmokeLatest",
    "id     = var.cleanup.policy_ids.deleteSupersededPermissionSmoke",
  ]) {
    assertArtifact(moduleSource.includes(required), `artifact module is missing ${required}`);
  }
  for (const forbidden of ["allUsers", "allAuthenticatedUsers", "force_destroy"]) {
    assertArtifact(!moduleSource.includes(forbidden), `artifact module contains ${forbidden}`);
  }
  assertArtifact(
    platformSource.includes(
      'artifact_catalog         = jsondecode(file("${path.module}/../artifact-catalog.json"))',
    ),
    "platform root does not use the artifact catalog",
  );
  assertArtifact(
    platformSource.includes('check "artifact_cleanup_activation_is_reviewed"'),
    "platform root lacks the cleanup activation gate",
  );
  assertArtifact(
    runtimeCatalog.imagePath === catalog.cleanup.applicationPackage,
    "runtime image package differs",
  );
  for (const environment of ["uat", "production"]) {
    const variables = readJson(
      join(infrastructureRoot, `environments/${environment}/platform.tfvars.json`),
    );
    assertArtifact(variables.cleanup_policy_dry_run === true, `${environment} cleanup is active`);
  }
  for (const required of [
    'protoPayload.serviceName="artifactregistry.googleapis.com"',
    "protoPayload.request.validateOnly=true",
    '"--freshness=48h"',
    "protected artifact is a cleanup candidate",
    "reserved package prefix collision",
    "dry-run preview is inconclusive",
  ]) {
    assertArtifact(previewSource.includes(required), `cleanup preview is missing ${required}`);
  }
  assertArtifact(
    !/sha256:[0-9a-f]{64}/.test(`${moduleSource}\n${platformSource}\n${previewSource}`),
    "cleanup source contains a full artifact digest",
  );

  assertArtifact(
    statSync(fixturePath).size <= catalog.smokeArtifact.maxBytes,
    "permission-smoke fixture is too large",
  );
  assertArtifact(
    readFileSync(fixturePath, "utf8") ===
      '{ "purpose": "artifact-release-permission-smoke", "schemaVersion": 1 }\n',
    "permission-smoke fixture differs",
  );
  for (const required of [
    catalog.smokeArtifact.orasSetupAction,
    `version: ${catalog.smokeArtifact.orasVersion}`,
    catalog.smokeArtifact.artifactType,
    catalog.smokeArtifact.mediaType,
    `${catalog.smokeArtifact.imagePath}:${catalog.smokeArtifact.tag}`,
    ":testIamPermissions",
    ...catalog.smokeArtifact.deniedCrossEnvironmentPermissions,
  ]) {
    assertArtifact(workflowSource.includes(required), `artifact workflow is missing ${required}`);
  }
  assertArtifact(
    (workflowSource.match(/\boras push\b/g) ?? []).length === 1,
    "artifact workflow must contain exactly one matching-environment push",
  );
}

export function validateArtifactContract() {
  const catalog = readJson(join(infrastructureRoot, "artifact-catalog.json"));
  const identityCatalog = readJson(join(infrastructureRoot, "identity-catalog.json"));
  const reviewed = readJson(join(infrastructureRoot, "inventory/reviewed-environments.json"));
  validateArtifactCatalog(catalog, identityCatalog);
  validateSource(catalog);
  const repositories = Object.fromEntries(
    Object.entries(reviewed.environments).map(([environment, reviewedEnvironment]) => [
      environment,
      buildArtifactRepositoryInventory({
        environment,
        reviewedEnvironment,
        identityCatalog,
        artifactCatalog: catalog,
      }),
    ]),
  );
  assertArtifact(
    repositories.uat.repositoryPath !== repositories.production.repositoryPath,
    "environment repositories are shared",
  );
  return {
    directBindingsPerEnvironment:
      catalog.repository.readerServiceAccountKeys.length +
      catalog.repository.writerServiceAccountKeys.length,
    region: catalog.region,
    repositoriesPerEnvironment: 1,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(
      `${JSON.stringify({ status: "passed", ...validateArtifactContract() })}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
