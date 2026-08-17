import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ProductModerationMutationInProgressError,
  useProductModerationMutationCoordinator,
} from "./product-moderation-mutation-coordinator";

describe("useProductModerationMutationCoordinator", () => {
  it("serializes writes and uses each exact returned revision for the next operation", async () => {
    const onRevisionChange = vi.fn();
    const { result } = renderHook(() =>
      useProductModerationMutationCoordinator(3, onRevisionChange),
    );
    const first = deferred<{ moderationRevision: number }>();
    const firstOperation = vi.fn(() => first.promise);

    let firstRun!: Promise<{ moderationRevision: number }>;
    await act(async () => {
      firstRun = result.current.run(firstOperation, (value) => value.moderationRevision);
      await expect(
        result.current.run(
          async () => ({ moderationRevision: 99 }),
          (value) => value.moderationRevision,
        ),
      ).rejects.toBeInstanceOf(ProductModerationMutationInProgressError);
    });
    expect(firstOperation).toHaveBeenCalledWith(3);

    await act(async () => {
      first.resolve({ moderationRevision: 7 });
      await firstRun;
    });
    expect(result.current.revision).toBe(7);

    const secondOperation = vi.fn(async () => ({ moderationRevision: 5 }));
    await act(async () => {
      await result.current.run(secondOperation, (value) => value.moderationRevision);
    });
    expect(secondOperation).toHaveBeenCalledWith(7);
    expect(result.current.revision).toBe(5);
    expect(onRevisionChange).toHaveBeenLastCalledWith(5);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}
