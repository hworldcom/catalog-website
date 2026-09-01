import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workflowPath = resolve(".github/workflows/uat-marketplace-fixtures.yml");

describe("UAT marketplace fixture workflow file", () => {
  it("is manual, read-only, and protected by the UAT environment", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("environment: uat");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(workflow).not.toContain("id-token:");
  });

  it("checks a trusted exact commit and the current migration head before mutation", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const trustCheck = workflow.indexOf("git merge-base --is-ancestor");
    const migrationCheck = workflow.indexOf("db:environment:assert-current");
    const reset = workflow.indexOf("uat-marketplace-fixtures.command.ts reset");
    const seed = workflow.indexOf("uat-marketplace-fixtures.command.ts seed");

    expect(trustCheck).toBeGreaterThan(-1);
    expect(migrationCheck).toBeGreaterThan(trustCheck);
    expect(reset).toBeGreaterThan(migrationCheck);
    expect(seed).toBeGreaterThan(migrationCheck);
  });

  it("exposes only the contracted operations and uploads only non-secret summaries", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const artifactStep = workflow.slice(
      workflow.indexOf("- name: Upload non-secret fixture summary"),
      workflow.indexOf("- name: Remove temporary database target file"),
    );

    expect(workflow).toContain("- verify");
    expect(workflow).toContain("- seed-verify");
    expect(workflow).toContain("- reset-seed-verify");
    expect(artifactStep).toContain("summary.json");
    expect(artifactStep).toContain("summary.md");
    expect(artifactStep).not.toContain("reset.json");
    expect(artifactStep).not.toContain("seed.json");
    expect(artifactStep).not.toContain("verify.json");
  });
});
