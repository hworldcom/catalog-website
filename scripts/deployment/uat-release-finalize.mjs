import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const commitPattern = /^[0-9a-f]{40}$/u;
const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const fingerprintPattern = /^[0-9a-f]{64}$/u;

export function failFinalize(message) {
  throw new Error(`uat_release_finalize_invalid: ${message}`);
}

function required(value, label) {
  if (typeof value !== "string" || value.length === 0) failFinalize(`missing ${label}`);
  return value;
}

export function validateFinalizeInputs(values) {
  const commit = required(values.commit, "commit");
  const digest = required(values.digest, "digest");
  if (!commitPattern.test(commit)) failFinalize("commit is invalid");
  if (!digestPattern.test(digest)) failFinalize("digest is invalid");
  if (!fingerprintPattern.test(values.planFingerprint ?? "")) {
    failFinalize("plan fingerprint is invalid");
  }
  if (values.guidedChecklistConfirmed !== true) {
    failFinalize("guided checklist is not confirmed");
  }
  required(values.guidedChecklistVersion, "guided checklist version");
  return { commit, digest };
}

export function buildReleaseRecord(values) {
  const { commit, digest } = validateFinalizeInputs(values);
  if (values.environment !== "uat") failFinalize("environment is not UAT");
  if (values.smokeStatus !== "passed") failFinalize("smoke validation did not pass");
  if (values.edgeStatus !== "verified") failFinalize("UAT edge is not verified");
  if (!Array.isArray(values.migrations)) failFinalize("migration target is malformed");

  const record = {
    schemaVersion: 1,
    environment: "uat",
    commit,
    digest,
    imageReference: required(values.imageReference, "image reference"),
    buildId: required(values.buildId, "build identifier"),
    migrations: values.migrations,
    configurationNames: [...(values.configurationNames ?? [])].sort(),
    secretVersions: [...(values.secretVersions ?? [])].sort(),
    planFingerprint: required(values.planFingerprint, "plan fingerprint"),
    applyResult: required(values.applyResult, "apply result"),
    automatedSmoke: { status: values.smokeStatus },
    guidedChecklist: {
      version: values.guidedChecklistVersion,
      confirmed: true,
    },
    workflow: {
      repository: required(values.repository, "repository"),
      workflow: required(values.workflow, "workflow"),
      runId: required(values.runId, "workflow run identifier"),
      runAttempt: required(values.runAttempt, "workflow run attempt"),
      requester: required(values.requester, "requester"),
      url: required(values.runUrl, "workflow URL"),
    },
    previousDeployedUatDigest: values.previousDeployedUatDigest ?? null,
    timestamps: { finalizedAt: required(values.finalizedAt, "finalization timestamp") },
  };

  return {
    ...record,
    recordChecksum: createHash("sha256").update(JSON.stringify(record)).digest("hex"),
  };
}

if (process.argv[1]?.endsWith("/uat-release-finalize.mjs")) {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) failFinalize("usage is <input.json> <output.json>");
  const values = JSON.parse(readFileSync(input, "utf8"));
  writeFileSync(output, `${JSON.stringify(buildReleaseRecord(values), null, 2)}\n`);
}
