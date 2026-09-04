import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";

const options = parseArguments(process.argv.slice(2));
const image = options.image ?? process.env.BAZORIA_CONTAINER_QA_IMAGE ?? "bazoria-web:0038a-qa";
const containerPrefix = `bazoria-web-0038a-qa-${process.pid}`;
const configurationCatalog = JSON.parse(
  readFileSync("deployment/configuration-catalog.json", "utf8"),
);

try {
  assertFixtureBundleExcludedFromBuildContext();
  if (!options.skipBuild) {
    run("docker", [
      "build",
      "--platform",
      "linux/amd64",
      "--build-arg",
      `BAZORIA_RELEASE_COMMIT=${options.expectedReleaseCommit}`,
      "--build-arg",
      `BAZORIA_BUILD_ID=${options.expectedBuildId}`,
      "--tag",
      image,
      ".",
    ]);
  }

  assertImageReleaseIdentity();

  const user = capture("docker", ["image", "inspect", "--format", "{{.Config.User}}", image]);
  if (user !== "65532") {
    throw new Error(`Expected Distroless non-root image user 65532, received ${user}.`);
  }
  const architecture = capture("docker", [
    "image",
    "inspect",
    "--format",
    "{{.Architecture}}",
    image,
  ]);
  if (architecture !== "amd64") {
    throw new Error(`Expected linux/amd64 image, received ${architecture}.`);
  }
  run("docker", [
    "run",
    "--rm",
    "--platform",
    "linux/amd64",
    image,
    "-e",
    "const{existsSync}=require('node:fs');if(existsSync('node_modules/vitest')||existsSync('node_modules/eslint'))process.exit(1)",
  ]);
  run("docker", [
    "run",
    "--rm",
    "--platform",
    "linux/amd64",
    image,
    "-e",
    `
      const { existsSync, readdirSync } = require("node:fs");
      const { join } = require("node:path");
      if (existsSync("deployment/fixtures/uat")) process.exit(1);
      const visit = (root) => {
        for (const entry of readdirSync(root, { withFileTypes: true })) {
          const path = join(root, entry.name);
          if (entry.isDirectory()) visit(path);
          else if (entry.isFile() && entry.name === "manifest.json" && path.includes("/0038d/assets/")) {
            process.exit(1);
          }
        }
      };
      visit("/app");
    `,
  ]);
  run("docker", [
    "run",
    "--rm",
    "--platform",
    "linux/amd64",
    image,
    "-e",
    "require('sharp')({create:{width:1,height:1,channels:4,background:'#000'}}).png().toBuffer().then((buffer)=>{if(buffer.length===0)process.exit(1)})",
  ]);

  const uat = await runWebContainer("uat", {
    expectedConfig: {
      environment: "uat",
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "sb_publishable_browser-key",
      classifierAssistedUploadEnabled: false,
      canonicalSiteOrigin: "https://uat.example.com",
      googleSignInEnabled: false,
    },
  });
  const production = await runWebContainer("production", {
    expectedConfig: {
      environment: "production",
      supabaseUrl: "https://production.supabase.co",
      supabasePublishableKey: "sb_publishable_production-key",
      classifierAssistedUploadEnabled: false,
      canonicalSiteOrigin: "https://www.example.com",
      googleSignInEnabled: false,
    },
  });
  if (uat.assetHash !== production.assetHash) {
    throw new Error("Browser assets changed between runtime configurations.");
  }

  await runWorkerContainer();
  assertReconciliationRejectsInvalidConfiguration();
  process.stdout.write("Container runtime QA passed for all three roles.\n");
} finally {
  removeContainersByPrefix();
}

async function runWebContainer(label, { expectedConfig }) {
  const containerName = `${containerPrefix}-web-${label}`;
  const port = await availablePort();
  const values = {
    ...webEnvironment(),
    BAZORIA_DEPLOYMENT_ENVIRONMENT: expectedConfig.environment,
    BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED: String(
      expectedConfig.classifierAssistedUploadEnabled,
    ),
    BAZORIA_GOOGLE_SIGN_IN_ENABLED: String(expectedConfig.googleSignInEnabled),
    BAZORIA_PUBLIC_SITE_URL: expectedConfig.canonicalSiteOrigin,
    SUPABASE_URL: expectedConfig.supabaseUrl,
    SUPABASE_PUBLISHABLE_KEY: expectedConfig.supabasePublishableKey,
    PORT: "8080",
  };

  runDetachedContainer(containerName, port, values);
  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForStatus(`${baseUrl}/healthz`, 204);
    const version = await getJson(`${baseUrl}/version`);
    const runtimeConfig = await getJson(`${baseUrl}/api/runtime-config`);
    assertEqual(
      version,
      {
        releaseCommit: options.expectedReleaseCommit,
        buildId: options.expectedBuildId,
      },
      "version",
    );
    assertEqual(runtimeConfig, expectedConfig, `${label} runtime configuration`);
    assertContainerBrowserBoundary(containerName, values);
    return { assetHash: browserAssetHash(containerName) };
  } finally {
    removeContainer(containerName);
  }
}

