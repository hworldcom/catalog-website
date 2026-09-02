import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

import {
  buildArtifactCleanupContract,
  buildArtifactRepositoryInventory,
  normalizeArtifactCleanupPlan,
} from "./artifact-contract.mjs";

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

function platformAddressIsAllowed(address) {
  return [
    /^module\.secret_foundation\.google_secret_manager_secret\.secrets\["(openaiApiKey|supabaseServiceRole)"\]$/,
    /^module\.secret_foundation\.google_secret_manager_secret_iam_member\.accessors\["[^"\n]+"\]$/,
    /^module\.artifact_registry_foundation\.google_artifact_registry_repository\.containers$/,
    /^module\.artifact_registry_foundation\.google_artifact_registry_repository_iam_member\.(readers|writers)\["serviceAccount:[^"\n]+"\]$/,
  ].some((pattern) => pattern.test(address));
}

function expectedIdentityValues(environment, reviewed, identityCatalog) {
  const abbreviation = environmentAbbreviation(environment);
  const repositoryName = reviewed.githubRepository.split("/")[1];
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
    subject: `repo:${reviewed.githubOwner}@${reviewed.githubOwnerId}/${repositoryName}@${reviewed.githubRepositoryId}:environment:${environment}`,
    terraformPrincipal: `serviceAccount:${emails.terraform}`,
  };
}

function expectedSecretValues(environment, reviewed, identityCatalog, secretCatalog) {
  const abbreviation = environmentAbbreviation(environment);
  const serviceAccountEmails = Object.fromEntries(
    Object.entries(identityCatalog.serviceAccounts).map(([key, value]) => [
      key,
      `baz-${abbreviation}-${value.suffix}@${reviewed.projectId}.iam.gserviceaccount.com`,
    ]),
  );
  const containers = Object.fromEntries(
    Object.entries(secretCatalog.secrets).map(([key, value]) => {
      const secretId = `bazoria-${abbreviation}-${value.suffix}`;
      return [
        key,
        {
          members: value.accessorServiceAccountKeys.map(
            (accountKey) => `serviceAccount:${serviceAccountEmails[accountKey]}`,
          ),
          name: `projects/${reviewed.projectId}/secrets/${secretId}`,
          purposeLabel: value.purposeLabel,
          secretId,
        },
      ];
    }),
  );
  const bindings = Object.fromEntries(
    Object.entries(containers).flatMap(([secretKey, secret]) =>
      secret.members.map((member) => [
        `${secretKey}/${member}`,
        { member, secretKey, secretId: secret.secretId, secretName: secret.name },
      ]),
    ),
  );
  return { bindings, containers };
}

function expectedArtifactValues(environment, reviewed, identityCatalog, artifactCatalog) {
  const repository = buildArtifactRepositoryInventory({
    environment,
    reviewedEnvironment: reviewed,
    identityCatalog,
    artifactCatalog,
  });
  return {
    repository,
    readerMembers: new Set(repository.readerMembers),
    writerMembers: new Set(repository.writerMembers),
  };
}

function isReviewedProviderSubjectUpdate(resource, environment, reviewed, expectedIdentity) {
  if (
    resource.change?.actions?.length !== 1 ||
    resource.change.actions[0] !== "update" ||
    !/^module\.identity_foundation\.google_iam_workload_identity_pool_provider\.github\["(artifact|terraform)"\]$/.test(
      resource.address,
    )
  ) {
    return false;
  }

  const before = structuredClone(resource.change.before ?? {});
  const after = structuredClone(resource.change.after ?? {});
  const beforeCondition = before.attribute_condition;
  const afterCondition = after.attribute_condition;
  delete before.attribute_condition;
  delete after.attribute_condition;

  const legacySubject = `repo:${reviewed.githubRepository}:environment:${environment}`;
  return (
    typeof beforeCondition === "string" &&
    beforeCondition.includes(legacySubject) &&
    !beforeCondition.includes(expectedIdentity.subject) &&
    typeof afterCondition === "string" &&
    afterCondition.includes(expectedIdentity.subject) &&
    !afterCondition.includes(legacySubject) &&
    isDeepStrictEqual(before, after)
  );
}

