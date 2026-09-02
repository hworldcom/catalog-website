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
  type ProductActivationReconciliationSummary,
  type ProductActivationReconciliationRowLog,
} from "./product-activation-reconciliation.service";
import {
  SupabaseProductActivationRepository,
  type ProductActivationAdministrator,
  type ProductActivationDispatchHealth,
} from "./product-activation.repository";

type ReconciliationCycleService = {
  run(): Promise<ProductActivationReconciliationSummary>;
};

type ReconciliationHealthRepository = {
  readDispatchHealth(): Promise<ProductActivationDispatchHealth>;
};

export type ProductActivationReconciliationCycleOptions = {
  now?: () => number;
  write?: (payload: Record<string, unknown>) => void;
};

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
    return runProductActivationReconciliationCycle(service, repository);
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

export async function runProductActivationReconciliationCycle(
  service: ReconciliationCycleService,
  repository: ReconciliationHealthRepository,
  options: ProductActivationReconciliationCycleOptions = {},
): Promise<number> {
  const summary = await service.run();
  const health = await repository.readDispatchHealth();
  const healthFields = reconciliationHealthFields(health, options.now?.() ?? Date.now());
  const failed = summary.stillPending > 0 || summary.failed > 0;
  (options.write ?? write)({
    event: "product_activation_reconciliation_finished",
    severity: failed ? "error" : "info",
    ...summary,
    ...healthFields,
  });
  return failed ? 1 : 0;
}

export function reconciliationHealthFields(
  health: ProductActivationDispatchHealth,
  now: number,
): { pendingCount: number; oldestPendingAgeMs: number } {
  if (health.pendingCount === 0 && health.oldestPendingCreatedAt === null) {
    return { pendingCount: 0, oldestPendingAgeMs: 0 };
  }
  if (health.pendingCount < 1 || health.oldestPendingCreatedAt === null) {
    throw new Error("product_activation_dispatch_health_invalid");
  }
  const oldestPendingAt = Date.parse(health.oldestPendingCreatedAt);
  if (!Number.isFinite(oldestPendingAt)) {
    throw new Error("product_activation_dispatch_health_invalid");
  }
  return {
    pendingCount: health.pendingCount,
    oldestPendingAgeMs: Math.max(0, now - oldestPendingAt),
  };
}

function writeRowLog(entry: ProductActivationReconciliationRowLog): void {
  write(entry);
}

function write(payload: Record<string, unknown>): void {
  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "bazoria_product_activation_reconciliation",
      ...payload,
    })}\n`,
  );
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
