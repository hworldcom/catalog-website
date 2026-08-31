import { t, type T } from "@/lib/i18n";

export type AuthenticationOperation = "sign_in" | "sign_up" | "google_sign_in";

export interface NormalizedAuthenticationError {
  code:
    | "authentication_sign_in_failed"
    | "authentication_sign_up_failed"
    | "authentication_google_sign_in_failed";
  message: T;
}

const ERRORS: Record<AuthenticationOperation, NormalizedAuthenticationError> = {
  sign_in: {
    code: "authentication_sign_in_failed",
    message: t(
      "Email or password is incorrect.",
      "Adres e-mail lub hasło są nieprawidłowe.",
      "E-Mail-Adresse oder Passwort ist falsch.",
      "Email hoặc mật khẩu không chính xác.",
    ),
  },
  sign_up: {
    code: "authentication_sign_up_failed",
    message: t(
      "Account could not be created. Try again.",
      "Nie udało się utworzyć konta. Spróbuj ponownie.",
      "Das Konto konnte nicht erstellt werden. Versuchen Sie es erneut.",
      "Không thể tạo tài khoản. Vui lòng thử lại.",
    ),
  },
  google_sign_in: {
    code: "authentication_google_sign_in_failed",
    message: t(
      "Google sign-in could not be started. Try again.",
      "Nie udało się rozpocząć logowania przez Google. Spróbuj ponownie.",
      "Die Google-Anmeldung konnte nicht gestartet werden. Versuchen Sie es erneut.",
      "Không thể bắt đầu đăng nhập bằng Google. Vui lòng thử lại.",
    ),
  },
};

export function normalizeAuthenticationError(
  operation: AuthenticationOperation,
  _providerError: unknown,
): NormalizedAuthenticationError {
  return ERRORS[operation];
}
