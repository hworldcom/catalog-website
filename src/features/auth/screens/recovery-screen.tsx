import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";

import { PublicShell } from "@/components/layout/public-shell";
import { t, tr, type Lang, type T } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";

import {
  clearAuthRecoveryState,
  getAuthRecoverySnapshot,
  subscribeToAuthRecovery,
  validateCurrentAuthRecovery,
} from "../auth-recovery-coordinator";
import { safeAuthRedirect } from "../auth-redirect";
import {
  type NewCredentialPasswordError,
  validateNewCredentialPassword,
} from "../new-credential-password";
import {
  completePasswordRecovery,
  finishPasswordRecoverySignOut,
} from "../password-recovery-operations";

type RecoveryPhase = "editing" | "busy" | "completion_sign_out_failed" | "cancel_sign_out_failed";

const R = {
  title: t(
    "Choose a new password",
    "Wybierz nowe hasło",
    "Neues Passwort wählen",
    "Chọn mật khẩu mới",
  ),
  lead: t(
    "Set a new password for this account. Other Bazoria pages remain unavailable until recovery is completed or cancelled.",
    "Ustaw nowe hasło dla tego konta. Inne strony Bazoria pozostają niedostępne do zakończenia lub anulowania odzyskiwania.",
    "Legen Sie ein neues Passwort für dieses Konto fest. Andere Bazoria-Seiten bleiben gesperrt, bis die Wiederherstellung abgeschlossen oder abgebrochen wurde.",
    "Đặt mật khẩu mới cho tài khoản. Các trang Bazoria khác sẽ không khả dụng cho đến khi hoàn tất hoặc hủy khôi phục.",
  ),
  password: t("New password", "Nowe hasło", "Neues Passwort", "Mật khẩu mới"),
  confirmation: t(
    "Confirm new password",
    "Potwierdź nowe hasło",
    "Neues Passwort bestätigen",
    "Xác nhận mật khẩu mới",
  ),
  save: t("Update password", "Zmień hasło", "Passwort aktualisieren", "Cập nhật mật khẩu"),
  cancel: t(
    "Cancel recovery",
    "Anuluj odzyskiwanie",
    "Wiederherstellung abbrechen",
    "Hủy khôi phục",
  ),
  tooShort: t(
    "Enter at least 8 characters.",
    "Wpisz co najmniej 8 znaków.",
    "Geben Sie mindestens 8 Zeichen ein.",
    "Nhập ít nhất 8 ký tự.",
  ),
  tooLong: t(
    "Enter at most 128 characters.",
    "Wpisz maksymalnie 128 znaków.",
    "Geben Sie höchstens 128 Zeichen ein.",
    "Nhập tối đa 128 ký tự.",
  ),
  mismatch: t(
    "Passwords do not match.",
    "Hasła nie są zgodne.",
    "Die Passwörter stimmen nicht überein.",
    "Mật khẩu không khớp.",
  ),
  updateFailed: t(
    "The password could not be updated. Your recovery session is still active; try again.",
    "Nie udało się zmienić hasła. Sesja odzyskiwania jest nadal aktywna; spróbuj ponownie.",
    "Das Passwort konnte nicht aktualisiert werden. Ihre Wiederherstellungssitzung ist weiterhin aktiv; versuchen Sie es erneut.",
    "Không thể cập nhật mật khẩu. Phiên khôi phục vẫn hoạt động; hãy thử lại.",
  ),
  signOutFailedAfterUpdate: t(
    "Your password was changed, but this browser could not finish signing out. Retry sign-out to complete recovery.",
    "Hasło zostało zmienione, ale przeglądarka nie zakończyła wylogowania. Ponów wylogowanie, aby zakończyć odzyskiwanie.",
    "Ihr Passwort wurde geändert, aber der Browser konnte die Abmeldung nicht abschließen. Versuchen Sie die Abmeldung erneut.",
    "Mật khẩu đã được thay đổi nhưng trình duyệt chưa thể đăng xuất. Hãy thử đăng xuất lại để hoàn tất.",
  ),
  signOutFailedAfterCancel: t(
    "Recovery could not be cancelled because this browser could not sign out. Retry sign-out.",
    "Nie udało się anulować odzyskiwania, ponieważ przeglądarka nie mogła się wylogować. Ponów wylogowanie.",
    "Die Wiederherstellung konnte nicht abgebrochen werden, weil der Browser sich nicht abmelden konnte. Versuchen Sie es erneut.",
    "Không thể hủy khôi phục vì trình duyệt chưa thể đăng xuất. Hãy thử lại.",
  ),
  retrySignOut: t(
    "Retry sign-out",
    "Ponów wylogowanie",
    "Abmeldung erneut versuchen",
    "Thử đăng xuất lại",
  ),
  invalidTitle: t(
    "Recovery link unavailable",
    "Link odzyskiwania jest niedostępny",
    "Wiederherstellungslink nicht verfügbar",
    "Liên kết khôi phục không khả dụng",
  ),
  invalidLead: t(
    "This recovery link is invalid, expired, or already used. Request a new password-reset email.",
    "Ten link jest nieprawidłowy, wygasł lub został już użyty. Poproś o nową wiadomość do resetowania hasła.",
    "Dieser Link ist ungültig, abgelaufen oder wurde bereits verwendet. Fordern Sie eine neue E-Mail zum Zurücksetzen an.",
    "Liên kết không hợp lệ, đã hết hạn hoặc đã được sử dụng. Hãy yêu cầu email đặt lại mật khẩu mới.",
  ),
  requestNew: t(
    "Request a new reset email",
    "Poproś o nową wiadomość",
    "Neue E-Mail anfordern",
    "Yêu cầu email mới",
  ),
};

