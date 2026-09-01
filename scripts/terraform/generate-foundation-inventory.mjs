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

function requireMatchingOutput(environment, bootstrap, platform, reviewed, serviceCatalog) {
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
  const serviceCatalog = readJson(join(infrastructureRoot, "service-catalog.json"));
  const environments = {};

  for (const environment of ["uat", "production"]) {
    const bootstrap = readJson(args[`${environment}-bootstrap`]);
    const platform = readJson(args[`${environment}-platform`]);
    const reviewed = reviewedInventory.environments[environment];
    requireMatchingOutput(environment, bootstrap, platform, reviewed, serviceCatalog);
    environments[environment] = {
      project: bootstrap.project,
      state: {
        bucket: bootstrap.state_bucket,
        bootstrapPrefix: bootstrap.state_prefix,
        platformPrefix: platform.state_prefix,
        directPrincipals: bootstrap.direct_state_principals,
        inheritedAdministratorAccess:
          reviewedAccess.environments[environment].projectInheritedStateAccess,
      },
      enabledServices: [...bootstrap.enabled_services, ...platform.enabled_services].sort(),
    };
  }

  const inventory = {
    schemaVersion: 1,
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
