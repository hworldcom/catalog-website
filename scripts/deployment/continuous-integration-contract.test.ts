import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assertAggregateResults,
  validateContinuousIntegrationWorkflow,
} from "./continuous-integration-contract.mjs";

const workflow = readFileSync(".github/workflows/continuous-integration.yml", "utf8");
const terraformValidator = readFileSync("scripts/terraform/validate-foundation.sh", "utf8");
const successfulResults = {
  "configuration-and-secrets": { result: "success" },
  application: { result: "success" },
  container: { result: "success" },
  database: { result: "success" },
  terraform: { result: "success" },
};

describe("continuous integration workflow contract", () => {
  it("validates the credential-free checked-in workflow", () => {
    expect(validateContinuousIntegrationWorkflow(workflow)).toEqual({ jobs: 6, validationJobs: 5 });
  });

  it("rejects path skipping and hosted secrets", () => {
    expect(() =>
      validateContinuousIntegrationWorkflow(
        workflow.replace("pull_request: {}", "pull_request:\n    paths: [src/**]"),
      ),
    ).toThrow("path-based skipping");
    expect(() =>
      validateContinuousIntegrationWorkflow(
        workflow.replace(
          "SCAN_EVENT: ${{ github.event_name }}",
          "SCAN_EVENT: ${{ secrets.HOSTED_VALUE }}",
        ),
      ),
    ).toThrow("hosted variables");
  });

  it("fails the aggregate for failed, skipped, cancelled, missing, or extra jobs", () => {
    expect(assertAggregateResults(successfulResults)).toBe(true);
    for (const result of ["failure", "skipped", "cancelled"]) {
      expect(() =>
        assertAggregateResults({ ...successfulResults, application: { result } }),
      ).toThrow("application");
    }
    const { terraform: _removed, ...missing } = successfulResults;
    expect(() => assertAggregateResults(missing)).toThrow("exactly the validation jobs");
    expect(() =>
      assertAggregateResults({ ...successfulResults, extra: { result: "success" } }),
    ).toThrow("exactly the validation jobs");
  });

  it("initializes Terraform without reusable hosted backend state", () => {
    expect(terraformValidator).toContain(
      'mktemp -d "${TMPDIR:-/tmp}/bazoria-terraform-validate.XXXXXX"',
    );
    expect(terraformValidator).toContain("init -backend=false -input=false");
    expect(terraformValidator).not.toContain('TF_DATA_DIR="${repository_root}/.terraform-data');
  });
});
