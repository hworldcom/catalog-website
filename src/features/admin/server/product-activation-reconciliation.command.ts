import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  readRuntimeIdentity,
  writeRuntimeStartupLog,
} from "@/features/runtime/server/runtime-identity";
import {
  CloudTasksProductActivationDispatcher,
  GoogleCloudProductActivationTaskClient,
} from "./product-activation.cloud-tasks";
import { readProductActivationReconciliationConfig } from "./product-activation-reconciliation.config";
import {
  ProductActivationReconciliationService,
  type ProductActivationReconciliationRowLog,
} from "./product-activation-reconciliation.service";
import {
  SupabaseProductActivationRepository,
  type ProductActivationAdministrator,
} from "./product-activation.repository";

export async function runProductActivationReconciliationCommand(): Promise<number> {
  let config;
  try {
    config = readProductActivationReconciliationConfig();
  } catch (error) {
    write({
      event: "product_activation_reconciliation_configuration_invalid",
      severity: "error",
      errorCode: "product_publication_configuration_invalid",
      exceptionClass: exceptionClass(error),
    });
    return 1;
  }
  writeRuntimeStartupLog(readRuntimeIdentity("product-activation-reconciliation"));

  try {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const repository = new SupabaseProductActivationRepository(
      supabaseAdmin as unknown as ProductActivationAdministrator,
    );
    const dispatcher = new CloudTasksProductActivationDispatcher(
      repository,
      new GoogleCloudProductActivationTaskClient(config),
      config.maximumEnqueueAttemptMs,
    );
    const service = new ProductActivationReconciliationService(repository, dispatcher, {
      batchSize: config.reconciliationBatchSize,
      deadlineMs: config.reconciliationDeadlineMs,
      maximumEnqueueAttemptMs: config.maximumEnqueueAttemptMs,
      writeRowLog,
    });
    const summary = await service.run();
    write({
      event: "product_activation_reconciliation_finished",
      severity: summary.stillPending > 0 || summary.failed > 0 ? "error" : "info",
      ...summary,
    });
    return summary.stillPending > 0 || summary.failed > 0 ? 1 : 0;
  } catch (error) {
    write({
      event: "product_activation_reconciliation_failed",
      severity: "error",
      errorCode: "product_activation_reconciliation_failed",
      exceptionClass: exceptionClass(error),
    });
    return 1;
  }
}

function writeRowLog(entry: ProductActivationReconciliationRowLog): void {
  write(entry);
}

function write(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function exceptionClass(error: unknown): string {
  return error instanceof Error && error.constructor.name ? error.constructor.name : "UnknownError";
}

const entryPath = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;
if (entryPath) {
  void runProductActivationReconciliationCommand().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