async function runWorkerContainer() {
  const containerName = `${containerPrefix}-worker`;
  const port = await availablePort();
  const values = {
    BAZORIA_DEPLOYMENT_ENVIRONMENT: "uat",
    BAZORIA_PRODUCT_PUBLICATION_MAXIMUM_IMAGE_COUNT: "20",
    BAZORIA_PRODUCT_PUBLICATION_ITEM_CONCURRENCY: "3",
    BAZORIA_PRODUCT_PUBLICATION_ITEM_TIMEOUT_SECONDS: "30",
    BAZORIA_PRODUCT_PUBLICATION_WORKER_DEADLINE_SECONDS: "240",
    BAZORIA_PRODUCT_PUBLICATION_CLAIM_TIMEOUT_SECONDS: "360",
    BAZORIA_PRODUCT_PUBLICATION_TASK_MAXIMUM_ATTEMPTS: "10",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "qa-service-role-key",
    BAZORIA_PRODUCT_PUBLICATION_TASK_AUDIENCE: "https://worker.example.com/",
    BAZORIA_PRODUCT_PUBLICATION_TASK_SERVICE_ACCOUNT: "task@example.com",
    PORT: "8080",
  };
  runDetachedContainer(containerName, port, values, {
    entrypoint: "/nodejs/bin/node",
    args: [".output/commands/product-activation-worker.mjs"],
  });
  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForStatus(`${baseUrl}/health`, 204);
    await waitForStatus(`${baseUrl}/`, 404);
  } finally {
    removeContainer(containerName);
  }
}

function assertReconciliationRejectsInvalidConfiguration() {
  const result = execFileSyncWithStatus("docker", [
    "run",
    "--rm",
    "--platform",
    "linux/amd64",
    "--env",
    "BAZORIA_DEPLOYMENT_ENVIRONMENT=uat",
    "--entrypoint",
    "/nodejs/bin/node",
    image,
    ".output/commands/product-activation-reconciliation.mjs",
  ]);
  if (result.status === 0) {
    throw new Error("Reconciliation accepted an incomplete role configuration.");
  }
}

function assertFixtureBundleExcludedFromBuildContext() {
  const patterns = readFileSync(".dockerignore", "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim());
  if (!patterns.includes("deployment/fixtures/uat")) {
    throw new Error("UAT fixture assets are not excluded from the container build context.");
  }
}

function assertImageReleaseIdentity() {
  const values = JSON.parse(
    capture("docker", ["image", "inspect", "--format", "{{json .Config.Env}}", image]),
  );
  const environment = Object.fromEntries(values.map((entry) => entry.split(/=(.*)/su).slice(0, 2)));
  assertEqual(
    {
      releaseCommit: environment.BAZORIA_RELEASE_COMMIT,
      buildId: environment.BAZORIA_BUILD_ID,
    },
    {
      releaseCommit: options.expectedReleaseCommit,
      buildId: options.expectedBuildId,
    },
    "image release identity",
  );
}

function parseArguments(argv) {
  const parsed = {
    expectedBuildId: "qa-build",
    expectedReleaseCommit: "qa-commit",
    image: null,
    providedExpectedBuildId: false,
    providedExpectedReleaseCommit: false,
    skipBuild: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--skip-build") {
      parsed.skipBuild = true;
      continue;
    }
    if (
      argument === "--expected-release-commit" ||
      argument === "--expected-build-id" ||
      argument === "--image"
    ) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      const key = {
        "--expected-release-commit": "expectedReleaseCommit",
        "--expected-build-id": "expectedBuildId",
        "--image": "image",
      }[argument];
      parsed[key] = value;
      if (key === "expectedReleaseCommit") parsed.providedExpectedReleaseCommit = true;
      if (key === "expectedBuildId") parsed.providedExpectedBuildId = true;
      index += 1;
      continue;
    }
    throw new Error(`Unsupported container QA argument: ${argument}.`);
  }
  if (
    parsed.skipBuild &&
    (!parsed.image || !parsed.providedExpectedReleaseCommit || !parsed.providedExpectedBuildId)
  ) {
    throw new Error("Prebuilt container QA requires the expected release commit and build ID.");
  }
  return parsed;
}

function webEnvironment() {
  return {
    SUPABASE_SERVICE_ROLE_KEY: "qa-service-role-key",
    OPENAI_API_KEY: "sk-qa-browser-boundary-sentinel-key",
    BAZORIA_PRODUCT_PUBLICATION_DISPATCH_MODE: "cloud_tasks",
    GOOGLE_CLOUD_PROJECT: "bazoria-uat",
    BAZORIA_PRODUCT_PUBLICATION_TASK_LOCATION: "europe-west3",
    BAZORIA_PRODUCT_PUBLICATION_TASK_QUEUE: "product-activation",
    BAZORIA_PRODUCT_PUBLICATION_WORKER_URL: "https://worker.example.com",
    BAZORIA_PRODUCT_PUBLICATION_TASK_SERVICE_ACCOUNT: "task@example.com",
    BAZORIA_PRODUCT_PUBLICATION_TASK_AUDIENCE: "https://worker.example.com/",
    BAZORIA_PRODUCT_PUBLICATION_TASK_DISPATCH_DEADLINE_SECONDS: "270",
    BAZORIA_PRODUCT_PUBLICATION_TASK_MAX_RETRY_DURATION_SECONDS: "420",
  };
}

