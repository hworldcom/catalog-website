import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const infrastructureRoot = join(repositoryRoot, "infrastructure/google-cloud");
const matrixPath = join(infrastructureRoot, "inventory/reviewed-identity-access.json");
const environmentNames = ["uat", "production"];

const expectedServiceAccountKeys = [
  "activationWorker",
  "artifactRelease",
  "reconciliation",
  "scheduler",
  "taskInvoker",
  "terraform",
  "web",
];
const expectedProjectRoles = [
  "roles/browser",
  "roles/certificatemanager.editor",
  "roles/cloudscheduler.admin",
  "roles/cloudtasks.admin",
  "roles/compute.loadBalancerAdmin",
  "roles/logging.configWriter",
  "roles/monitoring.editor",
  "roles/run.admin",
  "roles/serviceusage.serviceUsageConsumer",
];
const expectedCustomPermissions = {
  artifactRepositoryAdmin: [
    "artifactregistry.locations.get",
    "artifactregistry.locations.list",
    "artifactregistry.repositories.create",
    "artifactregistry.repositories.get",
    "artifactregistry.repositories.getIamPolicy",
    "artifactregistry.repositories.list",
    "artifactregistry.repositories.setIamPolicy",
    "artifactregistry.repositories.update",
  ],
  secretContainerAdmin: [
    "secretmanager.locations.get",
    "secretmanager.locations.list",
    "secretmanager.secrets.create",
    "secretmanager.secrets.get",
    "secretmanager.secrets.getIamPolicy",
    "secretmanager.secrets.list",
    "secretmanager.secrets.setIamPolicy",
    "secretmanager.secrets.update",
  ],
};

