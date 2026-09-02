import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const infrastructureRoot = join(repositoryRoot, "infrastructure/google-cloud");
const environmentNames = ["uat", "production"];
const terraformVersion = "1.15.9";
const googleProviderConstraint = "~> 7.46.0";
const publicWebsiteRuntimeModule =
  "infrastructure/google-cloud/modules/runtime-activation-platform/main.tf";

function assertContract(condition, message) {
  if (!condition) {
    throw new Error(`terraform_foundation_contract_invalid: ${message}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readBackend(path) {
  return Object.fromEntries(
    [...readFileSync(path, "utf8").matchAll(/^([a-z_]+)\s*=\s*"([^"]+)"\s*$/gm)].map(
      ([, key, value]) => [key, value],
    ),
  );
}

function listFiles(path) {
  return readdirSync(path).flatMap((entry) => {
    const child = join(path, entry);
    return statSync(child).isDirectory() ? listFiles(child) : [child];
  });
}

export function anonymousAccessIsAllowed(relativePath, source) {
  const anonymousMemberCount = (source.match(/member\s*=\s*"allUsers"/g) ?? []).length;
  return (
    anonymousMemberCount === 0 ||
    (relativePath === publicWebsiteRuntimeModule && anonymousMemberCount === 1)
  );
}

export function validateEnvironmentIsolation(inventory) {
  assertContract(inventory.schemaVersion === 1, "inventory schemaVersion must be 1");
  assertContract(
    inventory.terraformVersion === terraformVersion,
    `inventory Terraform version must be ${terraformVersion}`,
  );
  assertContract(
    inventory.googleProviderConstraint === googleProviderConstraint,
    `inventory Google provider constraint must be ${googleProviderConstraint}`,
  );

  const environments = inventory.environments;
  assertContract(environments && typeof environments === "object", "environments are required");
  assertContract(
    Object.keys(environments).sort().join(",") === [...environmentNames].sort().join(","),
    "inventory must contain only production and uat",
  );

  for (const environment of environmentNames) {
    const value = environments[environment];
    assertContract(
      value.projectId !== "catalog-classifier",
      `${environment} uses the legacy project`,
    );
    assertContract(value.region === "europe-west3", `${environment} must use europe-west3`);
    assertContract(/^\d+$/.test(value.projectNumber), `${environment} project number is invalid`);
    assertContract(/^\d+$/.test(value.organizationId), `${environment} organization is invalid`);
    assertContract(
      /^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$/.test(value.billingAccountId),
      `${environment} billing account is invalid`,
    );
    assertContract(
      value.stateBucket === `${value.projectId}-tfstate`,
      `${environment} state bucket is not derived from its project identifier`,
    );
    assertContract(
      /^(user|group):[^\s]+@[^\s]+$/.test(value.bootstrapOperatorPrincipal),
      `${environment} bootstrap operator is invalid`,
    );
    assertContract(
      value.githubRepository === "hworldcom/catalog-website",
      `${environment} GitHub repository is invalid`,
    );
    assertContract(value.githubOwner === "hworldcom", `${environment} GitHub owner is invalid`);
    assertContract(
      /^\d+$/.test(value.githubRepositoryId),
      `${environment} GitHub repository identifier is invalid`,
    );
    assertContract(
      /^\d+$/.test(value.githubOwnerId),
      `${environment} GitHub owner identifier is invalid`,
    );
  }

  const uat = environments.uat;
  const production = environments.production;
  assertContract(uat.projectId !== production.projectId, "project identifiers must differ");
  assertContract(uat.projectNumber !== production.projectNumber, "project numbers must differ");
  assertContract(uat.stateBucket !== production.stateBucket, "state buckets must differ");
}

function validateEnvironmentFiles(inventory) {
  for (const environment of environmentNames) {
    const reviewed = inventory.environments[environment];
    const directory = join(infrastructureRoot, "environments", environment);
    const expectedBase = {
      billing_account_id: reviewed.billingAccountId,
      environment,
      organization_id: reviewed.organizationId,
      project_id: reviewed.projectId,
      project_number: reviewed.projectNumber,
      region: reviewed.region,
      state_bucket_name: reviewed.stateBucket,
    };
    const bootstrap = readJson(join(directory, "bootstrap.tfvars.json"));
    const platform = readJson(join(directory, "platform.tfvars.json"));

    assertContract(
      JSON.stringify(bootstrap) ===
        JSON.stringify({
          billing_account_id: expectedBase.billing_account_id,
          bootstrap_operator_principal: reviewed.bootstrapOperatorPrincipal,
          environment: expectedBase.environment,
          github_owner: reviewed.githubOwner,
          github_owner_id: reviewed.githubOwnerId,
          github_repository: reviewed.githubRepository,
          github_repository_id: reviewed.githubRepositoryId,
          organization_id: expectedBase.organization_id,
          project_id: expectedBase.project_id,
          project_number: expectedBase.project_number,
          region: expectedBase.region,
          state_bucket_name: expectedBase.state_bucket_name,
        }),
      `${environment} bootstrap variables differ from the reviewed inventory`,
    );
    assertContract(
      JSON.stringify(platform) === JSON.stringify(expectedBase),
      `${environment} platform variables differ from the reviewed inventory`,
    );

    for (const root of ["bootstrap", "platform"]) {
      const backend = readBackend(join(directory, `${root}.gcs.tfbackend`));
      assertContract(
        backend.bucket === reviewed.stateBucket,
        `${environment} ${root} backend bucket differs`,
      );
      assertContract(
        backend.prefix === `terraform/${root}`,
        `${environment} ${root} backend prefix differs`,
      );
      assertContract(
        Object.keys(backend).length === 2,
        `${environment} ${root} backend has unknown values`,
      );
    }
  }
}

function validateServiceCatalog() {
  const catalog = readJson(join(infrastructureRoot, "service-catalog.json"));
  const expectedBootstrap = [
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "storage.googleapis.com",
  ];
  const expectedPlatform = [
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "certificatemanager.googleapis.com",
    "cloudbilling.googleapis.com",
    "cloudscheduler.googleapis.com",
    "cloudtasks.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sts.googleapis.com",
  ];

  assertContract(
    JSON.stringify(catalog.bootstrap) === JSON.stringify(expectedBootstrap),
    "bootstrap API catalog differs from the reviewed contract",
  );
  assertContract(
    JSON.stringify(catalog.platform) === JSON.stringify(expectedPlatform),
    "platform API catalog differs from the reviewed contract",
  );
  const allServices = [...catalog.bootstrap, ...catalog.platform];
  assertContract(new Set(allServices).size === allServices.length, "API catalogs overlap");
  assertContract(
    !allServices.includes("containeranalysis.googleapis.com"),
    "Google Container Analysis is deferred",
  );
}

function validateTerraformSource() {
  assertContract(
    readFileSync(join(repositoryRoot, ".terraform-version"), "utf8").trim() === terraformVersion,
    "root .terraform-version differs from the reviewed version",
  );

  for (const root of [
    "bootstrap",
    "platform",
    "modules/runtime-activation-platform",
    "modules/custom-domain-load-balancer",
  ]) {
    const versions = readFileSync(join(infrastructureRoot, root, "versions.tf"), "utf8");
    const lock = readFileSync(join(infrastructureRoot, root, ".terraform.lock.hcl"), "utf8");
    assertContract(
      versions.includes(`required_version = "= ${terraformVersion}"`),
      `${root} does not pin the exact Terraform version`,
    );
    assertContract(
      versions.includes(`version = "${googleProviderConstraint}"`),
      `${root} does not use the reviewed Google provider constraint`,
    );
    if (root === "platform") {
      assertContract(
        readFileSync(join(infrastructureRoot, root, "backend.tf"), "utf8").includes(
          'backend "gcs"',
        ),
        "platform does not declare the Google Cloud Storage backend",
      );
    }
    assertContract(
      lock.includes('version     = "7.46.0"'),
      `${root} lock does not pin Google 7.46.0`,
    );
    assertContract(
      [...lock.matchAll(/"h1:[^"]+"/g)].length >= 2,
      `${root} lock is missing one or more supported platform checksums`,
    );
  }

  const backendGenerator = readFileSync(
    join(repositoryRoot, "scripts/terraform/configure-bootstrap-backend.mjs"),
    "utf8",
  );
  assertContract(
    backendGenerator.includes('backend "local"') && backendGenerator.includes('backend "gcs"'),
    "bootstrap backend generator must support local bootstrap and Google Cloud Storage migration",
  );

  const stateSource = readFileSync(
    join(infrastructureRoot, "modules/state-bucket/main.tf"),
    "utf8",
  );
  for (const required of [
    "force_destroy               = false",
    "uniform_bucket_level_access = true",
    'public_access_prevention    = "enforced"',
    "enabled = true",
    "prevent_destroy = true",
  ]) {
    assertContract(stateSource.includes(required), `state bucket is missing: ${required}`);
  }

  const configurationFiles = listFiles(infrastructureRoot).filter(
    (path) =>
      !path.includes("/.terraform/") &&
      !path.endsWith(".terraform.lock.hcl") &&
      [".tf", ".json", ".tfbackend"].some((extension) => path.endsWith(extension)),
  );
  const forbiddenValuePatterns = [
    /sb_secret_[A-Za-z0-9_-]+/,
    /sk-[A-Za-z0-9_-]{12,}/,
    /postgres(?:ql)?:\/\//i,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ];
  for (const path of configurationFiles) {
    const source = readFileSync(path, "utf8");
    const relativePath = relative(repositoryRoot, path);
    assertContract(
      anonymousAccessIsAllowed(relativePath, source),
      `${relativePath} grants anonymous access outside the public website boundary`,
    );
    assertContract(
      !source.includes("allAuthenticatedUsers"),
      `${relativePath} grants public authenticated access`,
    );
    for (const pattern of forbiddenValuePatterns) {
      assertContract(!pattern.test(source), `${relativePath} contains a secret-shaped value`);
    }
  }
}

export function validateFoundationContract() {
  const inventory = readJson(join(infrastructureRoot, "inventory/reviewed-environments.json"));
  validateEnvironmentIsolation(inventory);
  validateEnvironmentFiles(inventory);
  validateServiceCatalog();
  validateTerraformSource();
  return {
    environments: environmentNames,
    googleProviderConstraint,
    terraformVersion,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = validateFoundationContract();
    process.stdout.write(`${JSON.stringify({ status: "passed", ...result })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
