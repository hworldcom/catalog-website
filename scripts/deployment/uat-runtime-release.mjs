import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;

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
    changes,
  });
}

export function fingerprint(plan, inputs) {
  return createHash("sha256").update(normalizedPlan(plan, inputs)).digest("hex");
}

export function main(argv = process.argv) {
  const operation = argv[2];
  if (!["fingerprint", "assert-fingerprint"].includes(operation)) {
    throw new Error("uat_runtime_release_invalid: unsupported operation");
  }

  const inputs = validateInputs(argv);
  const planPath = requireValue(argument(argv, "--plan"), "plan");
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const value = fingerprint(plan, inputs);

  if (operation === "fingerprint") {
    writeFileSync(requireValue(argument(argv, "--output"), "output"), value);
  } else if (value !== requireValue(argument(argv, "--expected"), "expected fingerprint")) {
    throw new Error("uat_runtime_release_plan_fingerprint_mismatch");
  }
}

if (process.argv[1]?.endsWith("/uat-runtime-release.mjs")) main();
