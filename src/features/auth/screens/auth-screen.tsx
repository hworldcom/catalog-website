import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PublicShell } from "@/components/layout/public-shell";
import { getInitializedRuntimePublicConfig } from "@/lib/runtime-public-config";
import { supabase } from "@/lib/supabase/client";
import { t, tr, useLang } from "@/lib/i18n";
import { toast } from "sonner";

import { buildAuthCallbackUrl, safeAuthRedirect } from "../auth-redirect";
import { normalizeAuthenticationError } from "../authentication-error";
import {
  type NewCredentialPasswordError,
  validateNewCredentialPassword,
} from "../new-credential-password";

const A = {
  signIn: t("Sign in", "Zaloguj się", "Anmelden", "Đăng nhập"),
  createAccount: t(
    "Create your seller account",
    "Utwórz konto sprzedawcy",
    "Verkäuferkonto erstellen",
    "Tạo tài khoản người bán",
  ),
  leadSignIn: t(
    "Manage your storefront, products, and buyer inquiries.",
    "Zarządzaj sklepem, produktami i zapytaniami kupujących.",
    "Verwalten Sie Ihren Shop, Produkte und Käuferanfragen.",
    "Quản lý gian hàng, sản phẩm và yêu cầu của khách.",
  ),
  leadSignUp: t(
    "Set up a branded wholesale storefront in minutes.",
    "Uruchom markowy sklep hurtowy w kilka minut.",
    "Richten Sie in Minuten einen Marken-Großhandelsshop ein.",
    "Thiết lập gian hàng bán buôn có thương hiệu trong vài phút.",
  ),
  continueGoogle: t(
    "Continue with Google",
    "Kontynuuj z Google",
    "Mit Google fortfahren",
    "Tiếp tục với Google",
  ),
  or: t("or", "lub", "oder", "hoặc"),
  email: t("Email", "E-mail", "E-Mail", "Email"),
  password: t("Password", "Hasło", "Passwort", "Mật khẩu"),
  passwordConfirmation: t(
    "Confirm password",
    "Potwierdź hasło",
    "Passwort bestätigen",
    "Xác nhận mật khẩu",
  ),
  passwordTooShort: t(
    "Enter at least 8 characters.",
    "Wpisz co najmniej 8 znaków.",
    "Geben Sie mindestens 8 Zeichen ein.",
    "Nhập ít nhất 8 ký tự.",
  ),
  passwordTooLong: t(
    "Enter at most 128 characters.",
    "Wpisz maksymalnie 128 znaków.",
    "Geben Sie höchstens 128 Zeichen ein.",
    "Nhập tối đa 128 ký tự.",
  ),
  passwordConfirmationMismatch: t(
    "Passwords do not match.",
    "Hasła nie są zgodne.",
    "Die Passwörter stimmen nicht überein.",
    "Mật khẩu không khớp.",
  ),
  forgotPassword: t(
    "Forgot password?",
    "Nie pamiętasz hasła?",
    "Passwort vergessen?",
    "Quên mật khẩu?",
  ),
  passwordResetNotice: t(
    "Your password was changed. Sign in with the new password.",
    "Hasło zostało zmienione. Zaloguj się przy użyciu nowego hasła.",
    "Ihr Passwort wurde geändert. Melden Sie sich mit dem neuen Passwort an.",
    "Mật khẩu đã được thay đổi. Hãy đăng nhập bằng mật khẩu mới.",
  ),
  submitIn: t("Sign in", "Zaloguj się", "Anmelden", "Đăng nhập"),
  submitUp: t("Create account", "Utwórz konto", "Konto erstellen", "Tạo tài khoản"),
  newHere: t("New to Bazoria?", "Nowy w Bazoria?", "Neu bei Bazoria?", "Mới đến Bazoria?"),
  createOne: t("Create an account", "Utwórz konto", "Konto erstellen", "Tạo tài khoản"),
  haveOne: t(
    "Already have an account?",
    "Masz już konto?",
    "Bereits ein Konto?",
    "Đã có tài khoản?",
  ),
  back: t(
    "← Back to marketplace",
    "← Wróć do marketplace",
    "← Zurück zum Marktplatz",
    "← Về marketplace",
  ),
  toastCreated: t(
    "Account created. Check your email if confirmation is required.",
    "Konto utworzone. Sprawdź e-mail, jeśli wymagane jest potwierdzenie.",
    "Konto erstellt. Prüfen Sie ggf. Ihre E-Mail zur Bestätigung.",
    "Đã tạo tài khoản. Kiểm tra email nếu cần xác nhận.",
  ),
};

