import { describe, expect, it, vi } from "vitest";

import { LocalProductPublicationDispatcher } from "./product-publication.dispatcher";

describe("LocalProductPublicationDispatcher", () => {
  it("coalesces duplicate dispatches while one exact ProductDraft is active", async () => {
    const scheduled: (() => void)[] = [];
    const run = vi.fn(async () => ({
      status: "completed" as const,
      productDraftId: uuid(1),
    }));
    const dispatcher = new LocalProductPublicationDispatcher(
      async () => ({ run }),
      (work) => scheduled.push(work),
      vi.fn(),
    );

    await dispatcher.dispatch(uuid(1));
    await dispatcher.dispatch(uuid(1));

    expect(scheduled).toHaveLength(1);
    scheduled[0]!();
    await vi.waitFor(() => expect(run).toHaveBeenCalledWith(uuid(1)));
  });

  it("does not hide a synchronous scheduling failure", async () => {
    const dispatcher = new LocalProductPublicationDispatcher(
      async () => ({ run: vi.fn() }),
      () => {
        throw new Error("schedule failed");
      },
      vi.fn(),
    );

    await expect(dispatcher.dispatch(uuid(1))).rejects.toThrow("schedule failed");
  });

  it("conditionally marks a run failed when background startup throws", async () => {
    const scheduled: (() => void)[] = [];
    const markDispatchFailed = vi.fn(async () => undefined);
    const dispatcher = new LocalProductPublicationDispatcher(
      async () => {
        throw new Error("runtime unavailable");
      },
      (work) => scheduled.push(work),
      vi.fn(),
      markDispatchFailed,
    );

    await dispatcher.dispatch(uuid(1));
    scheduled[0]!();

    await vi.waitFor(() => expect(markDispatchFailed).toHaveBeenCalledWith(uuid(1)));
  });
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
