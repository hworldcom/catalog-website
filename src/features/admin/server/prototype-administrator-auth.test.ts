import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedSupabaseRequest } from "@/lib/supabase/request-authentication";

import { authenticatePrototypeAdministratorRequest } from "./prototype-administrator-auth";

const administratorId = "00000000-0000-0000-0000-000000000001";
const otherUserId = "00000000-0000-0000-0000-000000000002";
const request = new Request("http://example.test/v1/admin/classifier-batches");

function authenticated(userId: string): AuthenticatedSupabaseRequest {
  return {
    supabase: {} as AuthenticatedSupabaseRequest["supabase"],
    userId,
    claims: { sub: userId },
  };
}

describe("authenticatePrototypeAdministratorRequest", () => {
  it("authenticates before parsing the allowlist", async () => {
    const authenticationError = new Error("authentication failed");
    const authenticate = vi.fn(async () => {
      throw authenticationError;
    });

    await expect(
      authenticatePrototypeAdministratorRequest(request, authenticate, "malformed"),
    ).rejects.toBe(authenticationError);
  });

  it("returns the authenticated administrator context", async () => {
    const authenticate = vi.fn(async () => authenticated(administratorId));

    await expect(
      authenticatePrototypeAdministratorRequest(request, authenticate, administratorId),
    ).resolves.toMatchObject({
      userId: administratorId,
      prototypeAdministrator: true,
    });
  });

  it("rejects an authenticated user outside the allowlist", async () => {
    const authenticate = vi.fn(async () => authenticated(otherUserId));

    await expect(
      authenticatePrototypeAdministratorRequest(request, authenticate, administratorId),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "prototype_administrator_required",
    });
  });
});
