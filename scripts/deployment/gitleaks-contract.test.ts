import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  GITLEAKS_RELEASE,
  parseDirectoryScanArgument,
  resolveIntroducedCommitRange,
  validateGitleaksConfiguration,
  verifyArchiveChecksum,
} from "./gitleaks-contract.mjs";

describe("Gitleaks contract", () => {
  it("validates the checked-in configuration", () => {
    expect(validateGitleaksConfiguration(readFileSync(".gitleaks.toml", "utf8"))).toEqual({
      allowlists: 1,
    });
  });

  it("rejects a disabled default rule set or a secret-valued allowlist", () => {
    expect(() => validateGitleaksConfiguration("[extend]\nuseDefault = false\n")).toThrow(
      "default Gitleaks rules",
    );
    expect(() =>
      validateGitleaksConfiguration(
        '[extend]\nuseDefault = true\n[[allowlists]]\nregexes = ["sk-synthetic-value-that-must-not-be-listed"]\n',
      ),
    ).toThrow("secret-like value");
  });

  it("selects only introduced pull-request or push commits", () => {
    const base = "1".repeat(40);
    const head = "2".repeat(40);
    expect(resolveIntroducedCommitRange({ event: "pull_request", base, head })).toBe(
      `${base}..${head}`,
    );
    expect(resolveIntroducedCommitRange({ event: "push", base, head })).toBe(`${base}..${head}`);
    expect(resolveIntroducedCommitRange({ event: "push", base: "0".repeat(40), head })).toBeNull();
    expect(() => resolveIntroducedCommitRange({ event: "push", base: "invalid", head })).toThrow(
      "base commit is invalid",
    );
  });

  it("fails a checksum mismatch", () => {
    const bytes = Buffer.from("archive");
    expect(() => verifyArchiveChecksum(bytes)).toThrow("checksum does not match");
    expect(
      verifyArchiveChecksum(
        bytes,
        "0eb3e36bfb24dcd9bb1d1bece1531216b59539a8fde17ee80224af0653c92aa3",
      ),
    ).toBe("0eb3e36bfb24dcd9bb1d1bece1531216b59539a8fde17ee80224af0653c92aa3");
    expect(GITLEAKS_RELEASE.version).toBe("8.30.1");
  });

  it("requires one explicit directory scan path", () => {
    expect(parseDirectoryScanArgument(["--path", "/tmp/container-output"])).toBe(
      "/tmp/container-output",
    );
    expect(() => parseDirectoryScanArgument([])).toThrow("expected one --path argument");
    expect(() => parseDirectoryScanArgument(["--path", "a", "--path", "b"])).toThrow(
      "expected one --path argument",
    );
  });
});
