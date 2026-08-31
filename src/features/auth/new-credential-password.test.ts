import { describe, expect, it } from "vitest";

import {
  NEW_CREDENTIAL_PASSWORD_MAXIMUM_LENGTH,
  NEW_CREDENTIAL_PASSWORD_MINIMUM_LENGTH,
  validateNewCredentialPassword,
} from "./new-credential-password";

describe("new credential password policy", () => {
  it.each([
    ["seven characters", "a".repeat(7), "password_too_short"],
    ["129 characters", "a".repeat(129), "password_too_long"],
    ["different confirmation", "abcdefgh", "password_confirmation_mismatch"],
  ])("rejects %s", (_label, password, expectedError) => {
    const confirmation = expectedError === "password_confirmation_mismatch" ? "abcdefgi" : password;
    expect(validateNewCredentialPassword({ password, confirmation })).toEqual({
      valid: false,
      error: expectedError,
    });
  });

  it.each([NEW_CREDENTIAL_PASSWORD_MINIMUM_LENGTH, NEW_CREDENTIAL_PASSWORD_MAXIMUM_LENGTH])(
    "accepts an exact %i-character boundary",
    (length) => {
      const password = "a".repeat(length);
      expect(validateNewCredentialPassword({ password, confirmation: password })).toEqual({
        valid: true,
      });
    },
  );

  it("does not trim or normalize either value", () => {
    expect(
      validateNewCredentialPassword({ password: " abcdefg", confirmation: " abcdefg" }),
    ).toEqual({ valid: true });
    expect(
      validateNewCredentialPassword({ password: "abcdefgh", confirmation: "abcdefgh " }),
    ).toEqual({ valid: false, error: "password_confirmation_mismatch" });
  });
});
