import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const infrastructureRoot = join(repositoryRoot, "infrastructure/google-cloud");

function assertRuntime(condition, message) {
  if (!condition) throw new Error(`terraform_runtime_contract_invalid: ${message}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function validateRuntimeCatalog(catalog) {
  assertRuntime(catalog.schemaVersion === 1, "runtime catalog schema differs");
  assertRuntime(catalog.region === "europe-west3", "runtime region differs");
  assertRuntime(catalog.imagePath === "bazoria-web", "runtime image path differs");
  assertRuntime(
    JSON.stringify(catalog.resourceSuffixes) ===
      JSON.stringify({
        website: "web",
        worker: "activation-worker",
        reconciliationJob: "activation-reconciliation",
        activationQueue: "product-activation",
        reconciliationScheduler: "activation-reconciliation",
      }),
    "runtime resource suffixes differ",
  );
  assertRuntime(
    JSON.stringify(catalog.website) ===
      JSON.stringify({
        cpu: "1",
        memory: "1Gi",
        concurrency: 8,
        minimumInstances: { uat: 0, production: 1 },
        maximumInstances: { uat: 2, production: 3 },
        timeoutSeconds: 120,
        healthPath: "/healthz",
      }),
    "website runtime contract differs",
  );
  assertRuntime(
    JSON.stringify(catalog.worker) ===
      JSON.stringify({
        cpu: "1",
        memory: "1Gi",
        concurrency: 1,
        minimumInstances: 0,
        maximumInstances: 10,
        timeoutSeconds: 300,
        healthPath: "/health",
        command: ["/nodejs/bin/node"],
        args: [".output/commands/product-activation-worker.mjs"],
      }),
    "worker runtime contract differs",
  );
  assertRuntime(
    JSON.stringify(catalog.reconciliation) ===
      JSON.stringify({
        cpu: "1",
        memory: "512Mi",
        taskCount: 1,
        parallelism: 1,
        executionRetries: 2,
        timeoutSeconds: 120,
        applicationDeadlineSeconds: 60,
        batchSize: 100,
        command: ["/nodejs/bin/node"],
        args: [".output/commands/product-activation-reconciliation.mjs"],
      }),
    "reconciliation runtime contract differs",
  );
  assertRuntime(
    JSON.stringify(catalog.publication) ===
      JSON.stringify({
        maximumImageCount: 20,
        itemConcurrency: 3,
        itemTimeoutSeconds: 30,
        workerDeadlineSeconds: 240,
        claimTimeoutSeconds: 360,
        taskClientTimeoutSeconds: 10,
      }),
    "publication runtime contract differs",
  );
  assertRuntime(
    JSON.stringify(catalog.queue) ===
      JSON.stringify({
        maximumConcurrentDispatches: 10,
        maximumDispatchRate: 10,
        dispatchDeadlineSeconds: 270,
        maximumRetryDurationSeconds: 420,
        maximumAttempts: 10,
        minimumBackoffSeconds: 5,
        maximumBackoffSeconds: 60,
        targetPath: "/internal/tasks/activate-product-submission",
      }),
    "activation queue contract differs",
  );
  assertRuntime(
    JSON.stringify(catalog.scheduler) ===
      JSON.stringify({
        schedule: "* * * * *",
        timeZone: "UTC",
        attemptDeadlineSeconds: 30,
        retryCount: 1,
        maximumRetryDurationSeconds: 30,
        minimumBackoffSeconds: 5,
        maximumBackoffSeconds: 10,
      }),
    "reconciliation scheduler contract differs",
  );
  assertRuntime(
    JSON.stringify(catalog.supabaseUrls) ===
      JSON.stringify({
        uat: "https://mekobnkujzpzeiwmecyy.supabase.co",
        production: "https://njtgjrctfmtvackjmlww.supabase.co",
      }),
    "Supabase runtime destinations differ",
  );
  assertRuntime(
    JSON.stringify(catalog.canonicalOrigins) ===
      JSON.stringify({
        uat: "https://uat2026.bazoria.pl",
        production: "https://bazoria.pl",
      }),
    "canonical runtime origins differ",
  );
  assertRuntime(catalog.descriptionGenerationModel === "gpt-5.4-nano", "description model differs");
  validateTimeBudgets(catalog);
}

export function validateTimeBudgets(catalog) {
  assertRuntime(
    catalog.publication.workerDeadlineSeconds + 30 <= catalog.queue.dispatchDeadlineSeconds,
    "queue dispatch deadline lacks the worker safety margin",
  );
  assertRuntime(
    catalog.queue.dispatchDeadlineSeconds + 30 <= catalog.worker.timeoutSeconds,
    "Cloud Run timeout lacks the queue safety margin",
  );
  assertRuntime(
    catalog.publication.workerDeadlineSeconds + 60 <= catalog.publication.claimTimeoutSeconds,
    "claim timeout lacks the worker safety margin",
  );
  assertRuntime(
    catalog.publication.claimTimeoutSeconds + 60 <= catalog.queue.maximumRetryDurationSeconds,
    "queue retry duration lacks the claim safety margin",
  );
  assertRuntime(
    catalog.reconciliation.applicationDeadlineSeconds <= catalog.reconciliation.timeoutSeconds,
    "reconciliation deadline exceeds the job timeout",
  );
}

export function runtimeImageReferenceIsValid({
  reference,
  environment,
  reviewedEnvironment,
  artifactCatalog,
  runtimeCatalog,
}) {
  const abbreviation = environment === "production" ? "prod" : "uat";
  const repositoryId = `bazoria-${abbreviation}-${artifactCatalog.repository.suffix}`;
  const prefix = `${runtimeCatalog.region}-docker.pkg.dev/${reviewedEnvironment.projectId}/${repositoryId}/${runtimeCatalog.imagePath}@sha256:`;
  return reference.startsWith(prefix) && /^[0-9a-f]{64}$/.test(reference.slice(prefix.length));
}

function validateSource() {
  const moduleRoot = join(infrastructureRoot, "modules/runtime-activation-platform");
  const moduleSource = ["main.tf", "outputs.tf", "variables.tf", "versions.tf"]
    .map((file) => readFileSync(join(moduleRoot, file), "utf8"))
    .join("\n");
  const platformSource = readFileSync(join(infrastructureRoot, "platform/main.tf"), "utf8");
  const platformVariables = readFileSync(join(infrastructureRoot, "platform/variables.tf"), "utf8");
  const environmentVariables = ["uat", "production"]
    .map((environment) =>
      readFileSync(
        join(infrastructureRoot, `environments/${environment}/platform.tfvars.json`),
        "utf8",
      ),
    )
    .join("\n");

  for (const required of [
    'resource "google_cloud_run_v2_service" "website"',
    'resource "google_cloud_run_v2_service" "worker"',
    'resource "google_cloud_run_v2_job" "reconciliation"',
    'resource "google_cloud_tasks_queue" "activation"',
    'resource "google_cloud_scheduler_job" "reconciliation"',
    'role     = "roles/run.invoker"',
    '"roles/cloudtasks.enqueuer"',
    '"roles/cloudtasks.viewer"',
    "invoker_iam_disabled = true",
    'ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"',
    'uri_override_enforce_mode = "ALWAYS"',
    "BAZORIA_PRODUCT_PUBLICATION_TASK_MAXIMUM_ATTEMPTS = tostring(var.runtime_contract.queue.maximumAttempts)",
    'service_role  = "web"',
    'service_role  = "activation_worker"',
    'service_role  = "reconciliation"',
    'release_owner = "bazoria_web"',
    "deletion_protection = true",
  ]) {
    assertRuntime(moduleSource.includes(required), `runtime module is missing ${required}`);
  }
  for (const forbidden of [
    "allAuthenticatedUsers",
    "BAZORIA_CLASSIFIER_API_BASE_URL",
    "BAZORIA_CLASSIFIER_API_KEY",
    "BAZORIA_DEFAULT_CLASSIFIER_ORGANIZATION_ID",
    "BAZORIA_DEFAULT_SELLER_ID",
    "BAZORIA_UAT_FIXTURE_USER_PASSWORD",
    "BAZORIA_UAT_DATABASE_URL",
  ]) {
    assertRuntime(!moduleSource.includes(forbidden), `runtime module contains ${forbidden}`);
  }
  assertRuntime(
    !(moduleSource.match(/member\s*=\s*"allUsers"/g) ?? []).length,
    "public access must use the Cloud Run invoker IAM check setting",
  );
  assertRuntime(
    platformSource.includes('module "runtime_activation_platform"') &&
      platformSource.includes("for_each = var.runtime_configuration == null ? {}"),
    "platform root does not keep runtime creation explicitly disabled",
  );
  assertRuntime(
    platformVariables.includes('variable "runtime_configuration"') &&
      platformVariables.includes("default = null"),
    "platform runtime input is not optional before the first release",
  );
  assertRuntime(
    !environmentVariables.includes("runtime_configuration") &&
      !environmentVariables.includes("sha256:"),
    "checked-in environment variables must not apply a placeholder runtime",
  );
}

export function validateRuntimeContract() {
  const runtimeCatalog = readJson(join(infrastructureRoot, "runtime-catalog.json"));
  const artifactCatalog = readJson(join(infrastructureRoot, "artifact-catalog.json"));
  const reviewed = readJson(join(infrastructureRoot, "inventory/reviewed-environments.json"));
  validateRuntimeCatalog(runtimeCatalog);
  validateSource();

  const testDigest = "a".repeat(64);
  for (const [environment, reviewedEnvironment] of Object.entries(reviewed.environments)) {
    const abbreviation = environment === "production" ? "prod" : "uat";
    const reference = `${runtimeCatalog.region}-docker.pkg.dev/${reviewedEnvironment.projectId}/bazoria-${abbreviation}-${artifactCatalog.repository.suffix}/${runtimeCatalog.imagePath}@sha256:${testDigest}`;
    assertRuntime(
      runtimeImageReferenceIsValid({
        reference,
        environment,
        reviewedEnvironment,
        artifactCatalog,
        runtimeCatalog,
      }),
      `${environment} test image was rejected`,
    );
  }

  return {
    environments: Object.keys(reviewed.environments),
    runtimeResourcesPerEnvironment: 5,
    queueBindingsPerEnvironment: 4,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify({ status: "passed", ...validateRuntimeContract() })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
