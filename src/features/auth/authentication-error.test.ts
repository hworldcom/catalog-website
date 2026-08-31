import { describe, expect, it } from "vitest";

import { normalizeAuthenticationError } from "./authentication-error";

describe("authentication error normalization", () => {
  it.each([
    ["sign_in", "authentication_sign_in_failed", "Email or password is incorrect."],
    ["sign_up", "authentication_sign_up_failed", "Account could not be created. Try again."],
    [
      "google_sign_in",
      "authentication_google_sign_in_failed",
      "Google sign-in could not be started. Try again.",
    ],
  ] as const)("returns Bazoria-owned copy for %s", (operation, code, message) => {
    const providerMessage = "Provider secret response with user@example.com";
    const normalized = normalizeAuthenticationError(operation, {
      code: "provider_error",
      message: providerMessage,
      access_token: "secret-token",
    });

    expect(normalized.code).toBe(code);
    expect(normalized.message.EN).toBe(message);
    expect(JSON.stringify(normalized)).not.toContain(providerMessage);
    expect(JSON.stringify(normalized)).not.toContain("secret-token");
  });
});
