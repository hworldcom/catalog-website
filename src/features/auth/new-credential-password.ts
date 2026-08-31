export const NEW_CREDENTIAL_PASSWORD_MINIMUM_LENGTH = 8;
export const NEW_CREDENTIAL_PASSWORD_MAXIMUM_LENGTH = 128;

export type NewCredentialPasswordError =
  "password_too_short" | "password_too_long" | "password_confirmation_mismatch";

export type NewCredentialPasswordValidation =
  { valid: true } | { valid: false; error: NewCredentialPasswordError };

export function validateNewCredentialPassword({
  password,
  confirmation,
}: {
  password: string;
  confirmation: string;
}): NewCredentialPasswordValidation {
  if (password.length < NEW_CREDENTIAL_PASSWORD_MINIMUM_LENGTH) {
    return { valid: false, error: "password_too_short" };
  }
  if (password.length > NEW_CREDENTIAL_PASSWORD_MAXIMUM_LENGTH) {
    return { valid: false, error: "password_too_long" };
  }
  if (password !== confirmation) {
    return { valid: false, error: "password_confirmation_mismatch" };
  }
  return { valid: true };
}
