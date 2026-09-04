import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const allowedResourcePrefixes = [
  "module.project_contract.terraform_data.verified_project",
  "module.secret_foundation.google_secret_manager_secret.secrets",
  "module.secret_foundation.google_secret_manager_secret_iam_member.accessors",
  "module.runtime_activation_platform",
  "module.custom_domain_load_balancer",
  "module.operational_monitoring",
  "module.artifact_registry_foundation.google_artifact_registry_repository.containers",
];
const allowedResourcePatterns = [
  /^module\.artifact_registry_foundation\.google_artifact_registry_repository_iam_member\.(readers|writers)\["serviceAccount:baz-uat-(terraform|artifact-release)@bazoria-uat-lnlabs\.iam\.gserviceaccount\.com"\]$/u,
];
const platformServiceAddresses = new Set(
  JSON.parse(readFileSync("infrastructure/google-cloud/service-catalog.json", "utf8")).platform.map(
    (service) => `module.platform_services.google_project_service.enabled["${service}"]`,
  ),
);

function argument(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function requireValue(value, label) {
  if (!value) throw new Error(`uat_runtime_release_invalid: missing ${label}`);
  return value;
}

function validateInputs(argv) {
  const commit = requireValue(argument(argv, "--commit"), "commit");
  const digest = requireValue(argument(argv, "--digest"), "digest");
  if (!commitPattern.test(commit)) throw new Error("uat_runtime_release_invalid: commit");
  if (!digestPattern.test(digest)) throw new Error("uat_runtime_release_invalid: digest");
  return { commit, digest };
}

export function normalizedPlan(plan, inputs) {
  validatePlan(plan);
  const changes = (plan.resource_changes ?? [])
    .map((change) => ({
      address: change.address,
      actions: change.change?.actions ?? [],
    }))
    .sort((left, right) => left.address.localeCompare(right.address));
  return JSON.stringify({
    version: plan.format_version,
    commit: inputs.commit,
    digest: inputs.digest,
    migrationTarget: inputs.migrationTarget ?? null,
    configurationNames: inputs.configurationNames ?? [],
    secretVersions: inputs.secretVersions ?? [],
    changes,
  });
}

export function validatePlan(plan) {
  for (const change of plan.resource_changes ?? []) {
    const actions = change.change?.actions ?? [];
    if (
      !allowedResourcePrefixes.some((prefix) => change.address.startsWith(prefix)) &&
      !platformServiceAddresses.has(change.address) &&
      !allowedResourcePatterns.some((pattern) => pattern.test(change.address))
    ) {
      throw new Error(`uat_runtime_release_unreviewed_resource: ${change.address}`);
    }
    if (actions.includes("delete") || actions.length > 1) {
      throw new Error(`uat_runtime_release_destructive_change: ${change.address}`);
    }
  }
  return plan;
}

export function fingerprint(plan, inputs) {
  return createHash("sha256").update(normalizedPlan(plan, inputs)).digest("hex");
}

export function migrationTarget(commit, runGit = execFileSync) {
  const paths = runGit("git", ["ls-tree", "-r", "--name-only", commit, "supabase/migrations"], {
    encoding: "utf8",
  })
    .trim()
    .split(/\r?\n/u)
    .filter((path) => path.endsWith(".sql"))
    .sort();
  const migrations = paths.map((path) => {
    const match = path.match(/supabase\/migrations\/(\d{14})_.+\.sql$/u);
    if (!match) throw new Error("uat_runtime_release_migration_filename_invalid");
    const contents = runGit("git", ["show", `${commit}:${path}`], { encoding: "buffer" });
    return {
      path,
      version: match[1],
      checksum: createHash("sha256").update(contents).digest("hex"),
    };
  });
  return {
    head: migrations.at(-1)?.version ?? null,
    checksum: createHash("sha256").update(JSON.stringify(migrations)).digest("hex"),
    migrations,
  };
}

export function main(argv = process.argv) {
  const operation = argv[2];
  if (operation === "migration-target") {
    const commit = requireValue(argument(argv, "--commit"), "commit");
    if (!commitPattern.test(commit)) throw new Error("uat_runtime_release_invalid: commit");
    writeFileSync(
      requireValue(argument(argv, "--output"), "output"),
      JSON.stringify(migrationTarget(commit)),
    );
    return;
  }
  if (!["fingerprint", "assert-fingerprint"].includes(operation)) {
    throw new Error("uat_runtime_release_invalid: unsupported operation");
  }

  const inputs = validateInputs(argv);
  const planPath = requireValue(argument(argv, "--plan"), "plan");
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const migrationTargetPath = argument(argv, "--migration-target");
  const configPath = argument(argv, "--config");
  if (migrationTargetPath)
    inputs.migrationTarget = JSON.parse(readFileSync(migrationTargetPath, "utf8"));
  if (configPath) {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    inputs.configurationNames = Object.keys(config.runtime_configuration ?? {}).sort();
    inputs.secretVersions = [
      config.runtime_configuration?.supabase_service_role_secret_version,
      config.runtime_configuration?.openai_api_key_secret_version,
    ].sort();
  }
  const value = fingerprint(plan, inputs);

  if (operation === "fingerprint") {
    writeFileSync(requireValue(argument(argv, "--output"), "output"), value);
  } else if (value !== requireValue(argument(argv, "--expected"), "expected fingerprint")) {
    throw new Error("uat_runtime_release_plan_fingerprint_mismatch");
  }
}

if (process.argv[1]?.endsWith("/uat-runtime-release.mjs")) main();
