import type { ClassifierImportWorkerResult } from "./classifier-import.worker";

const SERVICE_NAME = "bazoria_classifier_import_worker" as const;
const HEARTBEAT_INTERVAL_MS = 60_000;

export type ClassifierImportWorkerEventName =
  | "worker_started"
  | "worker_heartbeat"
  | "import_attempt_finished"
  | "worker_iteration_failed"
  | "worker_shutdown_requested"
  | "worker_stopped"
  | "worker_configuration_invalid";

export type ClassifierImportWorkerLogEntry = {
  timestamp: string;
  service: typeof SERVICE_NAME;
  event: ClassifierImportWorkerEventName;
  severity: "info" | "error";
  importId?: string;
  operationKind?: "import" | "reconcile";
  attemptCount?: number;
  status?: Exclude<ClassifierImportWorkerResult["status"], "idle">;
  errorCode?: string;
  exceptionClass?: string;
};

export type ClassifierImportWorkerLogSink = (entry: ClassifierImportWorkerLogEntry) => void;

export interface ClassifierImportWorkerRunner {
  runNext(): Promise<ClassifierImportWorkerResult>;
}

export type ClassifierImportWorkerWait = (durationMs: number, signal: AbortSignal) => Promise<void>;

export type ClassifierImportWorkerHeartbeatScheduler = (
  callback: () => void,
  intervalMs: number,
) => () => void;

type LogEntryFields = Omit<ClassifierImportWorkerLogEntry, "timestamp" | "service">;

export type ClassifierImportWorkerLoopOptions = {
  worker: ClassifierImportWorkerRunner;
  pollIntervalMs: number;
  log: ClassifierImportWorkerLogSink;
  now?: () => Date;
  wait?: ClassifierImportWorkerWait;
  scheduleHeartbeat?: ClassifierImportWorkerHeartbeatScheduler;
};

export type ClassifierImportWorkerLoopFactoryOptions = Omit<
  ClassifierImportWorkerLoopOptions,
  "worker"
> & {
  createWorker: () => Promise<ClassifierImportWorkerRunner>;
};

export class ClassifierImportWorkerLoop {
  private readonly now: () => Date;
  private readonly wait: ClassifierImportWorkerWait;
  private readonly scheduleHeartbeat: ClassifierImportWorkerHeartbeatScheduler;
  private readonly waitController = new AbortController();
  private stopping = false;

  constructor(private readonly options: ClassifierImportWorkerLoopOptions) {
    this.now = options.now ?? (() => new Date());
    this.wait = options.wait ?? waitForWorkerPoll;
    this.scheduleHeartbeat = options.scheduleHeartbeat ?? scheduleWorkerHeartbeat;
  }

  requestShutdown(): boolean {
    if (this.stopping) return false;

    this.stopping = true;
    this.waitController.abort();
    this.emit({
      event: "worker_shutdown_requested",
      severity: "info",
    });
    return true;
  }

  async run(): Promise<void> {
    this.emit({ event: "worker_started", severity: "info" });
    this.emit({ event: "worker_heartbeat", severity: "info" });
    const stopHeartbeat = this.scheduleHeartbeat(
      () => this.emit({ event: "worker_heartbeat", severity: "info" }),
      HEARTBEAT_INTERVAL_MS,
    );

    try {
      while (!this.stopping) {
        let result: ClassifierImportWorkerResult;
        try {
          result = await this.options.worker.runNext();
        } catch (error) {
          this.emit({
            event: "worker_iteration_failed",
            severity: "error",
            errorCode: "classifier_import_worker_iteration_failed",
            exceptionClass: getExceptionClass(error),
          });
          if (!this.stopping) {
            await this.wait(this.options.pollIntervalMs, this.waitController.signal);
          }
          continue;
        }

        if (result.status !== "idle") {
          this.emit({
            event: "import_attempt_finished",
            severity: "info",
            importId: result.importId,
            operationKind: result.operationKind,
            attemptCount: result.attemptCount,
            status: result.status,
            ...(result.status === "failed" ? { errorCode: result.errorCode } : {}),
          });
        }

        if (this.stopping) break;
        if (result.status === "idle") {
          await this.wait(this.options.pollIntervalMs, this.waitController.signal);
        }
      }
    } finally {
      stopHeartbeat();
      this.emit({ event: "worker_stopped", severity: "info" });
    }
  }

  private emit(fields: LogEntryFields): void {
    this.options.log(createClassifierImportWorkerLogEntry(fields, this.now));
  }
}

export async function createClassifierImportWorkerLoop(
  options: ClassifierImportWorkerLoopFactoryOptions,
): Promise<ClassifierImportWorkerLoop> {
  const { createWorker, ...loopOptions } = options;
  const worker = await createWorker();
  return new ClassifierImportWorkerLoop({ ...loopOptions, worker });
}

export function createClassifierImportWorkerLogEntry(
  fields: LogEntryFields,
  now: () => Date = () => new Date(),
): ClassifierImportWorkerLogEntry {
  return {
    timestamp: now().toISOString(),
    service: SERVICE_NAME,
    ...fields,
  };
}

export function writeClassifierImportWorkerLog(entry: ClassifierImportWorkerLogEntry): void {
  const line = `${JSON.stringify(entry)}\n`;
  if (entry.severity === "error") {
    process.stderr.write(line);
    return;
  }
  process.stdout.write(line);
}

export function getExceptionClass(error: unknown): string {
  if (error instanceof Error && error.constructor.name) return error.constructor.name;
  return "UnknownError";
}

function waitForWorkerPoll(durationMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = setTimeout(finish, durationMs);
    signal.addEventListener("abort", finish, { once: true });
  });
}

function scheduleWorkerHeartbeat(callback: () => void, intervalMs: number): () => void {
  const interval = setInterval(callback, intervalMs);
  return () => clearInterval(interval);
}
