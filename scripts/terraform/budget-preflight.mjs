import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reviewedEnvironments = {
  uat: {
    billing_account_id: "014CA9-692646-D9E4CE",
    project_id: "bazoria-uat-lnlabs",
    project_number: "145571383840",
  },
  production: {
    billing_account_id: "014CA9-692646-D9E4CE",
    project_id: "bazoria-prod-lnlabs",
    project_number: "787649115343",
  },
};

function fail(message) {
  throw new Error(`terraform_budget_preflight_invalid: ${message}`);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail("an input file is missing or is not valid JSON");
  }
}

export function validateReviewedBudgetInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("budget input must be an object");
  }

  const reviewed = reviewedEnvironments[input.environment];
  if (!reviewed) fail("environment must be uat or production");
  for (const field of ["billing_account_id", "project_id", "project_number"]) {
    if (input[field] !== reviewed[field]) fail(`${field} differs from the reviewed environment`);
  }
  if (typeof input.monthly_amount !== "number" || !Number.isFinite(input.monthly_amount)) {
    fail("monthly_amount must be a finite number");
  }
  if (input.monthly_amount <= 0) fail("monthly_amount must be greater than zero");
  if (!Number.isInteger(input.monthly_amount * 1_000_000_000)) {
    fail("monthly_amount must have at most nine decimal places");
  }
  if (typeof input.currency_code !== "string" || !/^[A-Z]{3}$/.test(input.currency_code)) {
    fail("currency_code must be a three-letter uppercase currency code");
  }
  if (
    !Array.isArray(input.notification_channel_names) ||
    input.notification_channel_names.length < 1 ||
    input.notification_channel_names.length > 5
  ) {
    fail("one to five notification channels are required");
  }
  if (new Set(input.notification_channel_names).size !== input.notification_channel_names.length) {
    fail("notification channels must be unique");
  }
  const channelPattern = new RegExp(
    `^projects/${input.project_id}/notificationChannels/[A-Za-z0-9_-]+$`,
  );
  if (!input.notification_channel_names.every((name) => channelPattern.test(name))) {
    fail("notification channels must be full resource names from the reviewed project");
  }

  return input;
}

export function validateNotificationChannelMetadata(metadata, expectedName) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    fail("notification channel metadata is malformed");
  }
  if (metadata.name !== expectedName) fail("notification channel name differs from the request");
  if (metadata.type !== "email") fail("notification channel type must be email");
  if (metadata.verificationStatus !== "VERIFIED") {
    fail("notification channel must be verified");
  }
  if (metadata.enabled !== true) fail("notification channel must be enabled");
  return true;
}

function describeChannel(name, projectId) {
  try {
    const output = execFileSync(
      "gcloud",
      [
        "beta",
        "monitoring",
        "channels",
        "describe",
        name,
        `--project=${projectId}`,
        "--format=json(name,type,verificationStatus,enabled)",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return JSON.parse(output);
  } catch {
    fail("Cloud Monitoring notification-channel lookup failed");
  }
}

export function runBudgetPreflight(input, channelReader = describeChannel) {
  const reviewed = validateReviewedBudgetInput(input);
  for (const name of reviewed.notification_channel_names) {
    validateNotificationChannelMetadata(channelReader(name, reviewed.project_id), name);
  }
  return {
    channelCount: reviewed.notification_channel_names.length,
    environment: reviewed.environment,
    projectId: reviewed.project_id,
    status: "passed",
  };
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) fail("expected --environment-file and --review-file");
    values[key.slice(2)] = value;
  }
  if (!values["environment-file"] || !values["review-file"] || Object.keys(values).length !== 2) {
    fail("expected exactly --environment-file and --review-file");
  }
  return values;
}

function main() {
  const argumentsByName = parseArguments(process.argv.slice(2));
  const input = {
    ...readJson(resolve(argumentsByName["environment-file"])),
    ...readJson(resolve(argumentsByName["review-file"])),
  };
  process.stdout.write(`${JSON.stringify(runBudgetPreflight(input))}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