function assertIdentity(condition, message) {
  if (!condition) {
    throw new Error(`terraform_identity_contract_invalid: ${message}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sorted(values) {
  return [...values].sort();
}

function environmentAbbreviation(environment) {
  return environment === "production" ? "prod" : "uat";
}

function serviceAccountInventory(environment, projectId, catalog) {
  const abbreviation = environmentAbbreviation(environment);
  return Object.fromEntries(
    Object.entries(catalog.serviceAccounts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => {
        const accountId = `baz-${abbreviation}-${value.suffix}`;
        const email = `${accountId}@${projectId}.iam.gserviceaccount.com`;
        return [
          key,
          {
            accountId,
            email,
            name: `projects/${projectId}/serviceAccounts/${email}`,
          },
        ];
      }),
  );
}

function binding({ principal, roles, resources, access = "direct", ownerTicket, reason }) {
  return {
    access,
    ownerTicket,
    principal,
    reason,
    resources: sorted(resources),
    roles: sorted(roles),
  };
}

export function validateIdentityCatalog(catalog) {
  assertIdentity(catalog.schemaVersion === 1, "identity catalog schema differs");
  assertIdentity(catalog.github.repository === "hworldcom/catalog-website", "repository differs");
  assertIdentity(catalog.github.repositoryId === "1313750742", "repository ID differs");
  assertIdentity(
    catalog.github.repositoryCreatedAt === "2026-07-27T11:12:46Z",
    "repository creation time differs",
  );
  assertIdentity(catalog.github.owner === "hworldcom", "repository owner differs");
  assertIdentity(catalog.github.ownerId === "144285964", "repository owner ID differs");
  assertIdentity(
    catalog.github.subjectFormat === "immutable-owner-and-repository-ids",
    "repository subject format differs",
  );
  assertIdentity(catalog.github.branchRef === "refs/heads/main", "trusted branch differs");
  assertIdentity(
    JSON.stringify(sorted(catalog.github.acceptedEvents)) ===
      JSON.stringify(["push", "workflow_dispatch"]),
    "accepted GitHub events differ",
  );
  assertIdentity(
    JSON.stringify(sorted(Object.keys(catalog.serviceAccounts))) ===
      JSON.stringify(expectedServiceAccountKeys),
    "service-account purposes differ",
  );
  assertIdentity(
    JSON.stringify(sorted(catalog.terraformProjectRoles)) === JSON.stringify(expectedProjectRoles),
    "Terraform project roles differ",
  );

  const providerContract = Object.fromEntries(
    Object.entries(catalog.github.providers).map(([key, value]) => [
      key,
      {
        providerId: value.providerId,
        deploymentRole: value.deploymentRole,
        serviceAccountKey: value.serviceAccountKey,
        workflowFile: value.workflowFile,
      },
    ]),
  );
  assertIdentity(
    JSON.stringify(providerContract) ===
      JSON.stringify({
        artifact: {
          providerId: "artifact-main",
          deploymentRole: "artifact",
          serviceAccountKey: "artifactRelease",
          workflowFile: "artifact-release.yml",
        },
        terraform: {
          providerId: "terraform-main",
          deploymentRole: "terraform",
          serviceAccountKey: "terraform",
          workflowFile: "terraform-environment.yml",
        },
      }),
    "federation provider contract differs",
  );

  for (const [key, permissions] of Object.entries(expectedCustomPermissions)) {
    assertIdentity(Boolean(catalog.customRoles[key]), `custom role ${key} is missing`);
    assertIdentity(
      JSON.stringify(sorted(catalog.customRoles[key].permissions)) === JSON.stringify(permissions),
      `custom role ${key} permissions differ`,
    );
  }

  const forbiddenRolePatterns = [
    /^roles\/(owner|editor|viewer)$/,
    /^roles\/billing\./,
    /^roles\/resourcemanager\.projectIamAdmin$/,
    /^roles\/iam\.(serviceAccountAdmin|serviceAccountKeyAdmin|workloadIdentityPoolAdmin)$/,
  ];
  for (const role of catalog.terraformProjectRoles) {
    assertIdentity(
      !forbiddenRolePatterns.some((pattern) => pattern.test(role)),
      `forbidden Terraform role ${role}`,
    );
  }
  for (const role of Object.values(catalog.customRoles)) {
    for (const permission of role.permissions) {
      assertIdentity(!permission.includes(".versions."), `secret-version permission ${permission}`);
      assertIdentity(
        !permission.includes("uploadArtifacts"),
        `artifact upload permission ${permission}`,
      );
      assertIdentity(
        !permission.includes("deleteArtifacts"),
        `artifact delete permission ${permission}`,
      );
      assertIdentity(
        !permission.includes("downloadArtifacts"),
        `artifact download permission ${permission}`,
      );
    }
  }

  for (const environment of environmentNames) {
    const accounts = serviceAccountInventory(
      environment,
      `bazoria-${environmentAbbreviation(environment)}-lnlabs`,
      catalog,
    );
    for (const account of Object.values(accounts)) {
      assertIdentity(
        /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(account.accountId),
        `${account.accountId} is invalid`,
      );
    }
  }
}

export function buildIdentityAccessMatrix({ reviewed, catalog, administratorAccess }) {
  const environments = {};

  for (const environment of environmentNames) {
    const value = reviewed.environments[environment];
    const abbreviation = environmentAbbreviation(environment);
    const accounts = serviceAccountInventory(environment, value.projectId, catalog);
    const terraformPrincipal = `serviceAccount:${accounts.terraform.email}`;
    const stateBucket = `buckets/${value.stateBucket}`;
    const poolName = `projects/${value.projectNumber}/locations/global/workloadIdentityPools/bazoria-${abbreviation}-github`;
    const customRoleNames = Object.values(catalog.customRoles).map(
      (role) => `projects/${value.projectId}/roles/${role.roleId}`,
    );
    const terraformActAsResources = Object.entries(catalog.serviceAccounts)
      .filter(([, account]) => account.terraformCanActAs)
      .map(([key]) => accounts[key].name);

    const bindings = [
      binding({
        principal: value.bootstrapOperatorPrincipal,
        roles: ["roles/storage.objectAdmin"],
        resources: [stateBucket],
        ownerTicket: "0038e1",
        reason: "Break-glass access to the environment state bucket.",
      }),
      binding({
        principal: terraformPrincipal,
        roles: [...catalog.terraformProjectRoles, ...customRoleNames],
        resources: [`projects/${value.projectId}`],
        ownerTicket: "0038e2a",
        reason: "Manage only the reviewed environment platform resources.",
      }),
      binding({
        principal: terraformPrincipal,
        roles: ["roles/storage.bucketViewer", "roles/storage.objectAdmin"],
        resources: [stateBucket],
        ownerTicket: "0038e2a",
        reason: "Read bucket metadata and manage matching environment Terraform state objects.",
      }),
      binding({
        principal: terraformPrincipal,
        roles: ["roles/iam.serviceAccountUser"],
        resources: terraformActAsResources,
        ownerTicket: "0038e2a",
        reason: "Attach only the reviewed runtime and invocation identities to managed resources.",
      }),
      ...Object.entries(catalog.serviceAccounts)
        .filter(([, account]) => account.canActAsTaskInvoker)
        .map(([key]) =>
          binding({
            principal: `serviceAccount:${accounts[key].email}`,
            roles: ["roles/iam.serviceAccountUser"],
            resources: [accounts.taskInvoker.name],
            ownerTicket: "0038e2a",
            reason: "Attach the dedicated task identity to an activation task.",
          }),
        ),
      ...Object.entries(catalog.github.providers).map(([, provider]) =>
        binding({
          principal: `principalSet://iam.googleapis.com/${poolName}/attribute.deployment_role/${provider.deploymentRole}`,
          roles: ["roles/iam.workloadIdentityUser"],
          resources: [accounts[provider.serviceAccountKey].name],
          ownerTicket: "0038e2a",
          reason: `Allow only the reviewed ${provider.workflowFile} provider role to impersonate its account.`,
        }),
      ),
      ...administratorAccess.environments[environment].projectInheritedStateAccess.map((entry) =>
        binding({
          principal: entry.principal,
          roles: [entry.role],
          resources: [entry.source],
          access: "inherited",
          ownerTicket: "0038e1",
          reason: entry.disposition,
        }),
      ),
    ];

    environments[environment] = {
      bindings,
      federation: {
        pool: poolName,
        providers: Object.fromEntries(
          Object.entries(catalog.github.providers).map(([key, provider]) => [
            key,
            `${poolName}/providers/${provider.providerId}`,
          ]),
        ),
      },
      projectId: value.projectId,
      serviceAccounts: accounts,
    };
  }

  return {
    schemaVersion: 1,
    generatedFrom: [
      "identity-catalog.json",
      "reviewed-administrator-access.json",
      "reviewed-environments.json",
    ],
    environments,
  };
}

