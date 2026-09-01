import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  createUatMarketplaceFixtureWorkflowSummary,
  formatUatMarketplaceFixtureWorkflowSummary,
  preflightUatMarketplaceFixtureWorkflow,
} from "./uat-marketplace-fixtures.workflow";

async function main(): Promise<void> {
  const action = process.argv[2];
  if (action === "preflight") {
    const result = await preflightUatMarketplaceFixtureWorkflow();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (action !== "summary") {
    throw new Error("uat_marketplace_fixture_workflow_action_invalid");
  }

  const verificationResult = await readJson(requiredPath("BAZORIA_UAT_FIXTURE_VERIFY_RESULT_PATH"));
  const resetResultPath = process.env.BAZORIA_UAT_FIXTURE_RESET_RESULT_PATH;
  const summary = createUatMarketplaceFixtureWorkflowSummary({
    commit: requiredValue("BAZORIA_UAT_FIXTURE_WORKFLOW_COMMIT"),
    operation: requiredValue("BAZORIA_UAT_FIXTURE_WORKFLOW_OPERATION"),
    projectRef: requiredValue("BAZORIA_UAT_FIXTURE_WORKFLOW_EXPECTED_PROJECT_REF"),
    resetResult: resetResultPath ? await readJson(resolve(resetResultPath)) : undefined,
    verificationResult,
  });
  const jsonPath = requiredPath("BAZORIA_UAT_FIXTURE_SUMMARY_JSON_PATH");
  const markdownPath = requiredPath("BAZORIA_UAT_FIXTURE_SUMMARY_MARKDOWN_PATH");
  await Promise.all([
    mkdir(dirname(jsonPath), { recursive: true }),
    mkdir(dirname(markdownPath), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 }),
    writeFile(markdownPath, formatUatMarketplaceFixtureWorkflowSummary(summary), { mode: 0o600 }),
  ]);
  process.stdout.write(`${JSON.stringify({ status: "passed", summaryPath: jsonPath })}\n`);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function requiredPath(name: string): string {
  return resolve(requiredValue(name));
}

function requiredValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("uat_marketplace_fixture_workflow_configuration_invalid");
  return value;
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "uat_marketplace_fixture_workflow_failed"}\n`,
  );
  process.exitCode = 1;
});
