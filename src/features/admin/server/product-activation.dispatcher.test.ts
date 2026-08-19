import { describe, expect, it, vi } from "vitest";

import type { ProductActivationConfig } from "./product-activation.config";
import {
  LocalProductActivationDispatcher,
  type LocalProductActivationLog,
} from "./product-activation.dispatcher";
import type { ProductActivationRepository } from "./product-activation.repository";
import type {
  ProductActivationDispatchPayload,
  ProductActivationDispatchResult,
} from "./product-activation.types";

const payload = { runId: uuid(1), dispatchGeneration: 1 };

describe("LocalProductActivationDispatcher", () => {
  it("records the exact generation before releasing its registered callback", async () => {
    const callbacks: Array<() => void> = [];
    const calls: string[] = [];
    const worker = {
      run: vi.fn(async () => {
        calls.push("worker");
        return { status: "completed" as const, ...payload };
      }),
    };
    const repository = repositoryFixture({
      recordDispatchResult: vi.fn(async () => {
        calls.push("recorded");
        return dispatched();
      }),
    });
    const dispatcher = new LocalProductActivationDispatcher(
      repository,
      async () => {
        calls.push("runtime");
        return worker;
      },
      config(),
      (callback) => {
        calls.push("scheduled");
        callbacks.push(callback);
      },
      vi.fn(),
    );

    const result = await dispatcher.dispatch(payload);

    expect(result.dispatchStatus).toBe("dispatched");
    expect(calls).toEqual(["runtime", "scheduled", "recorded"]);
    expect(worker.run).not.toHaveBeenCalled();

    callbacks[0]!();
    await vi.waitFor(() => expect(worker.run).toHaveBeenCalledWith(payload));
    expect(calls).toEqual(["runtime", "scheduled", "recorded", "worker"]);
  });

  it("coalesces duplicate in-process work by run and generation", async () => {
    const callbacks: Array<() => void> = [];
    const createWorker = vi.fn(async () => ({
      run: vi.fn(async () => ({ status: "completed" as const, ...payload })),
    }));
    const repository = repositoryFixture();
    const dispatcher = new LocalProductActivationDispatcher(
      repository,
      createWorker,
      config(),
      (callback) => callbacks.push(callback),
      vi.fn(),
    );

    const first = dispatcher.dispatch(payload);
    const second = dispatcher.dispatch(payload);
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual(secondResult);
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(repository.recordDispatchResult).toHaveBeenCalledTimes(1);
    expect(callbacks).toHaveLength(1);
  });

  it("durably records runtime construction failure before returning", async () => {
    const logs: LocalProductActivationLog[] = [];
    const repository = repositoryFixture({
      recordDispatchResult: vi.fn(async (input) =>
        input.result === "failed" ? failedDispatch() : dispatched(),
      ),
    });
    const createWorker = vi.fn(() => {
      throw new Error("invalid runtime");
    });
    const dispatcher = new LocalProductActivationDispatcher(
      repository,
      createWorker,
      config(),
      vi.fn(),
      (entry) => logs.push(entry),
    );

    await expect(dispatcher.dispatch(payload)).resolves.toMatchObject({
      dispatchStatus: "failed",
    });
    expect(repository.recordDispatchResult).toHaveBeenCalledWith({
      ...payload,
      result: "failed",
    });
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: "local_product_activation_failed",
        exceptionClass: "Error",
      }),
    );

    await expect(dispatcher.dispatch(payload)).resolves.toMatchObject({
      dispatchStatus: "failed",
    });
    expect(createWorker).toHaveBeenCalledTimes(2);
  });

  it("closes a callback failure that occurs before a worker claim", async () => {
    const callbacks: Array<() => void> = [];
    const repository = repositoryFixture();
    const dispatcher = new LocalProductActivationDispatcher(
      repository,
      async () => ({
        run: vi.fn(async () => {
          throw new Error("claim unavailable");
        }),
      }),
      config(),
      (callback) => callbacks.push(callback),
      vi.fn(),
    );

    await dispatcher.dispatch(payload);
    callbacks[0]!();

    await vi.waitFor(() => expect(repository.failWorkerStart).toHaveBeenCalledWith(payload));
  });

  it("runs bounded startup recovery and reuses the durable generation", async () => {
    const callbacks: Array<() => void> = [];
    const repository = repositoryFixture({
      listRecoverableDispatches: vi.fn(async () => [payload]),
      recordDispatchResult: vi.fn<ProductActivationRepository["recordDispatchResult"]>(
        async () => ({ ...dispatched(), result: "replay" }),
      ),
    });
    const dispatcher = new LocalProductActivationDispatcher(
      repository,
      async () => ({
        run: vi.fn(async () => ({ status: "completed" as const, ...payload })),
      }),
      config(),
      (callback) => callbacks.push(callback),
      vi.fn(),
    );

    await dispatcher.recover();

    expect(repository.listRecoverableDispatches).toHaveBeenCalledWith(360, 25);
    expect(repository.recordDispatchResult).toHaveBeenCalledWith({
      ...payload,
      result: "dispatched",
    });
    expect(callbacks).toHaveLength(1);
  });

  it("starts one immediate sweep and one non-overlapping recovery interval", async () => {
    let intervalCallback: (() => void) | undefined;
    const stop = vi.fn();
    let releaseList: (() => void) | undefined;
    const repository = repositoryFixture({
      listRecoverableDispatches: vi.fn(
        () =>
          new Promise<ProductActivationDispatchPayload[]>((resolve) => {
            releaseList = () => resolve([]);
          }),
      ),
    });
    const dispatcher = new LocalProductActivationDispatcher(
      repository,
      async () => ({ run: vi.fn() }),
      config(),
      vi.fn(),
      vi.fn(),
      (callback, intervalMs) => {
        expect(intervalMs).toBe(30_000);
        intervalCallback = callback;
        return stop;
      },
    );

    dispatcher.startRecovery();
    dispatcher.startRecovery();
    const initialRecovery = dispatcher.recover();
    intervalCallback!();

    expect(repository.listRecoverableDispatches).toHaveBeenCalledTimes(1);
    releaseList!();
    await initialRecovery;
    intervalCallback!();
    await vi.waitFor(() => expect(repository.listRecoverableDispatches).toHaveBeenCalledTimes(2));
    releaseList!();
    dispatcher.stopRecovery();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

function repositoryFixture(
  overrides: Partial<ProductActivationRepository> = {},
): ProductActivationRepository {
  return {
    decide: vi.fn<ProductActivationRepository["decide"]>(),
    recordDispatchResult: vi.fn<ProductActivationRepository["recordDispatchResult"]>(async () =>
      dispatched(),
    ),
    retryDispatch: vi.fn<ProductActivationRepository["retryDispatch"]>(),
    retryActivation: vi.fn<ProductActivationRepository["retryActivation"]>(),
    requestAbandonment: vi.fn<ProductActivationRepository["requestAbandonment"]>(),
    retryCleanup: vi.fn<ProductActivationRepository["retryCleanup"]>(),
    retryAdministratorPostSwitchCleanup:
      vi.fn<ProductActivationRepository["retryAdministratorPostSwitchCleanup"]>(),
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

function config(): ProductActivationConfig {
  return {
    dispatchMode: "local",
    maximumImageCount: 20,
    itemConcurrency: 3,
    itemTimeoutMs: 30_000,
    workerDeadlineMs: 240_000,
    claimTimeoutSeconds: 360,
    supabaseUrl: "http://127.0.0.1:54321",
    serviceRoleKey: "service-role",
    recoveryIntervalMs: 30_000,
    recoveryBatchSize: 25,
  };
}

function dispatched(): ProductActivationDispatchResult {
  return {
    result: "recorded",
    ...payload,
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

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
