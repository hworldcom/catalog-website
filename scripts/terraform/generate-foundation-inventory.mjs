import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const infrastructureRoot = join(repositoryRoot, "infrastructure/google-cloud");

function parseArguments(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith("--") || !value) {
      throw new Error("terraform_foundation_inventory_arguments_invalid");
    }
    result[name.slice(2)] = resolve(value);
  }
  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function expectedSecretContainers(reviewedIdentity, secretCatalog) {
  return Object.fromEntries(
    Object.entries(reviewedIdentity.secretContainers).map(([key, secret]) => [
      key,
      {
        accessor_members: secret.accessorServiceAccountKeys
          .map(
            (accountKey) => `serviceAccount:${reviewedIdentity.serviceAccounts[accountKey].email}`,
          )
          .sort(),
        name: secret.name,
        purpose_label: secretCatalog.secrets[key].purposeLabel,
        replication: secretCatalog.replicationRegion,
        secret_id: secret.secretId,
      },
    ]),
  );
}

function expectedArtifactRepository(reviewedArtifact) {
  return {
    format: reviewedArtifact.format,
    immutable_tags: reviewedArtifact.immutableTags,
    inherited_cloud_run_service_agent: reviewedArtifact.inheritedCloudRunServiceAgent,
    location: reviewedArtifact.location,
    mode: reviewedArtifact.mode,
    name: reviewedArtifact.name,
    purpose_label: reviewedArtifact.purposeLabel,
    reader_members: reviewedArtifact.readerMembers,
    registry_host: reviewedArtifact.registryHost,
    repository_id: reviewedArtifact.repositoryId,
    repository_path: reviewedArtifact.repositoryPath,
    reserved_runtime_image_paths: reviewedArtifact.reservedRuntimeImagePaths,
    writer_members: reviewedArtifact.writerMembers,
  };
}

function requireMatchingOutput(
  environment,
  bootstrap,
  platform,
  reviewed,
  serviceCatalog,
  identityAccess,
  secretCatalog,
) {
  for (const output of [bootstrap, platform]) {
    if (
      output.environment !== environment ||
      output.project.project_id !== reviewed.projectId ||
      output.project.project_number !== reviewed.projectNumber ||
      output.project.organization_id !== reviewed.organizationId ||
      output.project.billing_account_id !== reviewed.billingAccountId ||
      output.project.region !== reviewed.region ||
      output.state_bucket !== reviewed.stateBucket
    ) {
      throw new Error(`terraform_foundation_inventory_mismatch: ${environment}`);
    }
  }
  if (
    JSON.stringify(bootstrap.enabled_services) !== JSON.stringify(serviceCatalog.bootstrap) ||
    JSON.stringify(platform.enabled_services) !== JSON.stringify(serviceCatalog.platform)
  ) {
    throw new Error(`terraform_foundation_inventory_service_mismatch: ${environment}`);
  }

  const reviewedIdentity = identityAccess.environments[environment];
  if (
    JSON.stringify(bootstrap.identity.service_accounts) !==
      JSON.stringify(reviewedIdentity.serviceAccounts) ||
    bootstrap.identity.federation.pool.name !== reviewedIdentity.federation.pool ||
    bootstrap.identity.federation.providers.artifact.name !==
      reviewedIdentity.federation.providers.artifact ||
    bootstrap.identity.federation.providers.terraform.name !==
      reviewedIdentity.federation.providers.terraform
  ) {
    throw new Error(`terraform_foundation_inventory_identity_mismatch: ${environment}`);
  }
  if (
    JSON.stringify(platform.secret_containers) !==
    JSON.stringify(expectedSecretContainers(reviewedIdentity, secretCatalog))
  ) {
    throw new Error(`terraform_foundation_inventory_secret_mismatch: ${environment}`);
  }
  if (
    JSON.stringify(platform.artifact_repository) !==
    JSON.stringify(expectedArtifactRepository(reviewedIdentity.artifactRepository))
  ) {
    throw new Error(`terraform_foundation_inventory_artifact_mismatch: ${environment}`);
  }
}

try {
  const args = parseArguments(process.argv.slice(2));
  const required = [
    "uat-bootstrap",
    "uat-platform",
    "production-bootstrap",
    "production-platform",
    "output",
  ];
  if (required.some((name) => !args[name])) {
    throw new Error("terraform_foundation_inventory_arguments_invalid");
  }

  const reviewedInventory = readJson(
    join(infrastructureRoot, "inventory/reviewed-environments.json"),
  );
  const reviewedAccess = readJson(
    join(infrastructureRoot, "inventory/reviewed-administrator-access.json"),
  );
  const identityAccess = readJson(
    join(infrastructureRoot, "inventory/reviewed-identity-access.json"),
  );
  const serviceCatalog = readJson(join(infrastructureRoot, "service-catalog.json"));
  const secretCatalog = readJson(join(infrastructureRoot, "secret-catalog.json"));
  const environments = {};

  for (const environment of ["uat", "production"]) {
    const bootstrap = readJson(args[`${environment}-bootstrap`]);
    const platform = readJson(args[`${environment}-platform`]);
    const reviewed = reviewedInventory.environments[environment];
    requireMatchingOutput(
      environment,
      bootstrap,
      platform,
      reviewed,
      serviceCatalog,
      identityAccess,
      secretCatalog,
    );
    environments[environment] = {
      artifactRepository: platform.artifact_repository,
      project: bootstrap.project,
      state: {
        bucket: bootstrap.state_bucket,
        bootstrapPrefix: bootstrap.state_prefix,
        platformPrefix: platform.state_prefix,
        directBindings: bootstrap.direct_state_bindings,
        directPrincipals: bootstrap.direct_state_principals,
        inheritedAdministratorAccess:
          reviewedAccess.environments[environment].projectInheritedStateAccess,
      },
      identity: bootstrap.identity,
      secretContainers: platform.secret_containers,
      reviewedAccessBindings: identityAccess.environments[environment].bindings,
      enabledServices: [...bootstrap.enabled_services, ...platform.enabled_services].sort(),
    };
  }

  const inventory = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    terraformVersion: reviewedInventory.terraformVersion,
    googleProviderConstraint: reviewedInventory.googleProviderConstraint,
    environments,
  };
  writeFileSync(args.output, `${JSON.stringify(inventory, null, 2)}\n`, { mode: 0o644 });
  process.stdout.write(`${JSON.stringify({ status: "passed", output: args.output })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
