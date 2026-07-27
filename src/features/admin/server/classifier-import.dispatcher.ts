import type {
  ClassifierImportWorker,
  ClassifierImportWorkerResult,
} from "./classifier-import.worker";

export type ClassifierImportDispatchResult = "accepted" | "already_terminal";

export interface ClassifierImportDispatcher {
  dispatch(importId: string): Promise<ClassifierImportDispatchResult>;
}

type WorkerFactory = () => Promise<Pick<ClassifierImportWorker, "run">>;
type Schedule = (work: () => void) => void;
type Log = (entry: LocalClassifierImportDispatchLog) => void;

export type LocalClassifierImportDispatchLog =
  | {
      event: "local_import_dispatch_finished";
      importId: string;
      status: ClassifierImportWorkerResult["status"];
    }
  | {
      event: "local_import_dispatch_failed";
      importId: string;
      errorCode: "classifier_import_local_dispatch_failed";
      exceptionClass: string;
    };

export class LocalClassifierImportDispatcher implements ClassifierImportDispatcher {
  private readonly activeImports = new Set<string>();

  constructor(
    private readonly createWorker: WorkerFactory,
    private readonly schedule: Schedule = queueMicrotask,
    private readonly log: Log = writeLocalDispatchLog,
  ) {}

  async dispatch(importId: string): Promise<ClassifierImportDispatchResult> {
    if (this.activeImports.has(importId)) return "accepted";

    this.activeImports.add(importId);
    try {
      this.schedule(() => void this.execute(importId));
    } catch (error) {
      this.activeImports.delete(importId);
      throw error;
    }
    return "accepted";
  }

  private async execute(importId: string): Promise<void> {
    try {
      const worker = await this.createWorker();
      const result = await worker.run(importId);
      this.log({
        event: "local_import_dispatch_finished",
        importId,
        status: result.status,
      });
    } catch (error) {
      this.log({
        event: "local_import_dispatch_failed",
        importId,
        errorCode: "classifier_import_local_dispatch_failed",
        exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
      });
    } finally {
      this.activeImports.delete(importId);
    }
  }
}

function writeLocalDispatchLog(entry: LocalClassifierImportDispatchLog): void {
  const severity = entry.event === "local_import_dispatch_failed" ? "error" : "info";
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "bazoria_classifier_import_dispatcher",
    severity,
    ...entry,
  });
  if (severity === "error") {
    console.error(line);
    return;
  }
  console.info(line);
}
