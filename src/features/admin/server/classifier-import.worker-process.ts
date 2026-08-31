import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ClassifierAssistedUploadDisabledError } from "@/features/classifier-release/classifier-assisted-upload";
import { assertClassifierAssistedUploadEnabled } from "@/features/classifier-release/server/classifier-assisted-upload-gate";

import type { ClassifierImportConfig } from "./classifier-import.config";
import {
  createClassifierImportWorkerLogEntry,
  createClassifierImportWorkerLoop,
  getExceptionClass,
  writeClassifierImportWorkerLog,
} from "./classifier-import.worker-loop";

async function main(): Promise<void> {
  let config;
  try {
    config = await loadEnabledClassifierImportWorkerConfig();
  } catch (error) {
    writeClassifierImportWorkerLog(
      createClassifierImportWorkerLogEntry({
        event: "worker_configuration_invalid",
        severity: "error",
        errorCode:
          error instanceof ClassifierAssistedUploadDisabledError
            ? error.code
            : "classifier_import_worker_configuration_invalid",
      }),
    );
    process.exitCode = 1;
    return;
  }

  let loop;
  try {
    const { createClassifierImportWorkerRuntime } = await import("./classifier-import.runtime");
    loop = await createClassifierImportWorkerLoop({
      createWorker: () => createClassifierImportWorkerRuntime(undefined, config),
      pollIntervalMs: config.workerPollIntervalMs,
      log: writeClassifierImportWorkerLog,
    });
  } catch (error) {
    writeClassifierImportWorkerLog(
      createClassifierImportWorkerLogEntry({
        event: "worker_iteration_failed",
        severity: "error",
        errorCode: "classifier_import_worker_iteration_failed",
        exceptionClass: getExceptionClass(error),
      }),
    );
    process.exitCode = 1;
    return;
  }

  let signalCount = 0;
  const handleSignal = () => {
    signalCount += 1;
    if (signalCount === 1) {
      loop.requestShutdown();
      return;
    }
    process.exit(130);
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
  try {
    await loop.run();
  } finally {
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
  }
}

export async function loadEnabledClassifierImportWorkerConfig(
  environment: Record<string, string | undefined> = process.env,
  loadConfigReader: () => Promise<{
    readClassifierImportConfig(
      environment: Record<string, string | undefined>,
    ): ClassifierImportConfig;
  }> = () => import("./classifier-import.config"),
): Promise<ClassifierImportConfig> {
  assertClassifierAssistedUploadEnabled(environment);
  const { readClassifierImportConfig } = await loadConfigReader();
  return readClassifierImportConfig(environment);
}

const entryPath = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;
if (entryPath) {
  void main().catch((error: unknown) => {
    writeClassifierImportWorkerLog(
      createClassifierImportWorkerLogEntry({
        event: "worker_iteration_failed",
        severity: "error",
        errorCode: "classifier_import_worker_iteration_failed",
        exceptionClass: getExceptionClass(error),
      }),
    );
    process.exitCode = 1;
  });
}