function assertContainerBrowserBoundary(containerName, values) {
  const entries = new Map(
    configurationCatalog.environmentVariables.map((entry) => [entry.name, entry]),
  );
  const forbiddenNames = configurationCatalog.environmentVariables
    .filter((entry) => entry.exposure.browserAssets === "forbidden")
    .map((entry) => entry.name);
  const forbiddenValues = Object.entries(values)
    .filter(([name]) =>
      ["server_secret", "protected_github_secret", "fixture_only_secret"].includes(
        entries.get(name)?.valueClass,
      ),
    )
    .map(([, value]) => value);
  const payload = Buffer.from(JSON.stringify({ forbiddenNames, forbiddenValues })).toString(
    "base64",
  );
  const result = execFileSyncWithStatus("docker", [
    "exec",
    containerName,
    "/nodejs/bin/node",
    "-e",
    `
      const { readdirSync, readFileSync } = require("node:fs");
      const { join } = require("node:path");
      const contract = JSON.parse(Buffer.from(process.argv[1], "base64").toString("utf8"));
      const files = [];
      const visit = (root) => {
        for (const entry of readdirSync(root, { withFileTypes: true })) {
          const path = join(root, entry.name);
          if (entry.isDirectory()) visit(path);
          else if (entry.isFile()) files.push(path);
        }
      };
      visit(".output/public");
      for (const path of files) {
        const contents = readFileSync(path);
        for (const value of [...contract.forbiddenNames, ...contract.forbiddenValues]) {
          if (contents.includes(Buffer.from(value))) process.exit(1);
        }
      }
    `,
    payload,
  ]);
  if (result.status !== 0) {
    throw new Error("Container browser output contains a forbidden server name or value.");
  }
}

function runDetachedContainer(containerName, port, values, options = {}) {
  run("docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    containerName,
    "--platform",
    "linux/amd64",
    "--publish",
    `127.0.0.1:${port}:8080`,
    ...environmentArguments(values),
    ...(options.entrypoint ? ["--entrypoint", options.entrypoint] : []),
    image,
    ...(options.args ?? []),
  ]);
}

function environmentArguments(values) {
  return Object.entries(values).flatMap(([name, value]) => ["--env", `${name}=${value}`]);
}

function browserAssetHash(containerName) {
  const manifest = capture("docker", [
    "exec",
    containerName,
    "/nodejs/bin/node",
    "-e",
    `
      const { createHash } = require("node:crypto");
      const { readdirSync, readFileSync } = require("node:fs");
      const { join } = require("node:path");
      const files = [];
      const visit = (root) => {
        for (const entry of readdirSync(root, { withFileTypes: true })) {
          const path = join(root, entry.name);
          if (entry.isDirectory()) visit(path);
          else if (entry.isFile()) files.push(path);
        }
      };
      visit(".output/public/assets");
      const result = files.sort().map((path) => ({
        path,
        digest: createHash("sha256").update(readFileSync(path)).digest("hex"),
      }));
      process.stdout.write(JSON.stringify(result));
    `,
  ]);
  return createHash("sha256").update(manifest).digest("hex");
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a QA port.");
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function waitForStatus(url, expectedStatus) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status === expectedStatus) return;
    } catch {
      // The container may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} did not return ${expectedStatus} within 60 seconds.`);
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}.`);
  return response.json();
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected ${label}: ${JSON.stringify(actual)}.`);
  }
}

function run(command, args) {
  execFileSync(command, args, { cwd: process.cwd(), stdio: "inherit" });
}

function capture(command, args) {
  return execFileSync(command, args, { cwd: process.cwd(), encoding: "utf8" }).trim();
}

function execFileSyncWithStatus(command, args) {
  try {
    execFileSync(command, args, { cwd: process.cwd(), stdio: "pipe" });
    return { status: 0 };
  } catch (error) {
    return { status: typeof error.status === "number" ? error.status : 1 };
  }
}

function removeContainer(containerName) {
  try {
    execFileSync("docker", ["rm", "--force", containerName], { stdio: "ignore" });
  } catch {
    // The detached container may already have exited.
  }
}

function removeContainersByPrefix() {
  const names = capture("docker", [
    "ps",
    "--all",
    "--filter",
    `name=${containerPrefix}`,
    "--format",
    "{{.Names}}",
  ]);
  if (!names) return;
  for (const name of names.split("\n")) removeContainer(name);
}
