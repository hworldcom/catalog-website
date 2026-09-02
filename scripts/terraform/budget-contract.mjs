import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const infrastructureRoot = join(repositoryRoot, "infrastructure/google-cloud");
const budgetRoot = join(infrastructureRoot, "budget");
const environments = {
  uat: {
    projectId: "bazoria-uat-lnlabs",
    projectNumber: "145571383840",
    stateBucket: "bazoria-uat-lnlabs-tfstate",
  },
  production: {
    projectId: "bazoria-prod-lnlabs",
    projectNumber: "787649115343",
    stateBucket: "bazoria-prod-lnlabs-tfstate",
  },
};

function fail(message) {
  throw new Error(`terraform_budget_contract_invalid: ${message}`);
}

function assertBudget(condition, message) {
  if (!condition) fail(message);
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

export function validateBudgetSource(source) {
  for (const required of [
    'resource "google_billing_budget" "monthly"',
    'calendar_period = "MONTH"',
    'deletion_policy = "PREVENT"',
    'ownership_scope = "BILLING_ACCOUNT"',
    'spend_basis       = "CURRENT_SPEND"',
    'threshold_percent = 0.5',
    'threshold_percent = 0.8',
    'threshold_percent = 1.0',
    "disable_default_iam_recipients   = true",
    "enable_project_level_recipients  = false",
    "monitoring_notification_channels = var.notification_channel_names",
    "prevent_destroy = true",
  ]) {
    assertBudget(source.includes(required), `budget source is missing ${required}`);
  }
  assertBudget(
    (source.match(/threshold_percent\s*=\s*/g) ?? []).length === 3,
    "budget must contain exactly three threshold rules",
  );
  for (const forbidden of [
    "pubsub_topic",
    "google_billing_account_iam",
    "email_address",
    "@bazoria.pl",
    "@lnlabs.xyz",
  ]) {
    assertBudget(!source.includes(forbidden), `budget source contains forbidden ${forbidden}`);
  }
}

function validateEnvironmentFiles() {
  const seenBackends = new Set();
  for (const [environment, expected] of Object.entries(environments)) {
    const directory = join(infrastructureRoot, "environments", environment);
    const variables = readJson(join(directory, "budget.tfvars.json"));
    assertBudget(
      JSON.stringify(variables) ===
        JSON.stringify({
          billing_account_id: "014CA9-692646-D9E4CE",
          environment,
          project_id: expected.projectId,
          project_number: expected.projectNumber,
        }),
      `${environment} budget identity variables differ`,
    );
    const backend = readBackend(join(directory, "budget.gcs.tfbackend"));
    assertBudget(backend.bucket === expected.stateBucket, `${environment} budget bucket differs`);
    assertBudget(backend.prefix === "terraform/budget", `${environment} budget prefix differs`);
    assertBudget(Object.keys(backend).length === 2, `${environment} budget backend has extra data`);
    seenBackends.add(`${backend.bucket}/${backend.prefix}`);
  }
  assertBudget(seenBackends.size === 2, "UAT and production budget state must be isolated");
}

function validateIdentityBoundary() {
  const workflowSource = listFiles(join(repositoryRoot, ".github/workflows"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  assertBudget(
    !workflowSource.includes("-chdir=infrastructure/google-cloud/budget"),
    "a GitHub workflow can invoke the operator budget root",
  );
  assertBudget(
    !workflowSource.includes("roles/billing.costsManager"),
    "a GitHub workflow contains billing budget access",
  );

  const ordinaryInfrastructure = listFiles(infrastructureRoot)
    .filter((path) => !path.startsWith(`${budgetRoot}/`))
    .filter((path) => !path.includes("/.terraform/"))
    .filter((path) => !path.endsWith(".lock.hcl"))
    .map((path) => `${relative(repositoryRoot, path)}\n${readFileSync(path, "utf8")}`)
    .join("\n");
  assertBudget(
    !ordinaryInfrastructure.includes("google_billing_account_iam"),
    "ordinary infrastructure grants billing-account access",
  );
}

export function validateBudgetContract() {
  const source = ["main.tf", "outputs.tf", "variables.tf", "versions.tf"]
    .map((file) => readFileSync(join(budgetRoot, file), "utf8"))
    .join("\n");
  validateBudgetSource(source);
  validateEnvironmentFiles();
  validateIdentityBoundary();
  assertBudget(
    readFileSync(join(budgetRoot, "outputs.tf"), "utf8").includes("budget_inventory") &&
      !readFileSync(join(budgetRoot, "outputs.tf"), "utf8").includes("notification_channel"),
    "budget outputs expose channels or omit the reviewed inventory",
  );
  return {
    environments: ["uat", "production"],
    operatorManaged: true,
    thresholds: [0.5, 0.8, 1],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify({ status: "passed", ...validateBudgetContract() })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
