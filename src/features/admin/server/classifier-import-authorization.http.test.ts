import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SupabaseAuthenticationError } from "@/lib/supabase/request-authentication";

import {
  handleDispatchClassifierImport,
  handleGetClassifierImport,
  handleReconcileClassifierImport,
  handleRetryClassifierImport,
} from "./classifier-import.http";
import { PrototypeAdministratorError } from "./prototype-administrator-access";
import type { PrototypeAdministratorRequestAuthenticator } from "./prototype-administrator-auth";

const importId = "00000000-0000-0000-0000-000000000003";

beforeEach(() => {
  vi.stubEnv("BAZORIA_DEPLOYMENT_ENVIRONMENT", "local");
  vi.stubEnv("BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

type ProtectedOperation = (
  invoked: ReturnType<typeof vi.fn>,
  authenticate: PrototypeAdministratorRequestAuthenticator,
) => Promise<Response>;

const protectedOperations: { name: string; run: ProtectedOperation }[] = [
  {
    name: "status",
    run: (invoked, authenticate) =>
      handleGetClassifierImport(
        request(`/v1/admin/classifier-imports/${importId}`),
        importId,
        {
          getStatus: async () => {
            invoked();
            throw new Error("must not run");
          },
        },
        authenticate,
      ),
  },
  {
    name: "retry",
    run: (invoked, authenticate) =>
      handleRetryClassifierImport(
        request(`/v1/admin/classifier-imports/${importId}/retry`, { method: "POST" }),
        importId,
        {
          retry: async () => {
            invoked();
            throw new Error("must not run");
          },
        },
        authenticate,
      ),
  },
  {
    name: "reconcile",
    run: (invoked, authenticate) =>
      handleReconcileClassifierImport(
        request(`/v1/admin/classifier-imports/${importId}/reconcile`, { method: "POST" }),
        importId,
        {
          reconcile: async () => {
            invoked();
            throw new Error("must not run");
          },
        },
        authenticate,
      ),
  },
  {
    name: "dispatch",
    run: (invoked, authenticate) =>
      handleDispatchClassifierImport(
        request(`/v1/admin/classifier-imports/${importId}/dispatch`, { method: "POST" }),
        importId,
        {
          dispatch: async () => {
            invoked();
            throw new Error("must not run");
          },
        },
        authenticate,
      ),
  },
];

describe("classifier import administrator authorization", () => {
  it.each(protectedOperations)(
    "rejects unauthenticated $name access before creating its runtime",
    async ({ run }) => {
      const invoked = vi.fn();
      const response = await run(invoked, async () => {
        throw new SupabaseAuthenticationError(
          401,
          "authentication_required",
          "Authentication is required.",
        );
      });

      expect(response.status).toBe(401);
      expect(invoked).not.toHaveBeenCalled();
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({
        detail: {
          code: "authentication_required",
          message: "Authentication is required.",
        },
      });
    },
  );

  it.each([
    {
      error: new PrototypeAdministratorError(
        403,
        "prototype_administrator_required",
        "Prototype administrator access is required.",
      ),
      expectedStatus: 403,
      expectedCode: "prototype_administrator_required",
    },
    {
      error: new PrototypeAdministratorError(
        500,
        "prototype_administrator_configuration_invalid",
        "Prototype administrator access is not configured correctly.",
      ),
      expectedStatus: 500,
      expectedCode: "prototype_administrator_configuration_invalid",
    },
    {
      error: new SupabaseAuthenticationError(
        500,
        "authentication_configuration_invalid",
        "Authentication is not configured.",
      ),
      expectedStatus: 500,
      expectedCode: "authentication_configuration_invalid",
    },
  ])("preserves stable $expectedCode errors", async ({ error, expectedStatus, expectedCode }) => {
    const response = await handleGetClassifierImport(
      request(`/v1/admin/classifier-imports/${importId}`),
      importId,
      {
        getStatus: async () => {
          throw new Error("must not run");
        },
      },
      async () => {
        throw error;
      },
    );

    expect(response.status).toBe(expectedStatus);
    await expect(response.json()).resolves.toMatchObject({
      detail: { code: expectedCode },
    });
  });
});

function request(path: string, init?: RequestInit): Request {
  return new Request(`http://example.test${path}`, init);
}
