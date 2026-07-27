import { describe, expect, it, vi } from "vitest";

import type { ClassifierImportWorkerResult } from "./classifier-import.worker";
import {
  ClassifierImportWorkerLoop,
  createClassifierImportWorkerLoop,
  type ClassifierImportWorkerLogEntry,
} from "./classifier-import.worker-loop";

const completedResult: ClassifierImportWorkerResult = {
  status: "completed",
  importId: "00000000-0000-0000-0000-000000000001",
  operationKind: "import",
  attemptCount: 2,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function testOptions(
  worker: { runNext: () => Promise<ClassifierImportWorkerResult> },
  logs: ClassifierImportWorkerLogEntry[],
) {
  return {
    worker,
    pollIntervalMs: 5_000,
    log: (entry: ClassifierImportWorkerLogEntry) => logs.push(entry),
    now: () => new Date("2026-07-22T10:00:00.000Z"),
    scheduleHeartbeat: () => () => undefined,
  };
}

describe("ClassifierImportWorkerLoop", () => {
  it("constructs one runtime and executes terminal work sequentially before sleeping on idle", async () => {
    const logs: ClassifierImportWorkerLogEntry[] = [];
    let activeCalls = 0;
    let maximumActiveCalls = 0;
    const runNext = vi
      .fn<() => Promise<ClassifierImportWorkerResult>>()
      .mockImplementationOnce(async () => {
        activeCalls += 1;
        maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
        await Promise.resolve();
        activeCalls -= 1;
        return completedResult;
      })
      .mockImplementationOnce(async () => {
        activeCalls += 1;
        maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
        await Promise.resolve();
        activeCalls -= 1;
        return { status: "idle" };
      });
    const createWorker = vi.fn(async () => ({ runNext }));
    const loopReference: { current?: ClassifierImportWorkerLoop } = {};
    const wait = vi.fn(async () => {
      loopReference.current?.requestShutdown();
    });

    const loop = await createClassifierImportWorkerLoop({
      ...testOptions({ runNext }, logs),
      createWorker,
      wait,
    });
    loopReference.current = loop;
    await loop.run();

    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(runNext).toHaveBeenCalledTimes(2);
    expect(maximumActiveCalls).toBe(1);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(5_000, expect.any(AbortSignal));
    expect(logs).toContainEqual({
      timestamp: "2026-07-22T10:00:00.000Z",
      service: "bazoria_classifier_import_worker",
      event: "import_attempt_finished",
      severity: "info",
      importId: completedResult.importId,
      operationKind: "import",
      attemptCount: 2,
      status: "completed",
    });
  });

  it("interrupts an idle wait and exits cleanly on the first shutdown request", async () => {
    const logs: ClassifierImportWorkerLogEntry[] = [];
    const waitStarted = deferred<void>();
    const wait = vi.fn((_durationMs: number, signal: AbortSignal) => {
      waitStarted.resolve();
      return new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    });
    const runNext = vi.fn(async () => ({ status: "idle" }) as const);
    const loop = new ClassifierImportWorkerLoop({
      ...testOptions({ runNext }, logs),
      wait,
    });

    const running = loop.run();
    await waitStarted.promise;
    expect(loop.requestShutdown()).toBe(true);
    expect(loop.requestShutdown()).toBe(false);
    await running;

    expect(runNext).toHaveBeenCalledTimes(1);
    expect(logs.map((entry) => entry.event)).toEqual([
      "worker_started",
      "worker_heartbeat",
      "worker_shutdown_requested",
      "worker_stopped",
    ]);
  });

  it("finishes active work after shutdown and does not claim another import", async () => {
    const logs: ClassifierImportWorkerLogEntry[] = [];
    const runStarted = deferred<void>();
    const result = deferred<ClassifierImportWorkerResult>();
    const runNext = vi.fn(() => {
      runStarted.resolve();
      return result.promise;
    });
    const wait = vi.fn(async () => undefined);
    const loop = new ClassifierImportWorkerLoop({
      ...testOptions({ runNext }, logs),
      wait,
    });

    const running = loop.run();
    await runStarted.promise;
    loop.requestShutdown();
    result.resolve(completedResult);
    await running;

    expect(runNext).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
    expect(logs.map((entry) => entry.event)).toEqual([
      "worker_started",
      "worker_heartbeat",
      "worker_shutdown_requested",
      "import_attempt_finished",
      "worker_stopped",
    ]);
  });

  it("backs off after an unexpected error, logs only its class, and continues", async () => {
    const logs: ClassifierImportWorkerLogEntry[] = [];
    const runNext = vi
      .fn<() => Promise<ClassifierImportWorkerResult>>()
      .mockRejectedValueOnce(new TypeError("secret provider payload"))
      .mockResolvedValueOnce({ status: "idle" });
    const loopReference: { current?: ClassifierImportWorkerLoop } = {};
    const wait = vi.fn(async () => {
      if (wait.mock.calls.length === 2) loopReference.current?.requestShutdown();
    });
    const loop = new ClassifierImportWorkerLoop({
      ...testOptions({ runNext }, logs),
      wait,
    });
    loopReference.current = loop;

    await loop.run();

    expect(runNext).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(logs).toContainEqual({
      timestamp: "2026-07-22T10:00:00.000Z",
      service: "bazoria_classifier_import_worker",
      event: "worker_iteration_failed",
      severity: "error",
      errorCode: "classifier_import_worker_iteration_failed",
      exceptionClass: "TypeError",
    });
    expect(JSON.stringify(logs)).not.toContain("secret provider payload");
  });

  it("emits startup and periodic heartbeats until shutdown", async () => {
    const logs: ClassifierImportWorkerLogEntry[] = [];
    let heartbeat: (() => void) | undefined;
    const cancelHeartbeat = vi.fn();
    const scheduleHeartbeat = vi.fn((callback: () => void) => {
      heartbeat = callback;
      return cancelHeartbeat;
    });
    const loopReference: { current?: ClassifierImportWorkerLoop } = {};
    const wait = vi.fn(async () => {
      heartbeat?.();
      loopReference.current?.requestShutdown();
    });
    const loop = new ClassifierImportWorkerLoop({
      ...testOptions({ runNext: async () => ({ status: "idle" }) }, logs),
      wait,
      scheduleHeartbeat,
    });
    loopReference.current = loop;

    await loop.run();

    expect(scheduleHeartbeat).toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect(cancelHeartbeat).toHaveBeenCalledTimes(1);
    expect(logs.filter((entry) => entry.event === "worker_heartbeat")).toHaveLength(2);
  });
});
