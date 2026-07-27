import {
  parseLegacyProductDraftImageCutoverArguments,
  readLegacyProductDraftImageCutoverConfig,
} from "./legacy-product-draft-image-cutover.config";
import { createLegacyProductDraftImageCutoverRuntime } from "./legacy-product-draft-image-cutover.runtime";

async function main(): Promise<void> {
  let batchSize: number;
  let config;
  try {
    ({ batchSize } = parseLegacyProductDraftImageCutoverArguments(process.argv.slice(2)));
    config = readLegacyProductDraftImageCutoverConfig();
  } catch (error) {
    write({
      event: "product_draft_image_cutover_configuration_invalid",
      status: "failed",
      errorCode: "legacy_object_unverifiable",
      exceptionClass: exceptionClass(error),
    });
    process.exitCode = 1;
    return;
  }

  try {
    const service = await createLegacyProductDraftImageCutoverRuntime(config);
    const result = await service.run(batchSize);
    write({
      event: "product_draft_image_cutover_finished",
      status: result.status,
      ...(result.status === "failed" ? { errorCode: result.errorCode } : {}),
      counts: {
        pending: result.summary.cutover.pending_count,
        started: result.summary.cutover.started_count,
        completed: result.summary.cutover.completed_count,
        failed: result.summary.cutover.failed_count,
        releaseBlocking: result.summary.cutover.release_blocking_count,
      },
      failuresByCode: result.summary.failuresByCode,
    });
    if (result.status === "failed" || result.summary.cutover.release_blocking_count > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    write({
      event: "product_draft_image_cutover_failed",
      status: "failed",
      errorCode: "legacy_cutover_claim_lost",
      exceptionClass: exceptionClass(error),
    });
    process.exitCode = 1;
  }
}

function write(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function exceptionClass(error: unknown): string {
  if (error instanceof Error && error.constructor.name) return error.constructor.name;
  return "UnknownError";
}

void main();
