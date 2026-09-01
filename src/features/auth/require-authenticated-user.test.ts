import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  validateCurrentAuthRecovery: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      getUser: mocks.getUser,
    },
  },
}));

vi.mock("./auth-recovery-coordinator", () => ({
  validateCurrentAuthRecovery: mocks.validateCurrentAuthRecovery,
}));

import { requireAuthenticatedUser } from "./require-authenticated-user";

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.getUser.mockReset();
  mocks.validateCurrentAuthRecovery.mockReset();
});

describe("requireAuthenticatedUser", () => {
  it("returns a freshly validated user when recovery is inactive", async () => {
    const user = { id: "user-1" };
    mocks.getSession.mockResolvedValue({ data: { session: { user } }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.validateCurrentAuthRecovery.mockResolvedValue({ status: "inactive" });

    await expect(requireAuthenticatedUser({ href: "/seller/products?lang=PL" })).resolves.toEqual({
      user,
    });
  });

  it("redirects an active recovery session before seller routes load", async () => {
    const user = { id: "user-1" };
    mocks.getSession.mockResolvedValue({ data: { session: { user } }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.validateCurrentAuthRecovery.mockResolvedValue({
      status: "active",
      userId: "user-1",
      expiresAt: 2_000,
    });

    const rejected = await requireAuthenticatedUser({
      href: "/seller/products?lang=PL&status=draft",
    }).catch((error: unknown) => error as Response & { options: Record<string, unknown> });

    expect(rejected).toBeInstanceOf(Response);
    expect(rejected.options).toMatchObject({
      to: "/auth/recovery",
      search: {
        lang: "PL",
        redirect: "/seller/products?lang=PL&status=draft",
      },
    });
  });

  it("rejects an unsafe location as a recovery return target", async () => {
    const user = { id: "user-1" };
    mocks.getSession.mockResolvedValue({ data: { session: { user } }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.validateCurrentAuthRecovery.mockResolvedValue({
      status: "active",
      userId: "user-1",
      expiresAt: 2_000,
    });

    const rejected = await requireAuthenticatedUser({
      href: "https://attacker.example/collect?lang=DE",
    }).catch((error: unknown) => error as Response & { options: Record<string, unknown> });

    expect(rejected.options).toMatchObject({
      search: { lang: "DE", redirect: "/seller" },
    });
  });

  it("does not treat a marker as authentication without a current session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const rejected = await requireAuthenticatedUser({ href: "/seller" }).catch(
      (error: unknown) => error as Response & { options: Record<string, unknown> },
    );

    expect(rejected.options).toMatchObject({ to: "/auth" });
    expect(mocks.validateCurrentAuthRecovery).not.toHaveBeenCalled();
  });

  it("rejects a mismatch between the local session and validated user", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "session-user" } } },
      error: null,
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "validated-user" } },
      error: null,
    });

    const rejected = await requireAuthenticatedUser({ href: "/seller" }).catch(
      (error: unknown) => error as Response & { options: Record<string, unknown> },
    );

    expect(rejected.options).toMatchObject({ to: "/auth" });
    expect(mocks.validateCurrentAuthRecovery).not.toHaveBeenCalled();
  });
});