export function RecoveryScreen({ lang, redirect }: { lang: Lang; redirect?: string }) {
  const navigate = useNavigate();
  const safeRedirect = safeAuthRedirect(redirect);
  const recovery = useSyncExternalStore(subscribeToAuthRecovery, getAuthRecoverySnapshot, () => ({
    status: "inactive" as const,
  }));
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordError, setPasswordError] = useState<NewCredentialPasswordError | null>(null);
  const [operationError, setOperationError] = useState<T | null>(null);
  const [phase, setPhase] = useState<RecoveryPhase>("editing");

  useEffect(() => {
    void validateCurrentAuthRecovery();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateNewCredentialPassword({ password, confirmation });
    if (!validation.valid) {
      setPasswordError(validation.error);
      return;
    }

    setPasswordError(null);
    setOperationError(null);
    setPhase("busy");
    const result = await completePasswordRecovery({
      auth: supabase.auth,
      password,
      clearRecoveryState: clearAuthRecoveryState,
    });
    if (result.status === "update_failed") {
      setOperationError(R.updateFailed);
      setPhase("editing");
      return;
    }
    if (result.status === "sign_out_failed") {
      setPhase("completion_sign_out_failed");
      return;
    }
    await navigateAfterRecovery({ navigate, lang, redirect: safeRedirect, completed: true });
  }

  async function handleCancel() {
    setOperationError(null);
    setPhase("busy");
    const result = await finishPasswordRecoverySignOut({
      auth: supabase.auth,
      clearRecoveryState: clearAuthRecoveryState,
    });
    if (result.status === "sign_out_failed") {
      setPhase("cancel_sign_out_failed");
      return;
    }
    await navigateAfterRecovery({ navigate, lang, redirect: safeRedirect, completed: false });
  }

  async function retrySignOut() {
    const completed = phase === "completion_sign_out_failed";
    setPhase("busy");
    const result = await finishPasswordRecoverySignOut({
      auth: supabase.auth,
      clearRecoveryState: clearAuthRecoveryState,
    });
    if (result.status === "sign_out_failed") {
      setPhase(completed ? "completion_sign_out_failed" : "cancel_sign_out_failed");
      return;
    }
    await navigateAfterRecovery({ navigate, lang, redirect: safeRedirect, completed });
  }

  if (recovery.status !== "active") {
    return (
      <PublicShell>
        <div className="mx-auto max-w-md px-6 py-16">
          <h1 className="font-display text-3xl font-semibold">{tr(R.invalidTitle)}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{tr(R.invalidLead)}</p>
          <Link
            to="/auth/forgot-password"
            search={{ lang, redirect: safeRedirect }}
            className="mt-6 inline-flex bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {tr(R.requestNew)}
          </Link>
        </div>
      </PublicShell>
    );
  }

  const signOutFailure =
    phase === "completion_sign_out_failed" || phase === "cancel_sign_out_failed";

  return (
    <PublicShell>
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-display text-3xl font-semibold">{tr(R.title)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{tr(R.lead)}</p>

        {signOutFailure ? (
          <div className="mt-6 border border-destructive/40 bg-destructive/5 px-4 py-4">
            <p role="alert" className="text-sm text-destructive">
              {tr(
                phase === "completion_sign_out_failed"
                  ? R.signOutFailedAfterUpdate
                  : R.signOutFailedAfterCancel,
              )}
            </p>
            <button
              type="button"
              onClick={retrySignOut}
              className="mt-4 bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {tr(R.retrySignOut)}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              {tr(R.password)}
            </label>
            <input
              type="password"
              autoComplete="new-password"
              required
              disabled={phase === "busy"}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError(null);
              }}
              className="border border-border bg-background px-3 py-2 text-sm"
            />
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              {tr(R.confirmation)}
            </label>
            <input
              type="password"
              autoComplete="new-password"
              required
              disabled={phase === "busy"}
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                setPasswordError(null);
              }}
              className="border border-border bg-background px-3 py-2 text-sm"
            />
            {passwordError ? (
              <p role="alert" className="text-xs text-destructive">
                {tr(passwordValidationMessage(passwordError))}
              </p>
            ) : null}
            {operationError ? (
              <p role="alert" className="text-xs text-destructive">
                {tr(operationError)}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={phase === "busy"}
              className="mt-2 bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {tr(R.save)}
            </button>
            <button
              type="button"
              disabled={phase === "busy"}
              onClick={handleCancel}
              className="border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-60"
            >
              {tr(R.cancel)}
            </button>
          </form>
        )}
      </div>
    </PublicShell>
  );
}

function passwordValidationMessage(error: NewCredentialPasswordError): T {
  switch (error) {
    case "password_too_short":
      return R.tooShort;
    case "password_too_long":
      return R.tooLong;
    case "password_confirmation_mismatch":
      return R.mismatch;
  }
}

async function navigateAfterRecovery({
  navigate,
  lang,
  redirect,
  completed,
}: {
  navigate: ReturnType<typeof useNavigate>;
  lang: Lang;
  redirect: string;
  completed: boolean;
}) {
  await navigate({
    to: "/auth",
    search: completed ? { lang, redirect, notice: "password-reset" as const } : { lang, redirect },
    replace: true,
  });
}
