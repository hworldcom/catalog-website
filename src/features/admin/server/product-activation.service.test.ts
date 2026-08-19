import { describe, expect, it, vi } from "vitest";

import type { PrototypeAdministratorRequestContext } from "../prototype-administrator.middleware";
import type { ProductActivationDispatcher } from "./product-activation.dispatcher";
import type { ProductActivationRepository } from "./product-activation.repository";
import {
  decideProductModerationSubmission,
  requestProductActivationAbandonment,
  retryProductActivationCleanup,
  retryProductActivationDispatch,
  retryProductActivationRun,
  retryAdministratorProductActivationPostSwitchCleanup,
} from "./product-activation.service";
import type {
  ProductActivationDispatchResult,
  ProductModerationDecisionResult,
} from "./product-activation.types";

const authorization = {
  userId: uuid(1),
  accessToken: "token",
  prototypeAdministrator: true,
} as unknown as PrototypeAdministratorRequestContext;

describe("product activation service", () => {
  it("commits approval before dispatching its exact run generation", async () => {
    const calls: string[] = [];
    const repository = repositoryFixture({
      decide: vi.fn(async () => {
        calls.push("decision");
        return approval();
      }),
    });
    const dispatcher: ProductActivationDispatcher = {
      dispatch: vi.fn(async (payload) => {
        calls.push("dispatch");
        expect(payload).toEqual({ runId: uuid(4), dispatchGeneration: 1 });
        return dispatched();
      }),
    };

    const result = await decideProductModerationSubmission({
      authorization,
      repository,
      dispatcher,
      submissionId: uuid(2),
      expectedRevision: 3,
      decision: "approve",
      reason: null,
      decisionRequestId: uuid(3),
    });

    expect(calls).toEqual(["decision", "dispatch"]);
    expect(result.dispatch?.dispatchStatus).toBe("dispatched");
    expect(repository.recordDispatchResult).not.toHaveBeenCalled();
  });

  it("durably records confirmed adapter failure without rolling back approval", async () => {
    const repository = repositoryFixture({ decide: vi.fn(async () => approval()) });
    const dispatcher: ProductActivationDispatcher = {
      dispatch: vi.fn(async () => failedDispatch()),
    };

    const result = await decideProductModerationSubmission({
      authorization,
      repository,
      dispatcher,
      submissionId: uuid(2),
      expectedRevision: 3,
      decision: "approve",
      reason: null,
      decisionRequestId: uuid(3),
    });

    expect(result.decision.reviewStatus).toBe("approved");
    expect(result.dispatch?.dispatchStatus).toBe("failed");
    expect(repository.recordDispatchResult).not.toHaveBeenCalled();
  });

  it("does not dispatch request-changes decisions", async () => {
    const decision: ProductModerationDecisionResult = {
      ...approval(),
      reviewStatus: "changes_requested",
      activationRunId: null,
      dispatchGeneration: null,
      dispatchRequired: false,
    };
    const repository = repositoryFixture({ decide: vi.fn(async () => decision) });
    const dispatcher = { dispatch: vi.fn(async () => dispatched()) };

    const result = await decideProductModerationSubmission({
      authorization,
      repository,
      dispatcher,
      submissionId: uuid(2),
      expectedRevision: 3,
      decision: "request_changes",
      reason: "Add a clearer cover image.",
      decisionRequestId: uuid(3),
    });

    expect(result.dispatch).toBeNull();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("propagates a dispatcher persistence failure without a second repository write", async () => {
    const repository = repositoryFixture({ decide: vi.fn(async () => approval()) });
    const dispatcher = {
      dispatch: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    };

    await expect(
      decideProductModerationSubmission({
        authorization,
        repository,
        dispatcher,
        submissionId: uuid(2),
        expectedRevision: 3,
        decision: "approve",
        reason: null,
        decisionRequestId: uuid(3),
      }),
    ).rejects.toThrow("database unavailable");

    expect(repository.recordDispatchResult).not.toHaveBeenCalled();
  });

  it("redispatches the generation returned by an explicit retry", async () => {
    const retry: ProductActivationDispatchResult = {
      result: "retried",
      runId: uuid(4),
      dispatchGeneration: 2,
      dispatchStatus: "pending",
      dispatchRequired: true,
    };
    const repository = repositoryFixture({
      retryDispatch: vi.fn(async () => retry),
    });
    const dispatcher = {
      dispatch: vi.fn(async () => ({
        ...retry,
        result: "recorded" as const,
        dispatchStatus: "dispatched" as const,
        dispatchRequired: false,
      })),
    };

    const result = await retryProductActivationDispatch({
      authorization,
      repository,
      dispatcher,
      runId: uuid(4),
      expectedDispatchGeneration: 1,
      requestId: uuid(5),
    });

    expect(dispatcher.dispatch).toHaveBeenCalledWith({
      runId: uuid(4),
      dispatchGeneration: 2,
    });
    expect(result.dispatchStatus).toBe("dispatched");
  });

  it("dispatches the exact generation returned by activation recovery", async () => {
    const repository = repositoryFixture({
      retryActivation: vi.fn(async () => recovery({ phase: "activation" })),
    });
    const dispatcher = {
      dispatch: vi.fn(async () => ({
        ...dispatched(),
        dispatchGeneration: 2,
      })),
    };

    const result = await retryProductActivationRun({
      authorization,
      repository,
      dispatcher,
      runId: uuid(4),
      expectedDispatchGeneration: 1,
      requestId: uuid(8),
    });

    expect(dispatcher.dispatch).toHaveBeenCalledWith({
      runId: uuid(4),
      dispatchGeneration: 2,
    });
    expect(result.recovery.status).toBe("pending");
  });

  it("does not dispatch abandonment that completed without owned objects", async () => {
    const repository = repositoryFixture({
      requestAbandonment: vi.fn(async () =>
        recovery({
          phase: "pre_switch_cleanup",
          status: "abandoned",
          dispatchRequired: false,
          dispatchGeneration: 1,
        }),
      ),
    });
    const dispatcher = { dispatch: vi.fn(async () => dispatched()) };

    const result = await requestProductActivationAbandonment({
      authorization: { userId: uuid(9), sellerId: uuid(7) },
      repository,
      dispatcher,
      runId: uuid(4),
      expectedDispatchGeneration: 1,
      requestId: uuid(8),
    });

    expect(result.recovery.status).toBe("abandoned");
    expect(result.dispatch).toBeNull();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("dispatches cleanup retry after the protected recovery write commits", async () => {
    const repository = repositoryFixture({
      retryCleanup: vi.fn(async () => recovery({ phase: "post_switch_cleanup" })),
    });
    const dispatcher = {
      dispatch: vi.fn(async () => ({ ...dispatched(), dispatchGeneration: 2 })),
    };

    await retryProductActivationCleanup({
      authorization,
      repository,
      dispatcher,
      runId: uuid(4),
      expectedDispatchGeneration: 1,
      requestId: uuid(8),
    });

    expect(dispatcher.dispatch).toHaveBeenCalledWith({
      runId: uuid(4),
      dispatchGeneration: 2,
    });
  });

  it("uses the administrator-only post-switch cleanup operation", async () => {
    const repository = repositoryFixture({
      retryAdministratorPostSwitchCleanup: vi.fn(async () =>
        recovery({ phase: "post_switch_cleanup" }),
      ),
    });
    const dispatcher = {
      dispatch: vi.fn(async () => ({ ...dispatched(), dispatchGeneration: 2 })),
    };

    await retryAdministratorProductActivationPostSwitchCleanup({
      authorization,
      repository,
      dispatcher,
      runId: uuid(4),
      expectedDispatchGeneration: 1,
      requestId: uuid(8),
    });

    expect(repository.retryAdministratorPostSwitchCleanup).toHaveBeenCalledWith({
      runId: uuid(4),
      expectedDispatchGeneration: 1,
      requestId: uuid(8),
      administratorUserId: authorization.userId,
    });
    expect(dispatcher.dispatch).toHaveBeenCalledWith({
      runId: uuid(4),
      dispatchGeneration: 2,
    });
  });
});

function repositoryFixture(
  overrides: Partial<ProductActivationRepository> = {},
): ProductActivationRepository {
  return {
    decide: vi.fn<ProductActivationRepository["decide"]>(async () => approval()),
    recordDispatchResult: vi.fn<ProductActivationRepository["recordDispatchResult"]>(async () =>
      dispatched(),
    ),
    retryDispatch: vi.fn<ProductActivationRepository["retryDispatch"]>(async () => ({
      ...dispatched(),
      result: "retried",
      dispatchGeneration: 2,
      dispatchStatus: "pending",
      dispatchRequired: true,
    })),
    retryActivation: vi.fn<ProductActivationRepository["retryActivation"]>(async () =>
      recovery({ phase: "activation" }),
    ),
    requestAbandonment: vi.fn<ProductActivationRepository["requestAbandonment"]>(async () =>
      recovery({ phase: "pre_switch_cleanup" }),
    ),
    retryCleanup: vi.fn<ProductActivationRepository["retryCleanup"]>(async () =>
      recovery({ phase: "post_switch_cleanup" }),
    ),
    retryAdministratorPostSwitchCleanup: vi.fn<
      ProductActivationRepository["retryAdministratorPostSwitchCleanup"]
    >(async () => recovery({ phase: "post_switch_cleanup" })),
    claimRun: vi.fn<ProductActivationRepository["claimRun"]>(async () => ({
      result: "not_found",
    })),
    continueCleanup: vi.fn<ProductActivationRepository["continueCleanup"]>(async () => ({
      result: "not_found",
    })),
    recordObjectCreated: vi.fn<ProductActivationRepository["recordObjectCreated"]>(
      async () => "recorded",
    ),
    verifyItem: vi.fn<ProductActivationRepository["verifyItem"]>(async () => "verified"),
    failAttempt: vi.fn<ProductActivationRepository["failAttempt"]>(async () => "failed_retryable"),
    failWorkerStart: vi.fn<ProductActivationRepository["failWorkerStart"]>(
      async () => "failed_retryable",
    ),
    finalize: vi.fn<ProductActivationRepository["finalize"]>(async () => "completed"),
    recordCleanupItemResult: vi.fn<ProductActivationRepository["recordCleanupItemResult"]>(
      async () => "completed",
    ),
    finalizeCleanup: vi.fn<ProductActivationRepository["finalizeCleanup"]>(async () => "completed"),
    listRecoverableDispatches: vi.fn<ProductActivationRepository["listRecoverableDispatches"]>(
      async () => [],
    ),
    ...overrides,
  };
}

function approval(): ProductModerationDecisionResult {
  return {
    result: "decided",
    submissionId: uuid(2),
    productId: uuid(6),
    sellerId: uuid(7),
    reviewStatus: "approved",
    revision: 3,
    activationRunId: uuid(4),
    dispatchGeneration: 1,
    dispatchRequired: true,
  };
}

function dispatched(): ProductActivationDispatchResult {
  return {
    result: "recorded",
    runId: uuid(4),
    dispatchGeneration: 1,
    dispatchStatus: "dispatched",
    dispatchRequired: false,
  };
}

function failedDispatch(): ProductActivationDispatchResult {
  return {
    ...dispatched(),
    dispatchStatus: "failed",
  };
}

function recovery(
  overrides: Partial<import("./product-activation.types").ProductActivationRecoveryResult> = {},
): import("./product-activation.types").ProductActivationRecoveryResult {
  return {
    result: "recorded",
    runId: uuid(4),
    productId: uuid(6),
    sellerId: uuid(7),
    phase: "activation",
    status: "pending",
    dispatchGeneration: 2,
    dispatchStatus: "pending",
    dispatchRequired: true,
    ...overrides,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
