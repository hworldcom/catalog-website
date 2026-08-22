import type { ProductActivationDetailedDispatcher } from "./product-activation.cloud-tasks";
import type { ProductActivationRepository } from "./product-activation.repository";
import {
  ProductActivationError,
  type ProductActivationDispatchPayload,
} from "./product-activation.types";

export type ProductActivationReconciliationSummary = {
  selected: number;
  confirmedDispatched: number;
  alreadyExisting: number;
  stillPending: number;
  stale: number;
  failed: number;
  durationMs: number;
};

export type ProductActivationReconciliationRowLog = {
  event: "product_activation_reconciliation_row_finished";
  severity: "info" | "warning" | "error";
  outcome: "still_pending" | "stale" | "failed";
  runId: string;
  dispatchGeneration: number;
  errorCode: string;
  exceptionClass: string;
};

type ReconciliationRepository = Pick<ProductActivationRepository, "listPendingDispatches">;
type WriteRowLog = (entry: ProductActivationReconciliationRowLog) => void;

export type ProductActivationReconciliationOptions = {
  batchSize: number;
  deadlineMs: number;
  maximumEnqueueAttemptMs: number;
  now?: () => number;
  writeRowLog?: WriteRowLog;
};

export class ProductActivationReconciliationService {
  private readonly now: () => number;
  private readonly writeRowLog: WriteRowLog;

  constructor(
    private readonly repository: ReconciliationRepository,
    private readonly dispatcher: ProductActivationDetailedDispatcher,
    private readonly options: ProductActivationReconciliationOptions,
  ) {
    this.now = options.now ?? Date.now;
    this.writeRowLog = options.writeRowLog ?? (() => undefined);
  }

  async run(): Promise<ProductActivationReconciliationSummary> {
    const startedAt = this.now();
    const deadlineAt = startedAt + this.options.deadlineMs;
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), this.options.deadlineMs);

    try {
      const selected = await raceWithSignal(
        this.repository.listPendingDispatches(this.options.batchSize),
        deadline.signal,
      );
      const summary = emptySummary(selected.length);

      for (let index = 0; index < selected.length; index += 1) {
        const payload = selected[index]!;
        if (
          deadline.signal.aborted ||
          deadlineAt - this.now() < this.options.maximumEnqueueAttemptMs
        ) {
          summary.stillPending += selected.length - index;
          break;
        }
        await this.reconcileRow(payload, deadline.signal, summary);
      }

      summary.durationMs = Math.max(0, this.now() - startedAt);
      return summary;
    } finally {
      clearTimeout(timer);
      deadline.abort();
    }
  }

  private async reconcileRow(
    payload: ProductActivationDispatchPayload,
    signal: AbortSignal,
    summary: ProductActivationReconciliationSummary,
  ): Promise<void> {
    try {
      const result = await this.dispatcher.dispatchWithOutcome(payload, { signal });
      if (result.durableResult.result === "stale") {
        summary.stale += 1;
        return;
      }
      if (result.durableResult.dispatchStatus === "dispatched") {
        summary.confirmedDispatched += 1;
        if (result.taskOutcome === "already_exists") summary.alreadyExisting += 1;
        return;
      }
      if (result.durableResult.dispatchStatus === "failed") {
        summary.failed += 1;
        this.logRow(payload, "failed", "product_activation_dispatch_failed", result);
        return;
      }

      summary.failed += 1;
      this.logRow(payload, "failed", "product_activation_reconciliation_failed", result);
    } catch (error) {
      const classification = classifyError(error);
      if (classification.outcome === "stale") summary.stale += 1;
      else if (classification.outcome === "still_pending") summary.stillPending += 1;
      else summary.failed += 1;
      this.logRow(payload, classification.outcome, classification.errorCode, error);
    }
  }

  private logRow(
    payload: ProductActivationDispatchPayload,
    outcome: "still_pending" | "stale" | "failed",
    errorCode: string,
    error: unknown,
  ): void {
    this.writeRowLog({
      event: "product_activation_reconciliation_row_finished",
      severity: outcome === "failed" ? "error" : outcome === "still_pending" ? "warning" : "info",
      outcome,
      ...payload,
      errorCode,
      exceptionClass: exceptionClass(error),
    });
  }
}

function emptySummary(selected: number): ProductActivationReconciliationSummary {
  return {
    selected,
    confirmedDispatched: 0,
    alreadyExisting: 0,
    stillPending: 0,
    stale: 0,
    failed: 0,
    durationMs: 0,
  };
}

function classifyError(error: unknown): {
  outcome: "still_pending" | "stale" | "failed";
  errorCode: string;
} {
  if (error instanceof ProductActivationError) {
    if (
      error.code === "product_moderation_not_found" ||
      error.code === "product_moderation_submission_stale" ||
      error.code === "product_activation_dispatch_not_allowed"
    ) {
      return { outcome: "stale", errorCode: error.code };
    }
    if (error.code === "product_moderation_activation_unavailable") {
      return { outcome: "still_pending", errorCode: error.code };
    }
    return { outcome: "failed", errorCode: error.code };
  }
  return { outcome: "failed", errorCode: "product_activation_reconciliation_failed" };
}

function exceptionClass(error: unknown): string {
  return error instanceof Error && error.constructor.name ? error.constructor.name : "UnknownError";
}

function raceWithSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(activationUnavailable());
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => finish(() => reject(activationUnavailable()));
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

function activationUnavailable(): ProductActivationError {
  return new ProductActivationError(
    503,
    "product_moderation_activation_unavailable",
    "Product activation reconciliation exceeded its deadline.",
  );
}
