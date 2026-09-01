import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthRecoveryCoordinator, type AuthRecoveryClient } from "./auth-recovery-coordinator";
import { serializeAuthRecoveryMarker } from "./auth-recovery-marker";

class FakeAuth implements AuthRecoveryClient {
  session: Session | null = null;
  user: User | null = null;
  sessionError: unknown = null;
  userError: unknown = null;
  calls: string[] = [];
  private listener: ((event: AuthChangeEvent, session: Session | null) => void) | null = null;

  async getSession() {
    this.calls.push("getSession");
    return { data: { session: this.session }, error: this.sessionError };
  }

  async getUser() {
    this.calls.push("getUser");
    return { data: { user: this.user }, error: this.userError };
  }

  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    this.listener = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  }

  emit(event: AuthChangeEvent, session: Session | null = this.session) {
    this.listener?.(event, session);
  }
}

const coordinators: AuthRecoveryCoordinator[] = [];

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  for (const coordinator of coordinators.splice(0)) coordinator.stop();
  vi.useRealTimers();
});

describe("AuthRecoveryCoordinator", () => {
  it("registers before restoring and validates a stored marker with session then user", async () => {
    const auth = authenticated("user-1", 2_000);
    const coordinator = createCoordinator(auth);
    localStorage.setItem(
      coordinator.markerKey,
      serializeAuthRecoveryMarker({ version: 1, userId: "user-1", expiresAt: 2_000 }),
    );

    await expect(coordinator.start()).resolves.toEqual({
      status: "active",
      userId: "user-1",
      expiresAt: 2_000,
    });
    expect(auth.calls).toEqual(["getSession", "getUser"]);
  });

  it("rejects session-only validation and clears a mismatched marker", async () => {
    const auth = authenticated("user-1", 2_000);
    auth.userError = new Error("validation failed");
    const coordinator = createCoordinator(auth);
    localStorage.setItem(
      coordinator.markerKey,
      serializeAuthRecoveryMarker({ version: 1, userId: "user-1", expiresAt: 2_000 }),
    );

    await expect(coordinator.start()).resolves.toEqual({ status: "invalid" });
    expect(localStorage.getItem(coordinator.markerKey)).toBeNull();
  });

  it("captures PASSWORD_RECOVERY and stores no session credentials", async () => {
    const auth = authenticated("user-1", 2_000);
    const coordinator = createCoordinator(auth);
    await coordinator.start();

    auth.emit("PASSWORD_RECOVERY");

    await vi.waitFor(() => expect(coordinator.getSnapshot().status).toBe("active"));
    const stored = localStorage.getItem(coordinator.markerKey) ?? "";
    expect(JSON.parse(stored)).toEqual({ version: 1, userId: "user-1", expiresAt: 2_000 });
    expect(stored).not.toContain("access-token");
    expect(stored).not.toContain("refresh-token");
  });

  it("does not create recovery state from an unowned token refresh", async () => {
    const auth = authenticated("user-1", 2_000);
    const coordinator = createCoordinator(auth);
    await coordinator.start();

    auth.emit("TOKEN_REFRESHED");
    await flushQueuedEvents();

    expect(coordinator.getSnapshot()).toEqual({ status: "inactive" });
    expect(localStorage.getItem(coordinator.markerKey)).toBeNull();
  });

  it("updates expiry for a same-user refresh only after recovery is active", async () => {
    const auth = authenticated("user-1", 2_000);
    const coordinator = createCoordinator(auth);
    await coordinator.start();
    auth.emit("PASSWORD_RECOVERY");
    await vi.waitFor(() => expect(coordinator.getSnapshot().status).toBe("active"));

    setAuthenticated(auth, "user-1", 3_000);
    auth.emit("TOKEN_REFRESHED");

    await vi.waitFor(() =>
      expect(coordinator.getSnapshot()).toEqual({
        status: "active",
        userId: "user-1",
        expiresAt: 3_000,
      }),
    );
    expect(JSON.parse(localStorage.getItem(coordinator.markerKey) ?? "null")).toEqual({
      version: 1,
      userId: "user-1",
      expiresAt: 3_000,
    });
  });

  it("broadcasts cross-tab marker activation to subscribers", async () => {
    const auth = authenticated("user-1", 2_000);
    const coordinator = createCoordinator(auth);
    const subscriber = vi.fn();
    coordinator.subscribe(subscriber);
    await coordinator.start();
    const marker = serializeAuthRecoveryMarker({
      version: 1,
      userId: "user-1",
      expiresAt: 2_000,
    });
    localStorage.setItem(coordinator.markerKey, marker);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: coordinator.markerKey,
        newValue: marker,
        storageArea: localStorage,
      }),
    );

    await vi.waitFor(() =>
      expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({ status: "active" })),
    );
  });

  it("ignores markers belonging to another configured Supabase project", async () => {
    const auth = authenticated("user-1", 2_000);
    const coordinator = createCoordinator(auth);
    localStorage.setItem(
      "bazoria.auth.recovery.v1:another-project.supabase.co",
      serializeAuthRecoveryMarker({ version: 1, userId: "user-1", expiresAt: 2_000 }),
    );

    await expect(coordinator.start()).resolves.toEqual({ status: "inactive" });
    expect(auth.calls).toEqual([]);
  });

  it("clears recovery state on sign-out", async () => {
    const auth = authenticated("user-1", 2_000);
    const coordinator = createCoordinator(auth);
    await coordinator.start();
    auth.emit("PASSWORD_RECOVERY");
    await vi.waitFor(() => expect(coordinator.getSnapshot().status).toBe("active"));

    auth.emit("SIGNED_OUT", null);

    await vi.waitFor(() => expect(coordinator.getSnapshot()).toEqual({ status: "inactive" }));
    expect(localStorage.getItem(coordinator.markerKey)).toBeNull();
  });

  it("clears a stored marker when an unrelated user signs in", async () => {
    const auth = authenticated("user-1", 2_000);
    const coordinator = createCoordinator(auth);
    await coordinator.start();
    auth.emit("PASSWORD_RECOVERY");
    await vi.waitFor(() => expect(coordinator.getSnapshot().status).toBe("active"));

    setAuthenticated(auth, "user-2", 2_100);
    auth.emit("SIGNED_IN");

    await vi.waitFor(() => expect(coordinator.getSnapshot()).toEqual({ status: "inactive" }));
    expect(localStorage.getItem(coordinator.markerKey)).toBeNull();
  });

  it("invalidates recovery when the marker expires", async () => {
    vi.useFakeTimers();
    let now = 1_000_000;
    const auth = authenticated("user-1", 1_001);
    const coordinator = createCoordinator(auth, () => now);
    await coordinator.start();
    auth.emit("PASSWORD_RECOVERY");
    await vi.runAllTicks();
    await flushQueuedEvents();
    expect(coordinator.getSnapshot().status).toBe("active");

    now = 1_001_000;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(coordinator.getSnapshot()).toEqual({ status: "invalid" });
    expect(localStorage.getItem(coordinator.markerKey)).toBeNull();
  });
});

function authenticated(userId: string, expiresAt: number): FakeAuth {
  const auth = new FakeAuth();
  setAuthenticated(auth, userId, expiresAt);
  return auth;
}

function setAuthenticated(auth: FakeAuth, userId: string, expiresAt: number) {
  auth.user = { id: userId } as User;
  auth.session = {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: expiresAt - 1_000,
    expires_at: expiresAt,
    token_type: "bearer",
    user: auth.user,
  } as Session;
}

function createCoordinator(auth: FakeAuth, now: () => number = () => 1_000_000) {
  const coordinator = new AuthRecoveryCoordinator({
    auth,
    storage: localStorage,
    eventTarget: window,
    supabaseUrl: "https://project.supabase.co",
    now,
  });
  coordinators.push(coordinator);
  return coordinator;
}

async function flushQueuedEvents() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