function isReviewedArtifactCleanupUpdate(resource, expectedCleanup) {
  if (
    resource.address !==
      "module.artifact_registry_foundation.google_artifact_registry_repository.containers" ||
    resource.type !== "google_artifact_registry_repository" ||
    !isDeepStrictEqual(resource.change?.actions, ["update"]) ||
    !isDeepStrictEqual(normalizeArtifactCleanupPlan(resource.change.after ?? {}), expectedCleanup)
  ) {
    return false;
  }

  const before = structuredClone(resource.change.before ?? {});
  const after = structuredClone(resource.change.after ?? {});
  for (const value of [before, after]) {
    delete value.cleanup_policies;
    delete value.cleanup_policy_dry_run;
  }
  return isDeepStrictEqual(before, after);
}

export function validateFoundationPlan({
  plan,
  environment,
  root,
  inventory,
  serviceCatalog,
  identityCatalog,
  artifactCatalog,
  secretCatalog,
}) {
  assertPlan(["uat", "production"].includes(environment), "environment is invalid");
  assertPlan(["bootstrap", "platform"].includes(root), "root is invalid");
  assertPlan(plan.terraform_version === "1.15.9", "Terraform version differs");

  const reviewed = inventory.environments[environment];
  assertPlan(Boolean(reviewed), "environment is not in the reviewed inventory");
  assertPlan(Boolean(identityCatalog), "identity catalog is required");
  const expectedIdentity = expectedIdentityValues(environment, reviewed, identityCatalog);
  const expectedSecrets =
    root === "platform"
      ? expectedSecretValues(environment, reviewed, identityCatalog, secretCatalog)
      : undefined;
  const expectedArtifacts =
    root === "platform"
      ? expectedArtifactValues(environment, reviewed, identityCatalog, artifactCatalog)
      : undefined;
  const expectedArtifactCleanup =
    root === "platform" ? buildArtifactCleanupContract({ environment, artifactCatalog }) : null;
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
          "google_project_iam_audit_config.artifact_registry_data_write",
          "module.state_bucket.google_storage_bucket.state",
          "module.state_bucket.google_storage_bucket_iam_member.bootstrap_operator",
        ]
      : []),
  ]);

  for (const resource of plan.resource_changes ?? []) {
    const actions = resource.change?.actions ?? [];
    const reviewedProviderSubjectUpdate = isReviewedProviderSubjectUpdate(
      resource,
      environment,
      reviewed,
      expectedIdentity,
    );
    const reviewedArtifactCleanupUpdate =
      root === "platform" && isReviewedArtifactCleanupUpdate(resource, expectedArtifactCleanup);
    const reviewedInPlaceUpdate = reviewedProviderSubjectUpdate || reviewedArtifactCleanupUpdate;
    assertPlan(
      allowedAddresses.has(resource.address) ||
        (root === "bootstrap" && identityAddressIsAllowed(resource.address)) ||
        (root === "platform" && platformAddressIsAllowed(resource.address)),
      `unknown resource ${resource.address}`,
    );
    assertPlan(!actions.includes("delete"), `${resource.address} would delete a resource`);
    assertPlan(
      !actions.includes("update") || reviewedInPlaceUpdate,
      `${resource.address} would perform an unreviewed update`,
    );
    assertPlan(
      reviewedInPlaceUpdate ||
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
    if (resource.type === "google_project_iam_audit_config") {
      assertPlan(
        resource.address === "google_project_iam_audit_config.artifact_registry_data_write",
        `${resource.address} is not the reviewed audit configuration`,
      );
      assertPlan(
        after.service === "artifactregistry.googleapis.com",
        `${resource.address} service differs`,
      );
      const auditLogs = after.audit_log_config ?? [];
      assertPlan(auditLogs.length === 1, `${resource.address} audit-log count differs`);
      assertPlan(
        auditLogs[0]?.log_type === "DATA_WRITE" &&
          (auditLogs[0]?.exempted_members ?? []).length === 0,
        `${resource.address} audit-log contract differs`,
      );
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
      assertPlan(
        [reviewed.stateBucket, `b/${reviewed.stateBucket}`].includes(after.bucket),
        "Terraform state bucket differs",
      );
      assertPlan(
        ["roles/storage.bucketViewer", "roles/storage.objectAdmin"].includes(after.role),
        "Terraform state role differs",
      );
      assertPlan(
        after.member === expectedIdentity.terraformPrincipal,
        "Terraform state principal differs",
      );
    }
    if (resource.address.includes("google_secret_manager_secret.secrets")) {
      const secret = expectedSecrets?.containers[resource.index];
      assertPlan(Boolean(secret), `${resource.address} has an unknown secret purpose`);
      assertPlan(after.secret_id === secret.secretId, `${resource.address} secret ID differs`);
      assertPlan(
        isDeepStrictEqual(after.labels, {
          environment,
          managed_by: "terraform",
          purpose: secret.purposeLabel,
        }),
        `${resource.address} labels differ`,
      );
      const replicas = after.replication?.[0]?.user_managed?.[0]?.replicas ?? [];
      assertPlan(replicas.length === 1, `${resource.address} replica count differs`);
      assertPlan(
        replicas[0].location === secretCatalog.replicationRegion,
        `${resource.address} replication region differs`,
      );
    }
    if (resource.address.includes("google_secret_manager_secret_iam_member.accessors")) {
      const binding = expectedSecrets?.bindings[resource.index];
      assertPlan(Boolean(binding), `${resource.address} has an unknown secret accessor`);
      assertPlan(
        after.role === "roles/secretmanager.secretAccessor",
        `${resource.address} role differs`,
      );
      assertPlan(after.member === binding.member, `${resource.address} member differs`);
      assertPlan(
        [binding.secretId, binding.secretName].includes(after.secret_id),
        `${resource.address} secret differs`,
      );
    }
    if (resource.type === "google_artifact_registry_repository") {
      const artifact = expectedArtifacts?.repository;
      assertPlan(Boolean(artifact), `${resource.address} has no reviewed repository`);
      assertPlan(after.location === artifact.location, `${resource.address} location differs`);
      assertPlan(
        after.repository_id === artifact.repositoryId,
        `${resource.address} repository ID differs`,
      );
      assertPlan(after.format === artifact.format, `${resource.address} format differs`);
      assertPlan(after.mode === artifact.mode, `${resource.address} mode differs`);
      assertPlan(
        isDeepStrictEqual(after.labels, {
          environment,
          managed_by: "terraform",
          purpose: artifact.purposeLabel,
        }),
        `${resource.address} labels differ`,
      );
      assertPlan(
        (after.docker_config ?? []).length === 0 ||
          (after.docker_config.length === 1 &&
            after.docker_config[0]?.immutable_tags === artifact.immutableTags),
        `${resource.address} tag mutability differs`,
      );
      assertPlan(
        isDeepStrictEqual(normalizeArtifactCleanupPlan(after), expectedArtifactCleanup),
        `${resource.address} cleanup policy differs`,
      );
    }
    if (resource.type === "google_artifact_registry_repository_iam_member") {
      const artifact = expectedArtifacts?.repository;
      assertPlan(Boolean(artifact), `${resource.address} has no reviewed repository binding`);
      assertPlan(after.location === artifact.location, `${resource.address} location differs`);
      assertPlan(
        [artifact.repositoryId, artifact.name].includes(after.repository),
        `${resource.address} repository differs`,
      );
      if (resource.address.includes(".writers[")) {
        assertPlan(
          after.role === "roles/artifactregistry.writer",
          `${resource.address} writer role differs`,
        );
        assertPlan(
          expectedArtifacts.writerMembers.has(after.member),
          `${resource.address} has an unknown artifact writer`,
        );
      } else {
        assertPlan(
          after.role === "roles/artifactregistry.reader",
          `${resource.address} reader role differs`,
        );
        assertPlan(
          expectedArtifacts.readerMembers.has(after.member),
          `${resource.address} has an unknown artifact reader`,
        );
      }
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
        expectedIdentity.subject,
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
      artifactCatalog: JSON.parse(
        readFileSync(join(infrastructureRoot, "artifact-catalog.json"), "utf8"),
      ),
      secretCatalog: JSON.parse(
        readFileSync(join(infrastructureRoot, "secret-catalog.json"), "utf8"),
      ),
    });
    process.stdout.write(`${JSON.stringify({ status: "passed", ...result })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
