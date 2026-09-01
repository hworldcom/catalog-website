import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { PublicShell } from "@/components/layout/public-shell";
import { t, tr, type Lang } from "@/lib/i18n";
import { getInitializedRuntimePublicConfig } from "@/lib/runtime-public-config";
import { supabase } from "@/lib/supabase/client";

import { safeAuthRedirect } from "../auth-redirect";
import { requestPasswordReset, type PasswordResetRequestResult } from "../password-recovery";

const F = {
  title: t("Reset your password", "Zresetuj hasło", "Passwort zurücksetzen", "Đặt lại mật khẩu"),
  lead: t(
    "Enter your account email. If the account can receive a reset message, we will send one.",
    "Wpisz adres e-mail konta. Jeśli konto może otrzymać wiadomość resetującą, wyślemy ją.",
    "Geben Sie die E-Mail-Adresse Ihres Kontos ein. Wenn das Konto eine Nachricht zum Zurücksetzen empfangen kann, senden wir eine.",
    "Nhập email tài khoản. Nếu tài khoản có thể nhận thư đặt lại, chúng tôi sẽ gửi thư.",
  ),
  email: t("Email", "E-mail", "E-Mail", "Email"),
  submit: t("Send reset email", "Wyślij e-mail", "E-Mail senden", "Gửi email đặt lại"),
  invalidEmail: t(
    "Enter a valid email address.",
    "Wpisz prawidłowy adres e-mail.",
    "Geben Sie eine gültige E-Mail-Adresse ein.",
    "Nhập địa chỉ email hợp lệ.",
  ),
  accepted: t(
    "If an eligible account matches that address, a password-reset email will arrive shortly.",
    "Jeśli ten adres pasuje do odpowiedniego konta, wiadomość do resetowania hasła pojawi się wkrótce.",
    "Wenn ein berechtigtes Konto zu dieser Adresse gehört, erhalten Sie in Kürze eine E-Mail zum Zurücksetzen des Passworts.",
    "Nếu có tài khoản phù hợp với địa chỉ này, email đặt lại mật khẩu sẽ sớm được gửi đến.",
  ),
  deliveryUnavailable: t(
    "The reset request could not reach the authentication service. Check your connection and try again.",
    "Żądanie resetowania nie dotarło do usługi uwierzytelniania. Sprawdź połączenie i spróbuj ponownie.",
    "Die Anfrage konnte den Authentifizierungsdienst nicht erreichen. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
    "Yêu cầu chưa thể kết nối đến dịch vụ xác thực. Hãy kiểm tra kết nối và thử lại.",
  ),
  back: t("Back to sign in", "Wróć do logowania", "Zurück zur Anmeldung", "Quay lại đăng nhập"),
};

export function ForgotPasswordScreen({ lang, redirect }: { lang: Lang; redirect?: string }) {
  const { canonicalSiteOrigin } = getInitializedRuntimePublicConfig();
  const safeRedirect = safeAuthRedirect(redirect);
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<PasswordResetRequestResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const nextResult = await requestPasswordReset({
      auth: supabase.auth,
      email,
      canonicalSiteOrigin,
      lang,
      redirect: safeRedirect,
    });
    setResult(nextResult);
    setBusy(false);
  }

  return (
    <PublicShell>
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-display text-3xl font-semibold">{tr(F.title)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{tr(F.lead)}</p>

        {result?.status === "accepted" ? (
          <p role="status" className="mt-6 border border-border bg-card px-4 py-4 text-sm">
            {tr(F.accepted)}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              {tr(F.email)}
            </label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setResult(null);
              }}
              className="border border-border bg-background px-3 py-2 text-sm"
            />
            {result?.status === "invalid_email" ? (
              <p role="alert" className="text-xs text-destructive">
                {tr(F.invalidEmail)}
              </p>
            ) : null}
            {result?.status === "delivery_unavailable" ? (
              <p role="alert" className="text-xs text-destructive">
                {tr(F.deliveryUnavailable)}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="mt-2 bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {tr(F.submit)}
            </button>
          </form>
        )}

        <div className="mt-8 text-center">
          <Link
            to="/auth"
            search={{ lang, redirect: safeRedirect }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {tr(F.back)}
          </Link>
        </div>
      </div>
    </PublicShell>
  );
}
