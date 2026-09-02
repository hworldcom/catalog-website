import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const infrastructureRoot = join(repositoryRoot, "infrastructure/google-cloud");

function assertMonitoring(condition, message) {
  if (!condition) throw new Error(`terraform_monitoring_contract_invalid: ${message}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function notificationChannelsAreValid({ channels, projectId }) {
  return (
    channels.length > 0 &&
    new Set(channels).size === channels.length &&
    channels.every((channel) =>
      new RegExp(`^projects/${projectId}/notificationChannels/[A-Za-z0-9_-]+$`).test(channel),
    )
  );
}

export function validateMonitoringCatalog(catalog) {
  assertMonitoring(catalog.schemaVersion === 1, "monitoring catalog schema differs");
  assertMonitoring(
    catalog.notificationChannelSource === "terraform_input",
    "notification channel source differs",
  );
  assertMonitoring(
    JSON.stringify(catalog.resourceSuffixes) ===
      JSON.stringify({
        workerErrorsMetric: "activation-worker-errors",
        reconciliationFailuresMetric: "activation-reconciliation-failures",
        reconciliationSuccessesMetric: "activation-reconciliation-successes",
        retryLimitMetric: "activation-retry-limit",
        pendingAgeMetric: "activation-oldest-pending-age-ms",
      }),
    "monitoring resource suffixes differ",
  );
  assertMonitoring(
    JSON.stringify(catalog.website5xx) ===
      JSON.stringify({
        metricType: "run.googleapis.com/request_count",
        resourceType: "cloud_run_revision",
        responseCodeClass: "5xx",
        ratioThreshold: 0.05,
        minimumRequestCount: 20,
        alignmentWindowSeconds: 300,
        severity: "ERROR",
      }),
    "website 5xx signal differs",
  );
  assertMonitoring(
    catalog.workerErrors.service === "bazoria_product_activation_worker" &&
      catalog.workerErrors.event === "product_activation_task_finished" &&
      catalog.workerErrors.resourceType === "cloud_run_revision" &&
      catalog.workerErrors.thresholdCount === 3 &&
      catalog.workerErrors.alignmentWindowSeconds === 300 &&
      catalog.workerErrors.severity === "ERROR",
    "worker error signal differs",
  );
  assertMonitoring(
    catalog.pendingAge.service === "bazoria_product_activation_reconciliation" &&
      catalog.pendingAge.event === "product_activation_reconciliation_finished" &&
      catalog.pendingAge.field === "oldestPendingAgeMs" &&
      catalog.pendingAge.resourceType === "cloud_run_job" &&
      catalog.pendingAge.alignmentWindowSeconds === 60 &&
      catalog.pendingAge.warningThresholdMs === 300_000 &&
      catalog.pendingAge.criticalThresholdMs === 900_000 &&
      catalog.pendingAge.warningSeverity === "WARNING" &&
      catalog.pendingAge.criticalSeverity === "CRITICAL",
    "durable pending-age signals differ",
  );
  assertMonitoring(
    catalog.reconciliationFailures.service === "bazoria_product_activation_reconciliation" &&
      catalog.reconciliationFailures.event === "product_activation_reconciliation_failed" &&
      catalog.reconciliationFailures.resourceType === "cloud_run_job" &&
      catalog.reconciliationFailures.warningThresholdCount === 1 &&
      catalog.reconciliationFailures.criticalThresholdCount === 2 &&
      catalog.reconciliationFailures.alignmentWindowSeconds === 300 &&
      catalog.reconciliationFailures.warningSeverity === "WARNING" &&
      catalog.reconciliationFailures.criticalSeverity === "CRITICAL",
    "reconciliation failure signals differ",
  );
  assertMonitoring(
    catalog.reconciliationHeartbeat.service === "bazoria_product_activation_reconciliation" &&
      catalog.reconciliationHeartbeat.event === "product_activation_reconciliation_finished" &&
      catalog.reconciliationHeartbeat.resourceType === "cloud_run_job" &&
      catalog.reconciliationHeartbeat.absenceSeconds === 300 &&
      catalog.reconciliationHeartbeat.severity === "ERROR",
    "reconciliation heartbeat signal differs",
  );
  assertMonitoring(
    catalog.retryLimit.service === "bazoria_product_activation_worker" &&
      catalog.retryLimit.event === "product_activation_task_finished" &&
      catalog.retryLimit.field === "retryLimitReached" &&
      catalog.retryLimit.resourceType === "cloud_run_revision" &&
      catalog.retryLimit.thresholdCount === 1 &&
      catalog.retryLimit.alignmentWindowSeconds === 300 &&
      catalog.retryLimit.severity === "CRITICAL",
    "retry-limit signal differs",
  );
  assertMonitoring(
    catalog.uptime.metricType === "monitoring.googleapis.com/uptime_check/check_passed" &&
      catalog.uptime.resourceType === "uptime_url" &&
      catalog.uptime.periodSeconds === 60 &&
      catalog.uptime.timeoutSeconds === 10 &&
      catalog.uptime.failureDurationSeconds === 120 &&
      catalog.uptime.minimumFailedRegions === 2 &&
      catalog.uptime.severity === "CRITICAL",
    "uptime signal differs",
  );
  assertMonitoring(
    JSON.stringify(catalog.uptime.checks) ===
      JSON.stringify({
        health: { path: "/healthz", status: 204, contentMarker: null },
        catalog: {
          path: "/?lang=EN&audience=women",
          status: 200,
          contentMarker: "bazoria-public-catalog-v1",
        },
      }),
    "public uptime checks differ",
  );
}

function validateSource() {
  const moduleRoot = join(infrastructureRoot, "modules/operational-monitoring");
  const moduleSource = ["main.tf", "outputs.tf", "variables.tf", "versions.tf"]
    .map((file) => readFileSync(join(moduleRoot, file), "utf8"))
    .join("\n");
  const platformSource = readFileSync(join(infrastructureRoot, "platform/main.tf"), "utf8");
  const platformVariables = readFileSync(join(infrastructureRoot, "platform/variables.tf"), "utf8");
  const rootRoute = readFileSync(join(repositoryRoot, "src/routes/__root.tsx"), "utf8");
  const environmentVariables = ["uat", "production"]
    .map((environment) =>
      readFileSync(
        join(infrastructureRoot, `environments/${environment}/platform.tfvars.json`),
        "utf8",
      ),
    )
    .join("\n");

  for (const required of [
    'resource "google_logging_metric" "worker_errors"',
    'resource "google_logging_metric" "reconciliation_failures"',
    'resource "google_logging_metric" "reconciliation_successes"',
    'resource "google_logging_metric" "retry_limit"',
    'resource "google_logging_metric" "pending_age"',
    'resource "google_monitoring_alert_policy" "website_5xx"',
    'combiner              = "AND_WITH_MATCHING_RESOURCE"',
    'resource "google_monitoring_alert_policy" "log_counter"',
    'resource "google_monitoring_alert_policy" "pending_age"',
    'resource "google_monitoring_alert_policy" "reconciliation_heartbeat"',
    'resource "google_monitoring_uptime_check_config" "public"',
    'resource "google_monitoring_alert_policy" "uptime"',
    "metric.label.response_code_class=",
    "metric.label.check_id=",
    'checker_type       = "STATIC_IP_CHECKERS"',
    "use_ssl        = true",
    "validate_ssl   = true",
    '!endswith(local.canonical_hostname, ".run.app")',
    'service_role  = "observability"',
    'release_owner = "bazoria_web"',
  ]) {
    assertMonitoring(moduleSource.includes(required), `monitoring module is missing ${required}`);
  }
  for (const forbidden of [
    "metric.labels.response_code_class",
    "metric.labels.check_id",
    "auth_info",
    "service_agent_authentication",
    "@bazoria.pl",
    "@lnlabs.xyz",
    "allUsers",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
  ]) {
    assertMonitoring(!moduleSource.includes(forbidden), `monitoring module contains ${forbidden}`);
  }
  assertMonitoring(
    platformSource.includes('module "operational_monitoring"') &&
      platformSource.includes(
        "var.runtime_configuration == null || var.monitoring_configuration == null ? {}",
      ),
    "platform root does not keep monitoring behind the runtime activation boundary",
  );
  assertMonitoring(
    platformVariables.includes('variable "monitoring_configuration"') &&
      platformVariables.includes("default = null"),
    "platform monitoring input is not optional before runtime deployment",
  );
  assertMonitoring(
    !environmentVariables.includes("monitoring_configuration"),
    "checked-in environment variables must not create monitoring without reviewed channels",
  );
  assertMonitoring(
    rootRoute.includes('name: "bazoria-uptime-marker"') &&
      rootRoute.includes('BAZORIA_UPTIME_MARKER = "bazoria-public-catalog-v1"'),
    "the public root does not contain the bounded uptime marker",
  );
}

export function validateMonitoringContract() {
  const catalog = readJson(join(infrastructureRoot, "monitoring-catalog.json"));
  validateMonitoringCatalog(catalog);
  validateSource();
  for (const [environment, projectId] of [
    ["uat", "bazoria-uat-lnlabs"],
    ["production", "bazoria-prod-lnlabs"],
  ]) {
    assertMonitoring(
      notificationChannelsAreValid({
        channels: [`projects/${projectId}/notificationChannels/test-${environment}`],
        projectId,
      }),
      `${environment} example notification channel was rejected`,
    );
  }
  return {
    alertPoliciesPerEnvironment: 10,
    environments: ["uat", "production"],
    loggingMetricsPerEnvironment: 5,
    uptimeChecksPerEnvironment: 2,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(
      `${JSON.stringify({ status: "passed", ...validateMonitoringContract() })}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
