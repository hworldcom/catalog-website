import { z } from "zod";

import { loadUatMarketplaceFixtureAssetBundle } from "./uat-marketplace-fixtures.assets";
import { readUatMarketplaceFixtureConfig } from "./uat-marketplace-fixtures.config";
import {
  fixtureSellerSlugs,
  UAT_MARKETPLACE_FIXTURE_BUNDLE_VERSION,
} from "./uat-marketplace-fixtures.manifest";

export const uatMarketplaceFixtureWorkflowOperationSchema = z.enum([
  "verify",
  "seed-verify",
  "reset-seed-verify",
]);

export type UatMarketplaceFixtureWorkflowOperation = z.infer<
  typeof uatMarketplaceFixtureWorkflowOperationSchema
>;

const workflowRequestSchema = z.object({
  commit: z.string().regex(/^[0-9a-f]{40}$/u),
  expectedProjectRef: z.string().regex(/^[a-z0-9]{20}$/u),
  operation: uatMarketplaceFixtureWorkflowOperationSchema,
});

const verificationSchema = z
  .object({
    mode: z.literal("verify"),
    reset: z.null(),
    verification: z.object({
      productCodes: z.array(z.string().min(1)).length(16),
      productCount: z.literal(16),
      publicImageCount: z.literal(20),
      sellerCount: z.literal(4),
      sellerSlugs: z.array(z.string().min(1)).length(4),
    }),
  })
  .strict();

const resetResultSchema = z
  .object({
    mode: z.literal("reset"),
    reset: z.object({
      deletedAuthUsers: z.number().int().nonnegative(),
      deletedDatabaseRows: z.number().int().nonnegative(),
      deletedStorageObjects: z.number().int().nonnegative(),
      plannedAuthUsers: z.number().int().nonnegative(),
      plannedDatabaseRows: z.number().int().nonnegative(),
      plannedStorageObjects: z.number().int().nonnegative(),
    }),
    verification: z.null(),
  })
  .strict();

export type UatMarketplaceFixtureWorkflowPreflight = {
  assetCount: number;
  bundleVersion: string;
  commit: string;
  operation: UatMarketplaceFixtureWorkflowOperation;
  projectRef: string;
};

export type UatMarketplaceFixtureWorkflowSummary = {
  bundleVersion: string;
  commit: string;
  operation: UatMarketplaceFixtureWorkflowOperation;
  productCodes: string[];
  productCount: number;
  projectRef: string;
  publicImageCount: number;
  reset: z.infer<typeof resetResultSchema>["reset"] | null;
  sellerCount: number;
  sellerSlugs: string[];
  verificationResult: "passed";
};

export async function preflightUatMarketplaceFixtureWorkflow(
  environment: NodeJS.ProcessEnv = process.env,
  workingDirectory = process.cwd(),
): Promise<UatMarketplaceFixtureWorkflowPreflight> {
  const request = parseWorkflowRequest(environment);
  const environmentWithoutResetConfirmation = { ...environment };
  delete environmentWithoutResetConfirmation.BAZORIA_UAT_FIXTURE_RESET_CONFIRMATION;

  let assetDirectory: string;
  if (request.operation === "reset-seed-verify") {
    const resetConfig = readUatMarketplaceFixtureConfig(environment, ["reset"], workingDirectory);
    if (resetConfig.projectRef !== request.expectedProjectRef) throw workflowRequestInvalid();
    const seedConfig = readUatMarketplaceFixtureConfig(
      environmentWithoutResetConfirmation,
      ["seed"],
      workingDirectory,
    );
    assetDirectory = seedConfig.assetDirectory;
  } else if (request.operation === "seed-verify") {
    const seedConfig = readUatMarketplaceFixtureConfig(
      environmentWithoutResetConfirmation,
      ["seed"],
      workingDirectory,
    );
    if (seedConfig.projectRef !== request.expectedProjectRef) throw workflowRequestInvalid();
    assetDirectory = seedConfig.assetDirectory;
  } else {
    const verifyConfig = readUatMarketplaceFixtureConfig(
      environmentWithoutResetConfirmation,
      ["verify"],
      workingDirectory,
    );
    if (verifyConfig.projectRef !== request.expectedProjectRef) throw workflowRequestInvalid();
    assetDirectory = verifyConfig.assetDirectory;
  }

  const assets = await loadUatMarketplaceFixtureAssetBundle(assetDirectory);
  return {
    assetCount: assets.size,
    bundleVersion: UAT_MARKETPLACE_FIXTURE_BUNDLE_VERSION,
    commit: request.commit,
    operation: request.operation,
    projectRef: request.expectedProjectRef,
  };
}

