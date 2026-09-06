import { describe, expect, it } from "vitest";

import { buildReleaseRecord, validateFinalizeInputs } from "./uat-release-finalize.mjs";

const values = {
  commit: "a".repeat(40),
  digest: `sha256:${"b".repeat(64)}`,
  planFingerprint: "c".repeat(64),
  guidedChecklistVersion: "0038f4-v1",
  guidedChecklistConfirmed: true,
  environment: "uat",
  smokeStatus: "passed",
  edgeStatus: "verified",
  migrations: [{ version: "20260101000000", checksum: "d".repeat(64) }],
  imageReference: "europe-west3-docker.pkg.dev/project/repository/bazoria-web",
  buildId: "release-" + "a".repeat(40),
  applyResult: "apply-123",
  repository: "owner/repository",
  workflow: "UAT runtime release",
  runId: "123",
  runAttempt: "1",
  requester: "operator",
  runUrl: "https://github.com/owner/repository/actions/runs/123",
  finalizedAt: "2026-09-06T12:00:00.000Z",
};

describe("UAT release finalization", () => {
  it("builds a canonical release record", () => {
    expect(buildReleaseRecord(values)).toMatchObject({
      schemaVersion: 1,
      environment: "uat",
      commit: values.commit,
      digest: values.digest,
      guidedChecklist: { version: "0038f4-v1", confirmed: true },
      previousDeployedUatDigest: null,
    });
  });

  it("rejects unconfirmed guided acceptance", () => {
    expect(() => validateFinalizeInputs({ ...values, guidedChecklistConfirmed: false })).toThrow(
      "guided checklist is not confirmed",
    );
  });

  it("rejects a malformed plan fingerprint", () => {
    expect(() => validateFinalizeInputs({ ...values, planFingerprint: "bad" })).toThrow(
      "plan fingerprint is invalid",
    );
  });
});
