import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const infrastructureRoot = join(repositoryRoot, "infrastructure/google-cloud");

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
        orasSetupAction: "oras-project/setup-oras@22ce207df3b08e061f537244349aac6ae1d214f6",
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
  return (
    /^[a-z0-9]+(?:[._/-][a-z0-9]+)*$/.test(imagePath) &&
    !artifactCatalog.reservedRuntimeImagePaths.some(
      (reserved) => imagePath === reserved || imagePath.startsWith(`${reserved}/`),
    )
  );
}

function validateSource(catalog) {
  const moduleSource = ["main.tf", "outputs.tf", "variables.tf"]
    .map((file) =>
      readFileSync(join(infrastructureRoot, "modules/artifact-registry-foundation", file), "utf8"),
    )
    .join("\n");
  const platformSource = readFileSync(join(infrastructureRoot, "platform/main.tf"), "utf8");
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
  ]) {
    assertArtifact(moduleSource.includes(required), `artifact module is missing ${required}`);
  }
  for (const forbidden of [
    "allUsers",
    "allAuthenticatedUsers",
    "cleanup_policies",
    "force_destroy",
  ]) {
    assertArtifact(!moduleSource.includes(forbidden), `artifact module contains ${forbidden}`);
  }
  assertArtifact(
    platformSource.includes(
      'artifact_catalog         = jsondecode(file("${path.module}/../artifact-catalog.json"))',
    ),
    "platform root does not use the artifact catalog",
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