function validateWorkflow(path, expectedEnvironmentExpression) {
  const source = readFileSync(path, "utf8");
  assertIdentity(source.includes("id-token: write"), `${path} cannot request an identity token`);
  assertIdentity(source.includes("contents: read"), `${path} lacks read-only source access`);
  assertIdentity(!source.includes("pull_request:"), `${path} must not authenticate pull requests`);
  assertIdentity(
    source.includes(expectedEnvironmentExpression),
    `${path} lacks protected environment ownership`,
  );
  for (const match of source.matchAll(/uses:\s+[^@\s]+@([^\s]+)/g)) {
    assertIdentity(/^[a-f0-9]{40}$/.test(match[1]), `${path} contains an unpinned action`);
  }
}

function validateSource() {
  const moduleSource = readFileSync(
    join(infrastructureRoot, "modules/identity-foundation/main.tf"),
    "utf8",
  );
  assertIdentity(
    !moduleSource.includes("google_service_account_key"),
    "service-account key resource found",
  );
  for (const role of [
    "roles/owner",
    "roles/editor",
    "roles/viewer",
    "roles/billing.costsManager",
    "roles/resourcemanager.projectIamAdmin",
    "roles/iam.serviceAccountAdmin",
    "roles/iam.serviceAccountKeyAdmin",
    "roles/iam.workloadIdentityPoolAdmin",
  ]) {
    assertIdentity(!moduleSource.includes(role), `identity module contains forbidden role ${role}`);
  }
  assertIdentity(
    moduleSource.includes("prevent_destroy = true"),
    "protected identities lack prevent_destroy",
  );
  assertIdentity(
    moduleSource.includes(
      'github_subject           = "repo:${var.github_owner}@${var.github_owner_id}/${local.github_repository_name}@${var.github_repository_id}:environment:${var.environment}"',
    ),
    "identity module does not require the immutable GitHub subject",
  );

  validateWorkflow(
    join(repositoryRoot, ".github/workflows/terraform-environment.yml"),
    "environment: ${{ inputs.environment }}",
  );
  validateWorkflow(
    join(repositoryRoot, ".github/workflows/artifact-release.yml"),
    "environment: ${{ inputs.environment }}",
  );

  for (const path of [join(repositoryRoot, ".gitignore"), join(repositoryRoot, ".dockerignore")]) {
    assertIdentity(
      readFileSync(path, "utf8").includes("gha-creds-*.json"),
      `${path} does not exclude generated GitHub credentials`,
    );
  }
}

export function validateIdentityContract() {
  const reviewed = readJson(join(infrastructureRoot, "inventory/reviewed-environments.json"));
  const catalog = readJson(join(infrastructureRoot, "identity-catalog.json"));
  const administratorAccess = readJson(
    join(infrastructureRoot, "inventory/reviewed-administrator-access.json"),
  );
  validateIdentityCatalog(catalog);
  validateSource();
  const expectedMatrix = buildIdentityAccessMatrix({ reviewed, catalog, administratorAccess });
  const actualMatrix = readJson(matrixPath);
  assertIdentity(
    JSON.stringify(actualMatrix) === JSON.stringify(expectedMatrix),
    "checked-in identity access matrix is stale",
  );
  return {
    bindings: Object.values(expectedMatrix.environments).reduce(
      (total, environment) => total + environment.bindings.length,
      0,
    ),
    environments: environmentNames,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const reviewed = readJson(join(infrastructureRoot, "inventory/reviewed-environments.json"));
    const catalog = readJson(join(infrastructureRoot, "identity-catalog.json"));
    const administratorAccess = readJson(
      join(infrastructureRoot, "inventory/reviewed-administrator-access.json"),
    );
    if (process.argv.includes("--print-matrix")) {
      validateIdentityCatalog(catalog);
      process.stdout.write(
        `${JSON.stringify(buildIdentityAccessMatrix({ reviewed, catalog, administratorAccess }), null, 2)}\n`,
      );
    } else if (process.argv.includes("--write-matrix")) {
      validateIdentityCatalog(catalog);
      writeFileSync(
        matrixPath,
        `${JSON.stringify(buildIdentityAccessMatrix({ reviewed, catalog, administratorAccess }), null, 2)}\n`,
        { mode: 0o644 },
      );
      process.stdout.write(`${JSON.stringify({ status: "written", matrixPath })}\n`);
    } else {
      process.stdout.write(
        `${JSON.stringify({ status: "passed", ...validateIdentityContract() })}\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
