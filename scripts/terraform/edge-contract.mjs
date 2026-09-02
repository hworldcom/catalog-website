import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const infrastructureRoot = join(repositoryRoot, "infrastructure/google-cloud");

function assertEdge(condition, message) {
  if (!condition) throw new Error(`terraform_edge_contract_invalid: ${message}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function validateEdgeCatalog(catalog) {
  assertEdge(catalog.schemaVersion === 1, "edge catalog schema differs");
  assertEdge(catalog.loadBalancingScheme === "EXTERNAL_MANAGED", "edge scheme differs");
  assertEdge(catalog.networkTier === "PREMIUM", "edge network tier differs");
  assertEdge(catalog.ipVersion === "IPV4", "edge IP version differs");
  assertEdge(
    JSON.stringify(catalog.ports) === JSON.stringify({ http: 80, https: 443 }),
    "edge listener ports differ",
  );
  assertEdge(
    JSON.stringify(catalog.backend) ===
      JSON.stringify({ protocol: "HTTP", enableCdn: false, timeoutSeconds: 120 }),
    "edge backend differs",
  );
  assertEdge(
    JSON.stringify(catalog.certificate) ===
      JSON.stringify({
        location: "global",
        authorizationType: "PER_PROJECT_RECORD",
        scope: "DEFAULT",
      }),
    "edge certificate contract differs",
  );
  assertEdge(
    JSON.stringify(catalog.tls) ===
      JSON.stringify({ profile: "MODERN", minimumVersion: "TLS_1_2" }),
    "edge TLS contract differs",
  );
  assertEdge(
    JSON.stringify(catalog.redirect) ===
      JSON.stringify({ responseCode: "MOVED_PERMANENTLY_DEFAULT", stripQuery: false }),
    "edge redirect contract differs",
  );
  assertEdge(
    Object.keys(catalog.resourceSuffixes).length === 14 &&
      Object.values(catalog.resourceSuffixes).every((value) =>
        /^[a-z][a-z0-9-]*[a-z0-9]$/.test(value),
      ),
    "edge resource suffixes differ",
  );
}

function validateSource() {
  const moduleRoot = join(infrastructureRoot, "modules/custom-domain-load-balancer");
  const moduleSource = ["main.tf", "outputs.tf", "variables.tf", "versions.tf"]
    .map((file) => readFileSync(join(moduleRoot, file), "utf8"))
    .join("\n");
  const platformSource = readFileSync(join(infrastructureRoot, "platform/main.tf"), "utf8");
  const runtimeModuleSource = readFileSync(
    join(infrastructureRoot, "modules/runtime-activation-platform/main.tf"),
    "utf8",
  );
  const environmentVariables = ["uat", "production"]
    .map((environment) =>
      readFileSync(
        join(infrastructureRoot, `environments/${environment}/platform.tfvars.json`),
        "utf8",
      ),
    )
    .join("\n");

  for (const required of [
    'resource "google_compute_global_address" "website"',
    'resource "google_compute_region_network_endpoint_group" "website"',
    'network_endpoint_type = "SERVERLESS"',
    'resource "google_compute_backend_service" "website"',
    'resource "google_compute_url_map" "https"',
    'resource "google_compute_url_map" "http_redirect"',
    'resource "google_compute_ssl_policy" "website"',
    'resource "google_certificate_manager_dns_authorization" "website"',
    'resource "google_certificate_manager_certificate" "website"',
    'resource "google_certificate_manager_certificate_map" "website"',
    'resource "google_certificate_manager_certificate_map_entry" "website"',
    'resource "google_compute_target_https_proxy" "website"',
    'resource "google_compute_target_http_proxy" "redirect"',
    'resource "google_compute_global_forwarding_rule" "https"',
    'resource "google_compute_global_forwarding_rule" "http"',
    'certificate_map = "//certificatemanager.googleapis.com/',
    "https_redirect         = true",
  ]) {
    assertEdge(moduleSource.includes(required), `edge module is missing ${required}`);
  }
  for (const forbidden of [
    "google_cloud_run_domain_mapping",
    'load_balancing_scheme = "EXTERNAL"',
    "enable_cdn = true",
    "allUsers",
    "allAuthenticatedUsers",
  ]) {
    assertEdge(!moduleSource.includes(forbidden), `edge module contains ${forbidden}`);
  }
  assertEdge(
    (moduleSource.match(/prevent_destroy\s*=\s*true/g) ?? []).length === 5,
    "fixed address and Certificate Manager resources must be destruction-protected",
  );
  assertEdge(
    platformSource.includes('module "custom_domain_load_balancer"') &&
      platformSource.includes(
        'website_service_name      = module.runtime_activation_platform["enabled"].runtime_inventory.website.name',
      ),
    "platform root does not connect edge infrastructure to the digest-bound website",
  );
  assertEdge(
    (platformSource.match(/for_each\s*=\s*var\.runtime_configuration == null \? \{\}/g) ?? [])
      .length === 2,
    "runtime and edge modules must share the same explicit activation boundary",
  );
  assertEdge(
    !environmentVariables.includes("runtime_configuration") &&
      !environmentVariables.includes("edge_configuration"),
    "checked-in environment variables must not activate edge infrastructure",
  );
  assertEdge(
    runtimeModuleSource.includes(
      'ingress             = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"',
    ) && !runtimeModuleSource.includes('ingress             = "INGRESS_TRAFFIC_ALL"'),
    "the website must reject direct public Cloud Run ingress",
  );
}

export function validateEdgeContract() {
  const catalog = readJson(join(infrastructureRoot, "edge-catalog.json"));
  const runtime = readJson(join(infrastructureRoot, "runtime-catalog.json"));
  validateEdgeCatalog(catalog);
  validateSource();
  assertEdge(
    JSON.stringify(runtime.canonicalOrigins) ===
      JSON.stringify({
        uat: "https://uat2026.bazoria.pl",
        production: "https://bazoria.pl",
      }),
    "edge and runtime canonical origins differ",
  );

  return {
    edgeResourcesPerEnvironment: 14,
    environments: ["uat", "production"],
    protectedResourcesPerEnvironment: 5,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify({ status: "passed", ...validateEdgeContract() })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
