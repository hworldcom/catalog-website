import { afterEach, describe, expect, it } from "vitest";

import {
  authenticateSupabaseRequest,
  readBearerToken,
  SupabaseAuthenticationError,
} from "./request-authentication";

const CONFIGURATION_AUDIT_ALLOWED_DYNAMIC_ENVIRONMENT_NAMES = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
] as const;

const validToken = "header.payload.signature";
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalPublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

afterEach(() => {
  restoreEnvironment("SUPABASE_URL", originalSupabaseUrl);
  restoreEnvironment("SUPABASE_PUBLISHABLE_KEY", originalPublishableKey);
});

describe("readBearerToken", () => {
  it("returns a well-formed bearer token", () => {
    const request = new Request("http://example.test", {
      headers: { Authorization: `Bearer ${validToken}` },
    });

    expect(readBearerToken(request)).toBe(validToken);
  });

  it.each([
    undefined,
    "",
    "Basic credentials",
    "Bearer",
    "Bearer not-a-jwt",
    `bearer ${validToken}`,
    `Bearer ${validToken} extra`,
  ])("rejects invalid authorization value %j", (value) => {
    const headers = value === undefined ? undefined : { Authorization: value };
    const request = new Request("http://example.test", { headers });

    expect(() => readBearerToken(request)).toThrowError(
      expect.objectContaining({
        statusCode: 401,
        code: "authentication_required",
      }),
    );
  });
});

describe("authenticateSupabaseRequest configuration", () => {
  it("uses a stable typed error when configuration is missing", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    const request = new Request("http://example.test", {
      headers: { Authorization: `Bearer ${validToken}` },
    });

    const error = await authenticateSupabaseRequest(request).catch((caught) => caught);

    expect(error).toBeInstanceOf(SupabaseAuthenticationError);
    expect(error).toMatchObject({
      statusCode: 500,
      code: "authentication_configuration_invalid",
    });
  });

  it("rejects a non-http Supabase URL before token verification", async () => {
    process.env.SUPABASE_URL = "ftp://example.test";
    process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-key";
    const request = new Request("http://example.test", {
      headers: { Authorization: `Bearer ${validToken}` },
    });

    await expect(authenticateSupabaseRequest(request)).rejects.toMatchObject({
      statusCode: 500,
      code: "authentication_configuration_invalid",
    });
  });
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
