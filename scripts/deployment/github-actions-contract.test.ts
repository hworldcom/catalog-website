import { describe, expect, it } from "vitest";

import {
  extractUsesReferences,
  validateGitHubActions,
  validateUsesReference,
} from "./github-actions-contract.mjs";

describe("GitHub Action pin contract", () => {
  it("validates every checked-in workflow and composite action", () => {
    expect(validateGitHubActions()).toMatchObject({
      sources: expect.any(Number),
      references: expect.any(Number),
    });
  });

  it.each([
    "actions/checkout@v4",
    "actions/checkout@main",
    "actions/checkout@11bd719",
    "${{ matrix.action }}",
    "docker://alpine:3.22",
  ])("rejects mutable reference %s", (reference) => {
    expect(() => validateUsesReference(reference)).toThrow("github_actions_contract_invalid");
  });

  it.each([
    "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683",
    "owner/action/path@0123456789abcdef0123456789abcdef01234567",
    "docker://registry.example.com/tool@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "./.github/actions/local-check",
  ])("accepts immutable or repository-local reference %s", (reference) => {
    expect(() => validateUsesReference(reference)).not.toThrow();
  });

  it("finds job-level and step-level uses references", () => {
    const references = extractUsesReferences(`
jobs:
  reusable:
    uses: owner/repository/.github/workflows/check.yml@0123456789abcdef0123456789abcdef01234567
  build:
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
`);

    expect(references).toHaveLength(2);
  });
});
