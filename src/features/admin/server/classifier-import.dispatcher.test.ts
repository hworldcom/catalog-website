import { describe, expect, it, vi } from "vitest";

import {
  LocalClassifierImportDispatcher,
  type LocalClassifierImportDispatchLog,
} from "./classifier-import.dispatcher";

const importId = "00000000-0000-0000-0000-000000000003";

describe("LocalClassifierImportDispatcher", () => {
  it("schedules exact-import execution and returns before the worker finishes", async () => {
    let scheduled: (() => void) | undefined;
    const run = vi.fn().mockResolvedValue({ status: "completed" });
    const logs: LocalClassifierImportDispatchLog[] = [];
    const dispatcher = new LocalClassifierImportDispatcher(
      async () => ({ run }),
      (work) => {
        scheduled = work;
      },
      (entry) => logs.push(entry),
    );

    await expect(dispatcher.dispatch(importId)).resolves.toBe("accepted");
    expect(run).not.toHaveBeenCalled();

    scheduled?.();
    await vi.waitFor(() => expect(run).toHaveBeenCalledWith(importId));
    await vi.waitFor(() =>
      expect(logs).toContainEqual({
        event: "local_import_dispatch_finished",
        importId,
        status: "completed",
      }),
    );
  });

  it("deduplicates schedules while the same import is active", async () => {
    const scheduled: (() => void)[] = [];
    const dispatcher = new LocalClassifierImportDispatcher(
      async () => ({ run: vi.fn().mockResolvedValue({ status: "idle" }) }),
      (work) => scheduled.push(work),
      vi.fn(),
    );

    await dispatcher.dispatch(importId);
    await dispatcher.dispatch(importId);

    expect(scheduled).toHaveLength(1);
  });

  it("surfaces synchronous scheduling failures and permits another dispatch", async () => {
    let fail = true;
    const scheduled: (() => void)[] = [];
    const dispatcher = new LocalClassifierImportDispatcher(
      async () => ({ run: vi.fn().mockResolvedValue({ status: "idle" }) }),
      (work) => {
        if (fail) {
          fail = false;
          throw new Error("scheduler unavailable");
        }
        scheduled.push(work);
      },
      vi.fn(),
    );

    await expect(dispatcher.dispatch(importId)).rejects.toThrow("scheduler unavailable");
    await expect(dispatcher.dispatch(importId)).resolves.toBe("accepted");
    expect(scheduled).toHaveLength(1);
  });

  it("logs asynchronous worker failures without exposing the exception message", async () => {
    let scheduled: (() => void) | undefined;
    const logs: LocalClassifierImportDispatchLog[] = [];
    const dispatcher = new LocalClassifierImportDispatcher(
      async () => ({
        run: vi.fn().mockRejectedValue(new Error("secret upstream response")),
      }),
      (work) => {
        scheduled = work;
      },
      (entry) => logs.push(entry),
    );

    await dispatcher.dispatch(importId);
    scheduled?.();

    await vi.waitFor(() =>
      expect(logs).toContainEqual({
        event: "local_import_dispatch_failed",
        importId,
        errorCode: "classifier_import_local_dispatch_failed",
        exceptionClass: "Error",
      }),
    );
    expect(JSON.stringify(logs)).not.toContain("secret upstream response");
  });
});
