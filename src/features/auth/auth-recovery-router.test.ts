import { describe, expect, it, vi } from "vitest";

import type { AuthRecoverySnapshot } from "./auth-recovery-coordinator";
import { subscribeToAuthRecoveryRouterInvalidation } from "./auth-recovery-router";

describe("subscribeToAuthRecoveryRouterInvalidation", () => {
  it("invalidates protected routes whenever recovery state changes", () => {
    let listener: ((snapshot: AuthRecoverySnapshot) => void) | undefined;
    const unsubscribe = vi.fn();
    const invalidate = vi.fn();

    const returnedUnsubscribe = subscribeToAuthRecoveryRouterInvalidation({
      invalidate,
      subscribe: (nextListener) => {
        listener = nextListener;
        return unsubscribe;
      },
    });

    listener?.({ status: "active", userId: "user-1", expiresAt: 2_000 });
    listener?.({ status: "invalid" });
    listener?.({ status: "inactive" });
    expect(invalidate).toHaveBeenCalledTimes(3);

    returnedUnsubscribe();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
