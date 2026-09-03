import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readConfigurationCatalog } from "./configuration-contract.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const browserOutputPath = ".output/public";

function fail(message) {
  throw new Error(`browser_output_contract_invalid: ${message}`);
}

export function createBrowserBuildSentinels(catalog, nonce = randomUUID()) {
  const sentinels = [];
  for (const entry of catalog.environmentVariables) {
    if (
      entry.status === "active" &&
      ["server_secret", "protected_github_secret", "fixture_only_secret"].includes(entry.valueClass)
    ) {
      sentinels.push({
        name: entry.name,
        value: sentinelValue(entry.name, nonce),
      });
    }
  }
  sentinels.push({
    name: "BAZORIA_BROWSER_OUTPUT_SIGNED_URL_SENTINEL",
    value: `https://storage.invalid/private-object?signature=bazoria-${nonce}`,
  });
  return sentinels;
}

function sentinelValue(name, nonce) {
  if (name.includes("DATABASE_URL")) {
    return `postgresql://audit:bazoria-${nonce}-${name.toLowerCase()}@database.invalid:5432/catalog`;
  }
  if (name === "OPENAI_API_KEY") return `sk-bazoria-${nonce}`;
  if (name.includes("SERVICE_ROLE_KEY")) return `sb_secret_bazoria_${nonce}`;
  return `bazoria-server-secret-${nonce}-${name.toLowerCase()}`;
}

export function assertBrowserOutputSafe({ publicDirectory, forbiddenNames, sentinels }) {
  if (!statSync(publicDirectory, { throwIfNoEntry: false })?.isDirectory()) {
    fail("browser output directory is missing");
  }
  const files = listFiles(publicDirectory);
  for (const path of files) {
    const contents = readFileSync(path);
    for (const name of forbiddenNames) {
      if (contents.includes(Buffer.from(name))) {
        fail(`forbidden server-only name ${name} appears in browser output`);
      }
    }
    for (const sentinel of sentinels) {
      if (contents.includes(Buffer.from(sentinel.value))) {
        fail(`${sentinel.name} appears in browser output`);
      }
    }
  }
  return { filesScanned: files.length };
}

function listFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export function runBrowserOutputBuildAudit(root = repositoryRoot) {
  const catalog = readConfigurationCatalog(root);
  const sentinels = createBrowserBuildSentinels(catalog);
  const environment = { ...process.env };
  for (const sentinel of sentinels) {
    if (/^[A-Z][A-Z0-9_]*$/u.test(sentinel.name)) environment[sentinel.name] = sentinel.value;
  }

  execFileSync("npm", ["run", "build"], {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });

  const forbiddenNames = catalog.environmentVariables
    .filter((entry) => entry.exposure.browserAssets === "forbidden")
    .map((entry) => entry.name);
  const result = assertBrowserOutputSafe({
    publicDirectory: join(root, browserOutputPath),
    forbiddenNames,
    sentinels,
  });
  return { ...result, sentinelsChecked: sentinels.length };
}

function isDirectExecution() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  try {
    const result = runBrowserOutputBuildAudit();
    process.stdout.write(`${JSON.stringify({ status: "passed", ...result })}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "browser_output_contract_failed"}\n`,
    );
    process.exitCode = 1;
  }
}
