import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const infrastructureRoot = join(repositoryRoot, "infrastructure/google-cloud");

function assertPlan(condition, message) {
  if (!condition) {
    throw new Error(`terraform_foundation_plan_invalid: ${message}`);
  }
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function validateFoundationPlan({ plan, environment, root, inventory, serviceCatalog }) {
  assertPlan(["uat", "production"].includes(environment), "environment is invalid");
  assertPlan(["bootstrap", "platform"].includes(root), "root is invalid");
  assertPlan(plan.terraform_version === "1.15.9", "Terraform version differs");

  const reviewed = inventory.environments[environment];
  assertPlan(Boolean(reviewed), "environment is not in the reviewed inventory");
  const serialized = JSON.stringify(plan);
  for (const pattern of [
    /sb_secret_[A-Za-z0-9_-]+/,
    /sk-[A-Za-z0-9_-]{12,}/,
    /postgres(?:ql)?:\/\//i,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ]) {
    assertPlan(!pattern.test(serialized), "plan contains a secret-shaped value");
  }

  const allowedAddresses = new Set([
    "module.project_contract.terraform_data.verified_project",
    ...serviceCatalog[root].map(
      (service) => `module.${root}_services.google_project_service.enabled[\"${service}\"]`,
    ),
    ...(root === "bootstrap"
      ? [
          "module.state_bucket.google_storage_bucket.state",
          "module.state_bucket.google_storage_bucket_iam_member.bootstrap_operator",
        ]
      : []),
  ]);

  for (const resource of plan.resource_changes ?? []) {
    const actions = resource.change?.actions ?? [];
    assertPlan(allowedAddresses.has(resource.address), `unknown resource ${resource.address}`);
    assertPlan(!actions.includes("delete"), `${resource.address} would delete a resource`);
    assertPlan(!actions.includes("update"), `${resource.address} would update a resource`);
    assertPlan(
      actions.every((action) => ["create", "no-op", "read"].includes(action)),
      `${resource.address} has an unsupported action`,
    );

    const after = resource.change?.after ?? {};
    if (after.project) {
      assertPlan(
        after.project === reviewed.projectId,
        `${resource.address} targets another project`,
      );
    }
    if (resource.address === "module.project_contract.terraform_data.verified_project") {
      assertPlan(after.input?.project_id === reviewed.projectId, "verified project differs");
      assertPlan(after.input?.project_number === reviewed.projectNumber, "project number differs");
      assertPlan(after.input?.organization_id === reviewed.organizationId, "organization differs");
      assertPlan(after.input?.billing_account_id === reviewed.billingAccountId, "billing differs");
      assertPlan(after.input?.region === reviewed.region, "region differs");
    }
    if (resource.address === "module.state_bucket.google_storage_bucket.state") {
      assertPlan(after.name === reviewed.stateBucket, "state bucket differs");
      assertPlan(after.public_access_prevention === "enforced", "state bucket is not private");
      assertPlan(after.uniform_bucket_level_access === true, "uniform bucket access is disabled");
      assertPlan(after.versioning?.[0]?.enabled === true, "state versioning is disabled");
      assertPlan(after.force_destroy === false, "state force deletion is enabled");
    }
    if (
      resource.address === "module.state_bucket.google_storage_bucket_iam_member.bootstrap_operator"
    ) {
      assertPlan(
        after.member === reviewed.bootstrapOperatorPrincipal,
        "bootstrap principal differs",
      );
      assertPlan(after.role === "roles/storage.objectAdmin", "bootstrap state role differs");
    }
  }

  return {
    changes: (plan.resource_changes ?? []).length,
    environment,
    root,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const planPath = readArgument("--plan");
    const environment = readArgument("--environment");
    const root = readArgument("--root");
    if (!planPath || !environment || !root) {
      throw new Error("terraform_foundation_plan_arguments_invalid");
    }
    const result = validateFoundationPlan({
      plan: JSON.parse(readFileSync(resolve(planPath), "utf8")),
      environment,
      root,
      inventory: JSON.parse(
        readFileSync(join(infrastructureRoot, "inventory/reviewed-environments.json"), "utf8"),
      ),
      serviceCatalog: JSON.parse(
        readFileSync(join(infrastructureRoot, "service-catalog.json"), "utf8"),
      ),
    });
    process.stdout.write(`${JSON.stringify({ status: "passed", ...result })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
