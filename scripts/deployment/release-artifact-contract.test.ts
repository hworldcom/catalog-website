import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildReleaseCoordinates,
  createReleaseHandoff,
  evaluateVulnerabilityReport,
  validateCheckedInReleaseArtifactContract,
  validateDigest,
  validateDispatchInput,
  validateExceptionCatalog,
  verifyBufferChecksum,
} from "./release-artifact-contract.mjs";

const commit = "a".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;
const buildId = `release-${commit}`;

describe("release artifact contract", () => {
  it("validates the checked-in release workflow and catalog", () => {
    expect(validateCheckedInReleaseArtifactContract()).toEqual({
      environment: "uat",
      operations: 2,
      retentionDays: 7,
      tools: 2,
    });
  });

  it("accepts identity checks and only exact UAT publication inputs", () => {
    expect(
      validateDispatchInput({
        operation: "verify-identity",
        environment: "production",
        gitCommit: "",
      }),
    ).toEqual({ environment: "production", gitCommit: null, operation: "verify-identity" });
    expect(
      validateDispatchInput({ operation: "publish", environment: "uat", gitCommit: commit }),
    ).toEqual({ environment: "uat", gitCommit: commit, operation: "publish" });
    expect(() =>
      validateDispatchInput({ operation: "publish", environment: "production", gitCommit: commit }),
    ).toThrow("publication is limited to UAT");
    expect(() =>
      validateDispatchInput({
        operation: "verify-identity",
        environment: "uat",
        gitCommit: commit,
      }),
    ).toThrow("must not receive git_commit");
  });

  it("builds immutable release coordinates and validates digests", () => {
    expect(buildReleaseCoordinates(commit, buildId)).toEqual({
      artifactName: `uat-release-${commit}`,
      buildId,
      imageReference:
        `europe-west3-docker.pkg.dev/bazoria-uat-lnlabs/` +
        `bazoria-uat-containers/bazoria-web:release-${commit}`,
      tag: `release-${commit}`,
    });
    expect(() => buildReleaseCoordinates(commit, "123-2")).toThrow("build identifier is invalid");
    expect(validateDigest(digest)).toBe(digest);
    expect(() => validateDigest("sha256:ABC")).toThrow("image digest is invalid");
  });

  it("checks downloaded tool bytes before extraction", () => {
    const bytes = Buffer.from("release-tool");
    expect(
      verifyBufferChecksum(
        bytes,
        "699f33621b8ab98db4f87aa3daa3988db42bdec64ac01906a239584bce59cc65",
      ),
    ).toBe("699f33621b8ab98db4f87aa3daa3988db42bdec64ac01906a239584bce59cc65");
    expect(() => verifyBufferChecksum(bytes, "0".repeat(64))).toThrow("checksum does not match");
  });

  it("passes a report with no critical findings and no exceptions", () => {
    expect(
      evaluateVulnerabilityReport({
        report: { matches: [{ vulnerability: { id: "CVE-low", severity: "Low" } }] },
        exceptionCatalog: { schemaVersion: 1, exceptions: [] },
        asOf: "2026-09-04",
      }),
    ).toEqual({
      status: "passed",
      criticalFindingCount: 0,
      exceptedCriticalFindingCount: 0,
      findings: [],
    });
  });

  it("requires an exact, current exception for every critical finding", () => {
    const report = {
      matches: [
        {
          vulnerability: { id: "CVE-2026-1", severity: "Critical" },
          artifact: { name: "package-a", version: "1.2.3", type: "npm" },
        },
      ],
    };
    const exception = {
      id: "CVE-2026-1",
      package: "package-a",
      installedVersion: "1.2.3",
      justification: "No reachable execution path in the release image.",
      owner: "platform",
      removalDate: "2026-09-10",
    };
    expect(
      evaluateVulnerabilityReport({
        report,
        exceptionCatalog: { schemaVersion: 1, exceptions: [exception] },
        asOf: "2026-09-04",
      }).exceptedCriticalFindingCount,
    ).toBe(1);
    expect(() =>
      evaluateVulnerabilityReport({
        report,
        exceptionCatalog: { schemaVersion: 1, exceptions: [] },
        asOf: "2026-09-04",
      }),
    ).toThrow("release_artifact_critical_vulnerability");
    expect(() =>
      validateExceptionCatalog(
        { schemaVersion: 1, exceptions: [{ ...exception, removalDate: "2026-09-03" }] },
        "2026-09-04",
      ),
    ).toThrow("exception is expired");
  });

  it("rejects duplicate and unused vulnerability exceptions", () => {
    const exception = {
      id: "CVE-2026-2",
      package: "package-b",
      installedVersion: "2.0.0",
      justification: "Temporary reviewed exception.",
      owner: "platform",
      removalDate: "2026-09-10",
    };
    expect(() =>
      validateExceptionCatalog(
        { schemaVersion: 1, exceptions: [exception, exception] },
        "2026-09-04",
      ),
    ).toThrow("exception is duplicated");
    expect(() =>
      evaluateVulnerabilityReport({
        report: { matches: [] },
        exceptionCatalog: { schemaVersion: 1, exceptions: [exception] },
        asOf: "2026-09-04",
      }),
    ).toThrow("exception is unused");
  });

  it("creates a bounded handoff for passed release results", () => {
    const imageReference = buildReleaseCoordinates(commit, buildId).imageReference;
    expect(
      createReleaseHandoff({
        commit,
        digest,
        imageReference,
        buildId,
        workflowRunId: "123",
        checksums: {
          dockerfile: "c".repeat(64),
          lockfile: "d".repeat(64),
          softwareBillOfMaterials: "e".repeat(64),
        },
        results: {
          vulnerabilities: { status: "passed" },
          containerHealth: { status: "passed" },
          registryVerification: { status: "passed" },
        },
      }),
    ).toMatchObject({
      schemaVersion: 1,
      commit,
      digest,
      immutableImageReference:
        "europe-west3-docker.pkg.dev/bazoria-uat-lnlabs/" +
        `bazoria-uat-containers/bazoria-web@${digest}`,
    });
  });

  it("keeps the reviewed vulnerability exception catalog exact and current", () => {
    expect(JSON.parse(readFileSync("deployment/vulnerability-exceptions.json", "utf8"))).toEqual({
      schemaVersion: 1,
      exceptions: [
        {
          id: "CVE-2026-5450",
          package: "libc6",
          installedVersion: "2.41-12+deb13u3",
          justification:
            "Debian 13 classifies the scanf %mc issue as minor and has no stable fix; " +
            "Bazoria does not invoke the affected native format path. Remove when Debian " +
            "publishes a fixed libc6 package.",
          owner: "platform",
          removalDate: "2026-09-18",
        },
      ],
    });
  });
});
