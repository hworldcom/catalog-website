import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDocument } from "yaml";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workflowPath = ".github/workflows/continuous-integration.yml";
const validationJobs = [
  "configuration-and-secrets",
  "application",
  "container",
  "database",
  "terraform",
];
const timeouts = {
  "configuration-and-secrets": 15,
  application: 30,
  container: 30,
  database: 45,
  terraform: 30,
  required: 5,
};

function fail(message) {
  throw new Error(`continuous_integration_contract_invalid: ${message}`);
}

export function assertAggregateResults(results) {
  if (!results || typeof results !== "object" || Array.isArray(results)) {
    fail("aggregate results are invalid");
  }
  const names = Object.keys(results).sort();
  if (JSON.stringify(names) !== JSON.stringify([...validationJobs].sort())) {
    fail("aggregate results do not contain exactly the validation jobs");
  }
  const failed = names.filter((name) => results[name]?.result !== "success");
  if (failed.length > 0) fail(`validation jobs did not succeed: ${failed.join(", ")}`);
  return true;
}

export function validateContinuousIntegrationWorkflow(source) {
  const document = parseDocument(source, { prettyErrors: false });
  if (document.errors.length > 0) fail("workflow is not valid YAML");
  const workflow = document.toJS();
  const triggers = workflow.on;
  if (!triggers?.pull_request || !triggers?.push)
    fail("pull request and push triggers are required");
  if (Object.hasOwn(triggers.pull_request, "paths") || Object.hasOwn(triggers.push, "paths")) {
    fail("path-based skipping is forbidden");
  }
  if (JSON.stringify(triggers.push.branches) !== JSON.stringify(["main"])) {
    fail("push must target only main");
  }
  if (JSON.stringify(workflow.permissions) !== JSON.stringify({ contents: "read" })) {
    fail("workflow permissions must contain only contents read");
  }
  if (
    workflow.concurrency?.["cancel-in-progress"] !== true ||
    !String(workflow.concurrency?.group).includes("github.event.pull_request.number || github.ref")
  ) {
    fail("workflow concurrency must cancel superseded pull request and branch runs");
  }

  const jobs = workflow.jobs ?? {};
  const expectedJobs = [...validationJobs, "required"].sort();
  if (JSON.stringify(Object.keys(jobs).sort()) !== JSON.stringify(expectedJobs)) {
    fail("workflow must contain exactly the contracted jobs");
  }
  const serialized = JSON.stringify(workflow);
  if (/\$\{\{\s*(?:secrets|vars)\./u.test(serialized) || /["']id-token["']\s*:/u.test(source)) {
    fail("hosted variables, secrets, and identity tokens are forbidden");
  }
  if (
    /db:environment|uat-marketplace-fixtures|terraform\s+apply|\bgcloud\b|api\.openai\.com/iu.test(
      source,
    )
  ) {
    fail("hosted environment operations are forbidden");
  }

  for (const [name, job] of Object.entries(jobs)) {
    if (job["runs-on"] !== "ubuntu-24.04") fail(`${name} must use ubuntu-24.04`);
    if (job["timeout-minutes"] !== timeouts[name]) fail(`${name} has an invalid timeout`);
    if (job.environment !== undefined) fail(`${name} must not use a protected environment`);
  }

  for (const name of validationJobs) {
    const job = jobs[name];
    if (job.needs !== undefined) fail(`${name} must be independent`);
    validateNodeJob(name, job);
  }

  const required = jobs.required;
  if (required.name !== "Bazoria continuous integration") fail("aggregate display name changed");
  if (!String(required.if).includes("always()")) fail("aggregate job must always run");
  if (JSON.stringify([...required.needs].sort()) !== JSON.stringify([...validationJobs].sort())) {
    fail("aggregate job must depend on every validation job");
  }
  const aggregateRun = required.steps?.map((step) => step.run ?? "").join("\n") ?? "";
  if (
    !aggregateRun.includes("(keys | length) == 5") ||
    !aggregateRun.includes('all(. == "success")')
  ) {
    fail("aggregate job does not fail closed");
  }
  const configurationCommands = jobs["configuration-and-secrets"].steps
    .map((step) => step.run ?? "")
    .join("\n");
  if (!configurationCommands.includes("npm run deployment:release-artifact:check")) {
    fail("configuration job does not validate the release artifact contract");
  }
  return { jobs: expectedJobs.length, validationJobs: validationJobs.length };
}

function validateNodeJob(name, job) {
  const steps = job.steps ?? [];
  const checkout = steps.find((step) => String(step.uses).startsWith("actions/checkout@"));
  const setupNode = steps.find((step) => String(step.uses).startsWith("actions/setup-node@"));
  const commands = steps.map((step) => step.run ?? "").join("\n");
  if (!checkout || checkout.with?.["persist-credentials"] !== false) {
    fail(`${name} checkout must discard credentials`);
  }
  if (name === "configuration-and-secrets" && checkout.with?.["fetch-depth"] !== 0) {
    fail("secret scan requires complete Git history");
  }
  if (!setupNode || String(setupNode.with?.["node-version"]) !== "22.13.0") {
    fail(`${name} must pin Node.js 22.13.0`);
  }
  for (const requiredCommand of [
    "npm install --global npm@10.9.2",
    'test "$(node --version)" = "v22.13.0"',
    'test "$(npm --version)" = "10.9.2"',
    "npm ci",
  ]) {
    if (!commands.includes(requiredCommand)) fail(`${name} is missing ${requiredCommand}`);
  }
}

export function validateCheckedInContinuousIntegration(root = repositoryRoot) {
  return validateContinuousIntegrationWorkflow(readFileSync(resolve(root, workflowPath), "utf8"));
}

function isDirectExecution() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  try {
    const result = validateCheckedInContinuousIntegration();
    process.stdout.write(`${JSON.stringify({ status: "passed", ...result })}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "continuous_integration_contract_failed"}\n`,
    );
    process.exitCode = 1;
  }
}