export function AuthScreen({ redirect, notice }: { redirect?: string; notice?: "password-reset" }) {
  const { canonicalSiteOrigin, googleSignInEnabled } = getInitializedRuntimePublicConfig();
  const navigate = useNavigate();
  const lang = useLang();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [passwordError, setPasswordError] = useState<NewCredentialPasswordError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // If already signed in, bounce out.
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: safeAuthRedirect(redirect), replace: true });
    });
  }, [navigate, redirect]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (mode === "signup") {
      const validation = validateNewCredentialPassword({
        password,
        confirmation: passwordConfirmation,
      });
      if (!validation.valid) {
        setPasswordError(validation.error);
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: buildAuthCallbackUrl({ canonicalSiteOrigin, redirect }),
          },
        });
        if (error) throw error;
        toast.success(tr(A.toastCreated));
        // If auto-confirm, session is already set.
        const { data } = await supabase.auth.getUser();
        if (data.user) navigate({ to: safeAuthRedirect(redirect), replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: safeAuthRedirect(redirect), replace: true });
      }
    } catch (err) {
      const normalized = normalizeAuthenticationError(
        mode === "signup" ? "sign_up" : "sign_in",
        err,
      );
      toast.error(tr(normalized.message));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    if (!googleSignInEnabled) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: buildAuthCallbackUrl({
            canonicalSiteOrigin,
            redirect,
          }),
        },
      });
      if (error) throw error;
    } catch (err) {
      const normalized = normalizeAuthenticationError("google_sign_in", err);
      toast.error(tr(normalized.message));
      setBusy(false);
    }
  }

  function changeMode(nextMode: "signin" | "signup") {
    setMode(nextMode);
    setPasswordConfirmation("");
    setPasswordError(null);
  }

  return (
    <PublicShell>
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-display text-3xl font-semibold">
          {mode === "signin" ? tr(A.signIn) : tr(A.createAccount)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "signin" ? tr(A.leadSignIn) : tr(A.leadSignUp)}
        </p>

        {notice === "password-reset" ? (
          <p
            role="status"
            className="mt-5 border border-green-700 bg-green-50 px-4 py-3 text-sm text-green-900"
          >
            {tr(A.passwordResetNotice)}
          </p>
        ) : null}

        <GoogleSignInOption enabled={googleSignInEnabled} busy={busy} onClick={handleGoogle} />

        <form
          onSubmit={handleEmail}
          className={`flex flex-col gap-3 ${googleSignInEnabled ? "" : "mt-6"}`}
        >
          <label className="text-xs uppercase tracking-wide text-muted-foreground">
            {tr(A.email)}
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-border bg-background px-3 py-2 text-sm"
          />
          <label className="text-xs uppercase tracking-wide text-muted-foreground">
            {tr(A.password)}
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordError(null);
            }}
            className="border border-border bg-background px-3 py-2 text-sm"
          />
          {mode === "signup" ? (
            <>
              <label className="text-xs uppercase tracking-wide text-muted-foreground">
                {tr(A.passwordConfirmation)}
              </label>
              <input
                type="password"
                required
                value={passwordConfirmation}
                onChange={(e) => {
                  setPasswordConfirmation(e.target.value);
                  setPasswordError(null);
                }}
                className="border border-border bg-background px-3 py-2 text-sm"
              />
              {passwordError ? (
                <p role="alert" className="text-xs text-destructive">
                  {tr(passwordErrorMessage(passwordError))}
                </p>
              ) : null}
            </>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-2 bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {mode === "signin" ? tr(A.submitIn) : tr(A.submitUp)}
          </button>
          {mode === "signin" ? (
            <Link
              to="/auth/forgot-password"
              search={{ lang, redirect: safeAuthRedirect(redirect) }}
              className="text-center text-xs text-primary hover:underline"
            >
              {tr(A.forgotPassword)}
            </Link>
          ) : null}
        </form>

        <div className="mt-6 text-center text-xs text-muted-foreground">
          {mode === "signin" ? (
            <>
              {tr(A.newHere)}{" "}
              <button className="text-primary hover:underline" onClick={() => changeMode("signup")}>
                {tr(A.createOne)}
              </button>
            </>
          ) : (
            <>
              {tr(A.haveOne)}{" "}
              <button className="text-primary hover:underline" onClick={() => changeMode("signin")}>
                {tr(A.submitIn)}
              </button>
            </>
          )}
        </div>

        <div className="mt-8 text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            {tr(A.back)}
          </Link>
        </div>
      </div>
    </PublicShell>
  );
}

export function GoogleSignInOption({
  enabled,
  busy,
  onClick,
}: {
  enabled: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  if (!enabled) return null;
  return (
    <>
      <button
        onClick={onClick}
        disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-2 border border-border bg-card px-4 py-2.5 text-sm font-medium hover:border-primary disabled:opacity-60"
      >
        {tr(A.continueGoogle)}
      </button>
      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        {tr(A.or)}
        <div className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}

function passwordErrorMessage(error: NewCredentialPasswordError) {
  switch (error) {
    case "password_too_short":
      return A.passwordTooShort;
    case "password_too_long":
      return A.passwordTooLong;
    case "password_confirmation_mismatch":
      return A.passwordConfirmationMismatch;
  }
}