export function createUatMarketplaceFixtureWorkflowSummary(input: {
  commit: string;
  operation: string;
  projectRef: string;
  resetResult?: unknown;
  verificationResult: unknown;
}): UatMarketplaceFixtureWorkflowSummary {
  const request = workflowRequestSchema.parse({
    commit: input.commit,
    expectedProjectRef: input.projectRef,
    operation: input.operation,
  });
  const verification = verificationSchema.parse(input.verificationResult).verification;
  const expectedSellerSlugs = fixtureSellerSlugs().sort();
  const sellerSlugs = [...verification.sellerSlugs].sort();
  const productCodes = [...verification.productCodes].sort();
  if (
    JSON.stringify(sellerSlugs) !== JSON.stringify(expectedSellerSlugs) ||
    new Set(productCodes).size !== productCodes.length
  ) {
    throw new Error("uat_marketplace_fixture_workflow_summary_invalid");
  }
  const reset =
    request.operation === "reset-seed-verify"
      ? resetResultSchema.parse(input.resetResult).reset
      : null;
  return {
    bundleVersion: UAT_MARKETPLACE_FIXTURE_BUNDLE_VERSION,
    commit: request.commit,
    operation: request.operation,
    productCodes,
    productCount: verification.productCount,
    projectRef: request.expectedProjectRef,
    publicImageCount: verification.publicImageCount,
    reset,
    sellerCount: verification.sellerCount,
    sellerSlugs,
    verificationResult: "passed",
  };
}

export function formatUatMarketplaceFixtureWorkflowSummary(
  summary: UatMarketplaceFixtureWorkflowSummary,
): string {
  const resetLines = summary.reset
    ? [
        `- Reset authentication users: ${summary.reset.deletedAuthUsers}`,
        `- Reset database rows: ${summary.reset.deletedDatabaseRows}`,
        `- Reset storage objects: ${summary.reset.deletedStorageObjects}`,
      ]
    : [];
  return [
    "# UAT marketplace fixtures",
    "",
    `- Verification: ${summary.verificationResult}`,
    `- Operation: ${summary.operation}`,
    `- Commit: ${summary.commit}`,
    `- UAT project: ${summary.projectRef}`,
    `- Fixture bundle: ${summary.bundleVersion}`,
    `- Sellers: ${summary.sellerCount}`,
    `- Products: ${summary.productCount}`,
    `- Public product images: ${summary.publicImageCount}`,
    ...resetLines,
    `- Seller slugs: ${summary.sellerSlugs.join(", ")}`,
    `- Product codes: ${summary.productCodes.join(", ")}`,
    "",
  ].join("\n");
}

function parseWorkflowRequest(environment: NodeJS.ProcessEnv) {
  const parsed = workflowRequestSchema.safeParse({
    commit: environment.BAZORIA_UAT_FIXTURE_WORKFLOW_COMMIT,
    expectedProjectRef: environment.BAZORIA_UAT_FIXTURE_WORKFLOW_EXPECTED_PROJECT_REF,
    operation: environment.BAZORIA_UAT_FIXTURE_WORKFLOW_OPERATION,
  });
  if (!parsed.success) throw workflowRequestInvalid();
  const resetConfirmation = environment.BAZORIA_UAT_FIXTURE_RESET_CONFIRMATION?.trim() || undefined;
  if (
    parsed.data.operation === "reset-seed-verify" &&
    resetConfirmation !== `RESET-UAT-${parsed.data.expectedProjectRef}`
  ) {
    throw workflowRequestInvalid();
  }
  if (parsed.data.operation !== "reset-seed-verify" && resetConfirmation !== undefined) {
    throw workflowRequestInvalid();
  }
  return parsed.data;
}

function workflowRequestInvalid(): Error {
  return new Error("uat_marketplace_fixture_workflow_request_invalid");
}
