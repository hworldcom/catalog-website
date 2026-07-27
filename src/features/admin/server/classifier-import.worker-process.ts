import { readClassifierImportConfig } from "./classifier-import.config";
import { createClassifierImportWorkerRuntime } from "./classifier-import.runtime";
import {
  createClassifierImportWorkerLogEntry,
  createClassifierImportWorkerLoop,
  getExceptionClass,
  writeClassifierImportWorkerLog,
} from "./classifier-import.worker-loop";

async function main(): Promise<void> {
  let config;
  try {
    config = readClassifierImportConfig();
  } catch {
    writeClassifierImportWorkerLog(
      createClassifierImportWorkerLogEntry({
        event: "worker_configuration_invalid",
        severity: "error",
        errorCode: "classifier_import_worker_configuration_invalid",
      }),
    );
    process.exitCode = 1;
    return;
  }

  let loop;
  try {
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
