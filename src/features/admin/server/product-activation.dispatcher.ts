import type { ProductActivationConfig } from "./product-activation.config";
import type { ProductActivationRepository } from "./product-activation.repository";
import type {
  ProductActivationDispatchPayload,
  ProductActivationDispatchResult,
  ProductActivationWorkerResult,
} from "./product-activation.types";
import type { ProductActivationWorker } from "./product-activation.worker";

export interface ProductActivationDispatcher {
  dispatch(payload: ProductActivationDispatchPayload): Promise<ProductActivationDispatchResult>;
}

type WorkerFactory = () => Promise<Pick<ProductActivationWorker, "run">>;
type Schedule = (work: () => void) => void;
type Log = (entry: LocalProductActivationLog) => void;
type ScheduleInterval = (work: () => void, intervalMs: number) => () => void;

export type LocalProductActivationLog =
  | {
      event: "local_product_activation_finished";
      runId: string;
      dispatchGeneration: number;
      status: ProductActivationWorkerResult["status"];
      errorCode?: string;
    }
  | {
      event: "local_product_activation_failed";
      runId: string;
      dispatchGeneration: number;
      errorCode: "product_activation_worker_start_failed";
      exceptionClass: string;
    }
  | {
      event: "local_product_activation_recovery_failed";
      errorCode: "product_activation_recovery_failed";
      exceptionClass: string;
    };

export class LocalProductActivationDispatcher implements ProductActivationDispatcher {
  private readonly activeDispatches = new Map<
    string,
    { token: object; result: Promise<ProductActivationDispatchResult> }
  >();
  private recoveryPromise: Promise<void> | null = null;
  private stopRecoveryInterval: (() => void) | null = null;

  constructor(
    private readonly repository: ProductActivationRepository,
    private readonly createWorker: WorkerFactory,
    private readonly config: ProductActivationConfig,
    private readonly schedule: Schedule = queueMicrotask,
    private readonly log: Log = writeLog,
    private readonly scheduleInterval: ScheduleInterval = scheduleRecoveryInterval,
  ) {}

  dispatch(payload: ProductActivationDispatchPayload): Promise<ProductActivationDispatchResult> {
    const key = dispatchKey(payload);
    const active = this.activeDispatches.get(key);
    if (active) return active.result;

    const token = {};
    const pending = this.prepare(payload, key, token);
    this.activeDispatches.set(key, { token, result: pending });
    return pending;
  }

  startRecovery(): void {
    if (this.stopRecoveryInterval) return;
    void this.recover();
    this.stopRecoveryInterval = this.scheduleInterval(
      () => void this.recover(),
      this.config.recoveryIntervalMs,
    );
  }

  stopRecovery(): void {
    this.stopRecoveryInterval?.();
    this.stopRecoveryInterval = null;
  }

  recover(): Promise<void> {
    if (this.recoveryPromise) return this.recoveryPromise;
    const recovery = this.runRecovery().finally(() => {
      if (this.recoveryPromise === recovery) this.recoveryPromise = null;
    });
    this.recoveryPromise = recovery;
    return recovery;
  }

  private async prepare(
    payload: ProductActivationDispatchPayload,
    key: string,
    token: object,
  ): Promise<ProductActivationDispatchResult> {
    let worker: Pick<ProductActivationWorker, "run">;
    try {
      worker = await this.createWorker();
    } catch (error) {
      return this.recordPreparationFailure(payload, key, token, error);
    }

    let release: (execute: boolean) => void = () => undefined;
    const gate = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    try {
      this.schedule(() => {
        void gate.then((execute) => {
          if (execute) return this.execute(payload, key, token, worker);
          this.deleteIfCurrent(key, token);
        });
      });
    } catch (error) {
      release(false);
      return this.recordPreparationFailure(payload, key, token, error);
    }

    try {
      const result = await this.repository.recordDispatchResult({
        ...payload,
        result: "dispatched",
      });
      const execute = result.dispatchStatus === "dispatched" && result.result !== "stale";
      release(execute);
      return result;
    } catch (error) {
      release(false);
      this.deleteIfCurrent(key, token);
      throw error;
    }
  }

  private async recordPreparationFailure(
    payload: ProductActivationDispatchPayload,
    key: string,
    token: object,
    error: unknown,
  ): Promise<ProductActivationDispatchResult> {
    try {
      const result = await this.repository.recordDispatchResult({ ...payload, result: "failed" });
      this.log({
        event: "local_product_activation_failed",
        ...payload,
        errorCode: "product_activation_worker_start_failed",
        exceptionClass: exceptionClass(error),
      });
      return result;
    } catch {
      try {
        await this.repository.failWorkerStart(payload);
      } catch {
        // The original construction or scheduling failure remains the useful exception.
      }
      this.log({
        event: "local_product_activation_failed",
        ...payload,
        errorCode: "product_activation_worker_start_failed",
        exceptionClass: exceptionClass(error),
      });
      throw error;
    } finally {
      this.deleteIfCurrent(key, token);
    }
  }

  private async execute(
    payload: ProductActivationDispatchPayload,
    key: string,
    token: object,
    worker: Pick<ProductActivationWorker, "run">,
  ): Promise<void> {
    try {
      const result = await worker.run(payload);
      this.log({
        event: "local_product_activation_finished",
        ...payload,
        status: result.status,
        ...("errorCode" in result && result.errorCode ? { errorCode: result.errorCode } : {}),
      });
    } catch (error) {
      try {
        await this.repository.failWorkerStart(payload);
      } catch {
        // Recovery can reclaim an expired lease even if closing this start failure fails.
      }
      this.log({
        event: "local_product_activation_failed",
        ...payload,
        errorCode: "product_activation_worker_start_failed",
        exceptionClass: exceptionClass(error),
      });
    } finally {
      this.deleteIfCurrent(key, token);
    }
  }

  private async runRecovery(): Promise<void> {
    try {
      const dispatches = await this.repository.listRecoverableDispatches(
        this.config.claimTimeoutSeconds,
        this.config.recoveryBatchSize,
      );
      const results = await Promise.allSettled(dispatches.map((payload) => this.dispatch(payload)));
      for (const result of results) {
        if (result.status !== "rejected") continue;
        this.log({
          event: "local_product_activation_recovery_failed",
          errorCode: "product_activation_recovery_failed",
          exceptionClass: exceptionClass(result.reason),
        });
      }
    } catch (error) {
      this.log({
        event: "local_product_activation_recovery_failed",
        errorCode: "product_activation_recovery_failed",
        exceptionClass: exceptionClass(error),
      });
    }
  }

  private deleteIfCurrent(key: string, token: object): void {
    if (this.activeDispatches.get(key)?.token === token) {
      this.activeDispatches.delete(key);
    }
  }
}

function dispatchKey(payload: ProductActivationDispatchPayload): string {
  return `${payload.runId}:${payload.dispatchGeneration}`;
}

function exceptionClass(error: unknown): string {
  return error instanceof Error ? error.constructor.name : "UnknownError";
}

function scheduleRecoveryInterval(work: () => void, intervalMs: number): () => void {
  const interval = setInterval(work, intervalMs);
  interval.unref();
  return () => clearInterval(interval);
}

function writeLog(entry: LocalProductActivationLog): void {
  const severity = entry.event.endsWith("failed") ? "error" : "info";
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "bazoria_product_activation_dispatcher",
    severity,
    ...entry,
  });
  if (severity === "error") {
    console.error(line);
    return;
  }
  console.info(line);
}
