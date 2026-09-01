import { describe, expect, it, vi } from "vitest";

import {
  completePasswordRecovery,
  finishPasswordRecoverySignOut,
} from "./password-recovery-operations";

describe("password recovery operations", () => {
  it("updates the password, signs out locally, and clears recovery state", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const clearRecoveryState = vi.fn();

    await expect(
      completePasswordRecovery({
        auth: { updateUser, signOut },
        password: "new-password",
        clearRecoveryState,
      }),
    ).resolves.toEqual({ status: "completed" });
    expect(updateUser).toHaveBeenCalledWith({ password: "new-password" });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(clearRecoveryState).toHaveBeenCalledOnce();
  });

  it("preserves recovery state and skips sign-out after an update failure", async () => {
    const signOut = vi.fn();
    const clearRecoveryState = vi.fn();

    await expect(
      completePasswordRecovery({
        auth: {
          updateUser: vi.fn().mockResolvedValue({ error: new Error("provider response") }),
          signOut,
        },
        password: "new-password",
        clearRecoveryState,
      }),
    ).resolves.toEqual({ status: "update_failed" });
    expect(signOut).not.toHaveBeenCalled();
    expect(clearRecoveryState).not.toHaveBeenCalled();
  });

  it("locks completion into sign-out-only recovery after the password was changed", async () => {
    const clearRecoveryState = vi.fn();
    const auth = {
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi
        .fn()
        .mockResolvedValueOnce({ error: new Error("network") })
        .mockResolvedValueOnce({ error: null }),
    };

    await expect(
      completePasswordRecovery({ auth, password: "new-password", clearRecoveryState }),
    ).resolves.toEqual({ status: "sign_out_failed" });
    expect(clearRecoveryState).not.toHaveBeenCalled();

    await expect(finishPasswordRecoverySignOut({ auth, clearRecoveryState })).resolves.toEqual({
      status: "completed",
    });
    expect(auth.updateUser).toHaveBeenCalledOnce();
    expect(auth.signOut).toHaveBeenCalledTimes(2);
    expect(clearRecoveryState).toHaveBeenCalledOnce();
  });

  it("uses the same local sign-out operation for cancellation", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });

    await finishPasswordRecoverySignOut({
      auth: { signOut },
      clearRecoveryState: vi.fn(),
    });

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
