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

function environmentAbbreviation(environment) {
  return environment === "production" ? "prod" : "uat";
}

function identityAddressIsAllowed(address) {
  return [
    /^module\.identity_foundation\.google_service_account\.accounts\["[A-Za-z]+"\]$/,
    /^module\.identity_foundation\.google_project_iam_custom_role\.custom\["[A-Za-z]+"\]$/,
    /^module\.identity_foundation\.google_project_iam_member\.terraform_(predefined|custom)\["[^"\n]+"\]$/,
    /^module\.identity_foundation\.google_service_account_iam_member\.(terraform_act_as|task_invoker_act_as|github_workload_identity)\["[A-Za-z]+"\]$/,
    /^module\.identity_foundation\.google_iam_workload_identity_pool\.github$/,
    /^module\.identity_foundation\.google_iam_workload_identity_pool_provider\.github\["(artifact|terraform)"\]$/,
    /^module\.state_bucket\.google_storage_bucket_iam_member\.terraform_identity\["roles\/storage\.(bucketViewer|objectAdmin)"\]$/,
  ].some((pattern) => pattern.test(address));
}

function expectedIdentityValues(environment, reviewed, identityCatalog) {
  const abbreviation = environmentAbbreviation(environment);
  const accountIds = Object.fromEntries(
    Object.entries(identityCatalog.serviceAccounts).map(([key, value]) => [
      key,
      `baz-${abbreviation}-${value.suffix}`,
    ]),
  );
  const emails = Object.fromEntries(
    Object.entries(accountIds).map(([key, value]) => [
      key,
      `${value}@${reviewed.projectId}.iam.gserviceaccount.com`,
    ]),
  );
  return {
    abbreviation,
    accountIds,
    emails,
    poolId: `bazoria-${abbreviation}-github`,
    terraformPrincipal: `serviceAccount:${emails.terraform}`,
  };
}

export function validateFoundationPlan({
  plan,
  environment,
  root,
  inventory,
  serviceCatalog,
  identityCatalog,
}) {
  assertPlan(["uat", "production"].includes(environment), "environment is invalid");
  assertPlan(["bootstrap", "platform"].includes(root), "root is invalid");
  assertPlan(plan.terraform_version === "1.15.9", "Terraform version differs");

  const reviewed = inventory.environments[environment];
  assertPlan(Boolean(reviewed), "environment is not in the reviewed inventory");
  assertPlan(Boolean(identityCatalog), "identity catalog is required");
  const expectedIdentity = expectedIdentityValues(environment, reviewed, identityCatalog);
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
    assertPlan(
      allowedAddresses.has(resource.address) ||
        (root === "bootstrap" && identityAddressIsAllowed(resource.address)),
      `unknown resource ${resource.address}`,
    );
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

    if (resource.address.includes("google_service_account.accounts")) {
      assertPlan(
        Object.values(expectedIdentity.accountIds).includes(after.account_id),
        `${resource.address} has an unknown service-account identifier`,
      );
    }
    if (resource.address.includes("google_project_iam_custom_role.custom")) {
      const customRole = Object.values(identityCatalog.customRoles).find(
        (value) => value.roleId === after.role_id,
      );
      assertPlan(Boolean(customRole), `${resource.address} has an unknown custom role`);
      assertPlan(
        JSON.stringify([...(after.permissions ?? [])].sort()) ===
          JSON.stringify([...customRole.permissions].sort()),
        `${resource.address} custom permissions differ`,
      );
    }
    if (resource.address.includes("google_project_iam_member.terraform_predefined")) {
      assertPlan(
        identityCatalog.terraformProjectRoles.includes(after.role),
        `${resource.address} has an unreviewed Terraform role`,
      );
      assertPlan(
        after.member === expectedIdentity.terraformPrincipal,
        `${resource.address} targets another Terraform identity`,
      );
    }
    if (resource.address.includes("google_project_iam_member.terraform_custom")) {
      const customRole = identityCatalog.customRoles[resource.index];
      assertPlan(Boolean(customRole), `${resource.address} has an unknown custom role key`);
      const expectedRole = `projects/${reviewed.projectId}/roles/${customRole.roleId}`;
      assertPlan(
        after.role === expectedRole ||
          (!("role" in after) && resource.change?.after_unknown?.role === true),
        `${resource.address} has an unknown custom role`,
      );
      assertPlan(
        after.member === expectedIdentity.terraformPrincipal,
        `${resource.address} targets another Terraform identity`,
      );
    }
    if (resource.address.includes("google_storage_bucket_iam_member.terraform_identity")) {
      assertPlan(after.bucket === reviewed.stateBucket, "Terraform state bucket differs");
      assertPlan(
        ["roles/storage.bucketViewer", "roles/storage.objectAdmin"].includes(after.role),
        "Terraform state role differs",
      );
      assertPlan(
        after.member === expectedIdentity.terraformPrincipal,
        "Terraform state principal differs",
      );
    }
    if (resource.address.endsWith("google_iam_workload_identity_pool.github")) {
      assertPlan(after.workload_identity_pool_id === expectedIdentity.poolId, "pool ID differs");
    }
    if (resource.address.includes("google_iam_workload_identity_pool_provider.github")) {
      const provider = Object.values(identityCatalog.github.providers).find(
        (value) => value.providerId === after.workload_identity_pool_provider_id,
      );
      assertPlan(Boolean(provider), `${resource.address} has an unknown provider`);
      for (const expectedValue of [
        reviewed.githubRepository,
        reviewed.githubRepositoryId,
        reviewed.githubOwner,
        reviewed.githubOwnerId,
        environment,
        "refs/heads/main",
        provider.workflowFile,
      ]) {
        assertPlan(
          after.attribute_condition.includes(expectedValue),
          `${resource.address} condition omits ${expectedValue}`,
        );
      }
      assertPlan(
        after.attribute_mapping?.["attribute.deployment_role"] === `'${provider.deploymentRole}'`,
        `${resource.address} deployment role differs`,
      );
    }
    if (resource.type === "google_service_account_iam_member") {
      assertPlan(
        ["roles/iam.serviceAccountUser", "roles/iam.workloadIdentityUser"].includes(after.role),
        `${resource.address} has an unreviewed service-account role`,
      );
      const serializedBinding = JSON.stringify(after);
      const otherEnvironment =
        environment === "uat" ? inventory.environments.production : inventory.environments.uat;
      if (otherEnvironment) {
        assertPlan(
          !serializedBinding.includes(otherEnvironment.projectId) &&
            !serializedBinding.includes(otherEnvironment.projectNumber),
          `${resource.address} references the other environment`,
        );
      }
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
      identityCatalog: JSON.parse(
        readFileSync(join(infrastructureRoot, "identity-catalog.json"), "utf8"),
      ),
    });
    process.stdout.write(`${JSON.stringify({ status: "passed", ...result })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
