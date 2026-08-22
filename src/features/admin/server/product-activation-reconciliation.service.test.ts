import { describe, expect, it, vi } from "vitest";

import type {
  ProductActivationDetailedDispatcher,
  ProductActivationDetailedDispatchResult,
} from "./product-activation.cloud-tasks";
import { ProductActivationReconciliationService } from "./product-activation-reconciliation.service";
import type { ProductActivationRepository } from "./product-activation.repository";
import {
  ProductActivationError,
  type ProductActivationDispatchPayload,
} from "./product-activation.types";

describe("ProductActivationReconciliationService", () => {
  it("classifies every selected row exactly once and continues after row failures", async () => {
    const selected = Array.from({ length: 6 }, (_value, index) => payload(index + 1));
    const outcomes: Array<ProductActivationDetailedDispatchResult | Error> = [
      detailed("dispatched", "created"),
      detailed("dispatched", "already_exists"),
      detailed("pending", "created", "stale"),
      activationError("product_moderation_activation_unavailable", 503),
      detailed("failed", "definitive_failure"),
      activationError("product_moderation_not_found", 404),
    ];
    const repository = repositoryFixture(selected);
    const dispatcher = dispatcherFixture(outcomes);
    const writeRowLog = vi.fn();
    const service = new ProductActivationReconciliationService(repository, dispatcher, {
      batchSize: 100,
      deadlineMs: 60_000,
      maximumEnqueueAttemptMs: 45_000,
      writeRowLog,
    });

    const summary = await service.run();

    expect(summary).toMatchObject({
      selected: 6,
      confirmedDispatched: 2,
      alreadyExisting: 1,
      stillPending: 1,
      stale: 2,
      failed: 1,
    });
    expect(
      summary.confirmedDispatched + summary.stillPending + summary.stale + summary.failed,
    ).toBe(summary.selected);
    expect(dispatcher.dispatchWithOutcome).toHaveBeenCalledTimes(6);
    expect(writeRowLog).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "still_pending",
        errorCode: "product_moderation_activation_unavailable",
      }),
    );
  });

  it.each([
    ["product_moderation_not_found", 404],
    ["product_moderation_submission_stale", 409],
    ["product_activation_dispatch_not_allowed", 409],
  ] as const)("classifies %s as permanent stale work", async (code, statusCode) => {
    const repository = repositoryFixture([payload(1)]);
    const dispatcher = dispatcherFixture([activationError(code, statusCode)]);
    const service = new ProductActivationReconciliationService(repository, dispatcher, {
      batchSize: 1,
      deadlineMs: 60_000,
      maximumEnqueueAttemptMs: 45_000,
    });

    await expect(service.run()).resolves.toMatchObject({ stale: 1, failed: 0 });
  });

  it("leaves selected rows not reached by deadline admission pending", async () => {
    let currentTime = 0;
    const selected = [payload(1), payload(2), payload(3)];
    const repository = repositoryFixture(selected);
    const dispatcher: ProductActivationDetailedDispatcher = {
      dispatchWithOutcome: vi.fn(async () => {
        currentTime = 60_000;
        return detailed("dispatched", "created");
      }),
    };
    const service = new ProductActivationReconciliationService(repository, dispatcher, {
      batchSize: 3,
      deadlineMs: 100_000,
      maximumEnqueueAttemptMs: 50_000,
      now: () => currentTime,
    });

    await expect(service.run()).resolves.toMatchObject({
      selected: 3,
      confirmedDispatched: 1,
      stillPending: 2,
      durationMs: 60_000,
    });
    expect(dispatcher.dispatchWithOutcome).toHaveBeenCalledTimes(1);
  });

  it("treats an unexpected dispatcher exception as a failed row", async () => {
    const repository = repositoryFixture([payload(1)]);
    const dispatcher = dispatcherFixture([new TypeError("unexpected result")]);
    const writeRowLog = vi.fn();
    const service = new ProductActivationReconciliationService(repository, dispatcher, {
      batchSize: 1,
      deadlineMs: 60_000,
      maximumEnqueueAttemptMs: 45_000,
      writeRowLog,
    });

    await expect(service.run()).resolves.toMatchObject({ failed: 1 });
    expect(writeRowLog).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "product_activation_reconciliation_failed",
        exceptionClass: "TypeError",
      }),
    );
  });
});

function repositoryFixture(
  selected: ProductActivationDispatchPayload[],
): Pick<ProductActivationRepository, "listPendingDispatches"> {
  return { listPendingDispatches: vi.fn(async () => selected) };
}

function dispatcherFixture(
  outcomes: Array<ProductActivationDetailedDispatchResult | Error>,
): ProductActivationDetailedDispatcher {
  return {
    dispatchWithOutcome: vi.fn(async () => {
      const outcome = outcomes.shift()!;
      if (outcome instanceof Error) throw outcome;
      return outcome;
    }),
  };
}

function detailed(
  dispatchStatus: "pending" | "dispatched" | "failed",
  taskOutcome: ProductActivationDetailedDispatchResult["taskOutcome"],
  result: ProductActivationDetailedDispatchResult["durableResult"]["result"] = "recorded",
): ProductActivationDetailedDispatchResult {
  return {
    durableResult: {
      result,
      runId: uuid(20),
      dispatchGeneration: 1,
      dispatchStatus,
      dispatchRequired: false,
    },
    taskOutcome,
  };
}

function activationError(
  code: ProductActivationError["code"],
  statusCode: ProductActivationError["statusCode"],
): ProductActivationError {
  return new ProductActivationError(statusCode, code, code);
}

function payload(value: number): ProductActivationDispatchPayload {
  return { runId: uuid(value), dispatchGeneration: value };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
