import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const infrastructureRoot = join(repositoryRoot, "infrastructure/google-cloud");

function assertSecret(condition, message) {
  if (!condition) {
    throw new Error(`terraform_secret_contract_invalid: ${message}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function validateSecretCatalog(catalog, identityCatalog) {
  assertSecret(catalog.schemaVersion === 1, "secret catalog schema differs");
  assertSecret(catalog.replicationRegion === "europe-west3", "replication region differs");
  assertSecret(
    JSON.stringify(Object.keys(catalog.secrets).sort()) ===
      JSON.stringify(["openaiApiKey", "supabaseServiceRole"]),
    "secret purposes differ",
  );
  assertSecret(
    JSON.stringify(catalog.secrets.openaiApiKey) ===
      JSON.stringify({
        suffix: "openai-api-key",
        purposeLabel: "openai-api-key",
        accessorServiceAccountKeys: ["web"],
      }),
    "OpenAI secret contract differs",
  );
  assertSecret(
    JSON.stringify(catalog.secrets.supabaseServiceRole) ===
      JSON.stringify({
        suffix: "supabase-service-role",
        purposeLabel: "supabase-service-role",
        accessorServiceAccountKeys: ["activationWorker", "reconciliation", "web"],
      }),
    "Supabase secret contract differs",
  );

  for (const secret of Object.values(catalog.secrets)) {
    assertSecret(/^[a-z0-9-]+$/.test(secret.suffix), `invalid secret suffix ${secret.suffix}`);
    assertSecret(
      secret.accessorServiceAccountKeys.every((key) => identityCatalog.serviceAccounts[key]),
      `${secret.suffix} references an unknown service account`,
    );
    assertSecret(
      new Set(secret.accessorServiceAccountKeys).size === secret.accessorServiceAccountKeys.length,
      `${secret.suffix} repeats an accessor`,
    );
  }
}

function validateSource() {
  const moduleSource = ["main.tf", "outputs.tf", "variables.tf"]
    .map((file) =>
      readFileSync(join(infrastructureRoot, "modules/secret-foundation", file), "utf8"),
    )
    .join("\n");
  const platformSource = readFileSync(join(infrastructureRoot, "platform/main.tf"), "utf8");

  for (const forbidden of [
    "google_secret_manager_secret_version",
    "google_secret_manager_secret_version_access",
    "secret_data",
    'version = "latest"',
    "versions/latest",
  ]) {
    assertSecret(!moduleSource.includes(forbidden), `secret module contains ${forbidden}`);
    assertSecret(!platformSource.includes(forbidden), `platform root contains ${forbidden}`);
  }
  for (const required of [
    'resource "google_secret_manager_secret" "secrets"',
    'resource "google_secret_manager_secret_iam_member" "accessors"',
    'role      = "roles/secretmanager.secretAccessor"',
    "user_managed",
    "location = var.region",
    "prevent_destroy = true",
  ]) {
    assertSecret(moduleSource.includes(required), `secret module is missing ${required}`);
  }
  assertSecret(
    platformSource.includes(
      'secret_catalog           = jsondecode(file("${path.module}/../secret-catalog.json"))',
    ),
    "platform root does not use the reviewed secret catalog",
  );
}

export function validateSecretContract() {
  const catalog = readJson(join(infrastructureRoot, "secret-catalog.json"));
  const identityCatalog = readJson(join(infrastructureRoot, "identity-catalog.json"));
  validateSecretCatalog(catalog, identityCatalog);
  validateSource();
  return {
    accessBindingsPerEnvironment: Object.values(catalog.secrets).reduce(
      (total, secret) => total + secret.accessorServiceAccountKeys.length,
      0,
    ),
    replicationRegion: catalog.replicationRegion,
    secretsPerEnvironment: Object.keys(catalog.secrets).length,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify({ status: "passed", ...validateSecretContract() })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
