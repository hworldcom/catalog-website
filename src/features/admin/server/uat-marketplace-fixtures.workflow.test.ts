import { describe, expect, it } from "vitest";

import { fixtureSellerSlugs } from "./uat-marketplace-fixtures.manifest";
import {
  createUatMarketplaceFixtureWorkflowSummary,
  formatUatMarketplaceFixtureWorkflowSummary,
  preflightUatMarketplaceFixtureWorkflow,
} from "./uat-marketplace-fixtures.workflow";

const projectRef = "mekobnkujzpzeiwmecyy";
const commit = "0123456789abcdef0123456789abcdef01234567";
const commonEnvironment = {
  BAZORIA_DEPLOYMENT_ENVIRONMENT: "uat",
  BAZORIA_UAT_DATABASE_URL: `postgresql://postgres.${projectRef}:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
  BAZORIA_UAT_FIXTURE_ADMIN_USER_ID: "aed397bc-27cf-483d-bcd2-4455ccb83bc0",
  BAZORIA_UAT_FIXTURE_PROJECT_REF: projectRef,
  BAZORIA_UAT_FIXTURE_WORKFLOW_COMMIT: commit,
  BAZORIA_UAT_FIXTURE_WORKFLOW_EXPECTED_PROJECT_REF: projectRef,
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
  SUPABASE_URL: `https://${projectRef}.supabase.co`,
};

describe("UAT marketplace fixture workflow", () => {
  it("validates a read-only request and the complete tracked asset bundle without a password", async () => {
    const result = await preflightUatMarketplaceFixtureWorkflow({
      ...commonEnvironment,
      BAZORIA_UAT_FIXTURE_WORKFLOW_OPERATION: "verify",
    });

    expect(result).toEqual({
      assetCount: 28,
      bundleVersion: "0038d-v1",
      commit,
      operation: "verify",
      projectRef,
    });
  });

  it("requires a seed password and the exact destructive confirmation only when applicable", async () => {
    await expect(
      preflightUatMarketplaceFixtureWorkflow({
        ...commonEnvironment,
        BAZORIA_UAT_FIXTURE_WORKFLOW_OPERATION: "seed-verify",
      }),
    ).rejects.toThrow(
      "uat_marketplace_fixture_configuration_invalid invalid_fields=BAZORIA_UAT_FIXTURE_USER_PASSWORD",
    );

    await expect(
      preflightUatMarketplaceFixtureWorkflow({
        ...commonEnvironment,
        BAZORIA_UAT_FIXTURE_RESET_CONFIRMATION: "RESET-UAT-wrong",
        BAZORIA_UAT_FIXTURE_USER_PASSWORD: "fixture-password",
        BAZORIA_UAT_FIXTURE_WORKFLOW_OPERATION: "reset-seed-verify",
      }),
    ).rejects.toThrow("uat_marketplace_fixture_workflow_request_invalid");

    await expect(
      preflightUatMarketplaceFixtureWorkflow({
        ...commonEnvironment,
        BAZORIA_UAT_FIXTURE_RESET_CONFIRMATION: `RESET-UAT-${projectRef}`,
        BAZORIA_UAT_FIXTURE_USER_PASSWORD: "fixture-password",
        BAZORIA_UAT_FIXTURE_WORKFLOW_OPERATION: "reset-seed-verify",
      }),
    ).resolves.toMatchObject({ operation: "reset-seed-verify", projectRef });
  });

  it("produces a deterministic non-secret verification summary", () => {
    const productCodes = Array.from({ length: 16 }, (_, index) => `FIX-${index + 1}`);
    const summary = createUatMarketplaceFixtureWorkflowSummary({
      commit,
      operation: "reset-seed-verify",
      projectRef,
      resetResult: {
        mode: "reset",
        reset: {
          deletedAuthUsers: 4,
          deletedDatabaseRows: 120,
          deletedStorageObjects: 28,
          plannedAuthUsers: 4,
          plannedDatabaseRows: 120,
          plannedStorageObjects: 28,
        },
        verification: null,
      },
      verificationResult: {
        mode: "verify",
        reset: null,
        verification: {
          productCodes,
          productCount: 16,
          publicImageCount: 20,
          sellerCount: 4,
          sellerSlugs: fixtureSellerSlugs(),
        },
      },
    });

    expect(summary).toMatchObject({
      bundleVersion: "0038d-v1",
      productCount: 16,
      publicImageCount: 20,
      sellerCount: 4,
      verificationResult: "passed",
    });
    expect(formatUatMarketplaceFixtureWorkflowSummary(summary)).toContain(`- Commit: ${commit}`);
  });
});
