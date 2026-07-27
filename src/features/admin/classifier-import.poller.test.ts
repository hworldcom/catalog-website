import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClassifierImportSnapshot } from "./classifier-import.api";
import { ClassifierImportPoller } from "./classifier-import.poller";

const importId = "00000000-0000-0000-0000-000000000010";

function snapshot(status: ClassifierImportSnapshot["status"]): ClassifierImportSnapshot {
  return {
    importId,
    classifierBatchId: "00000000-0000-0000-0000-000000000020",
    destinationSeller: {
      id: "00000000-0000-0000-0000-000000000030",
      name: "Kesar Textiles",
    },
    status,
    operationKind: "import",
    errorCode: null,
    pendingGroupCount: status === "pending" ? 1 : 0,
    processingGroupCount: 0,
    completeGroupCount: status === "completed" ? 1 : 0,
    failedGroupCount: 0,
    actions: {
      canRetryTemporary: false,
      canRetryAll: false,
      canReconcile: false,
    },
    groups: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("ClassifierImportPoller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits for an active request before scheduling the next poll", async () => {
    const first = deferred<ClassifierImportSnapshot>();
    const getStatus = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(snapshot("completed"));
    const onSnapshot = vi.fn();
    const poller = new ClassifierImportPoller({
      importId,
      client: { getStatus },
      onSnapshot,
      onError: vi.fn(),
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(getStatus).toHaveBeenCalledTimes(1);

    first.resolve(snapshot("pending"));
    await Promise.resolve();
    expect(onSnapshot).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(getStatus).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(getStatus).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("retains the last snapshot and retries after a transient poll failure", async () => {
    const error = new Error("Temporary refresh failure");
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce(snapshot("pending"))
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(snapshot("completed"));
    const onSnapshot = vi.fn();
    const onError = vi.fn();
    const poller = new ClassifierImportPoller({
      importId,
      client: { getStatus },
      onSnapshot,
      onError,
    });

    poller.start();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(onError).toHaveBeenCalledWith(error, false);
    expect(onSnapshot).toHaveBeenLastCalledWith(snapshot("pending"));

    await vi.advanceTimersByTimeAsync(5_000);
    expect(onSnapshot).toHaveBeenLastCalledWith(snapshot("completed"));
    expect(getStatus).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(getStatus).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  it("does not poll terminal snapshots", async () => {
    const getStatus = vi.fn().mockResolvedValue(snapshot("failed"));
    const poller = new ClassifierImportPoller({
      importId,
      client: { getStatus },
      onSnapshot: vi.fn(),
      onError: vi.fn(),
    });

    poller.start();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(20_000);

    expect(getStatus).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it("discards a late poll response after an action replaces the snapshot", async () => {
    const oldRequest = deferred<ClassifierImportSnapshot>();
    const getStatus = vi
      .fn()
      .mockImplementationOnce(() => oldRequest.promise)
      .mockResolvedValueOnce(snapshot("completed"));
    const onSnapshot = vi.fn();
    const poller = new ClassifierImportPoller({
      importId,
      client: { getStatus },
      onSnapshot,
      onError: vi.fn(),
    });

    poller.start();
    poller.pause();
    poller.replace(snapshot("pending"));
    oldRequest.resolve(snapshot("failed"));
    await Promise.resolve();

    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(onSnapshot).toHaveBeenLastCalledWith(snapshot("pending"));

    await vi.advanceTimersByTimeAsync(5_000);
    expect(onSnapshot).toHaveBeenLastCalledWith(snapshot("completed"));
    poller.stop();
  });
});
