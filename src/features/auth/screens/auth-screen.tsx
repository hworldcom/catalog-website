import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PublicShell } from "@/components/layout/public-shell";
import { supabase } from "@/lib/supabase/client";
import { t, tr } from "@/lib/i18n";
import { toast } from "sonner";

import { buildAuthCallbackUrl, safeAuthRedirect } from "../auth-redirect";

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
  toastGeneric: t(
    "Something went wrong",
    "Coś poszło nie tak",
    "Etwas ist schiefgelaufen",
    "Đã có lỗi xảy ra",
  ),
  toastGoogle: t(
    "Google sign-in failed",
    "Logowanie Google nie powiodło się",
    "Google-Anmeldung fehlgeschlagen",
    "Đăng nhập Google thất bại",
  ),
};

export function AuthScreen({ redirect }: { redirect?: string }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // If already signed in, bounce out.
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: safeAuthRedirect(redirect), replace: true });
    });
  }, [navigate, redirect]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/seller" },
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
      toast.error(err instanceof Error ? err.message : tr(A.toastGeneric));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: buildAuthCallbackUrl({
            origin: window.location.origin,
            redirect,
          }),
        },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr(A.toastGoogle));
      setBusy(false);
    }
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

        <button
          onClick={handleGoogle}
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

        <form onSubmit={handleEmail} className="flex flex-col gap-3">
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
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-2 bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {mode === "signin" ? tr(A.submitIn) : tr(A.submitUp)}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-muted-foreground">
          {mode === "signin" ? (
            <>
              {tr(A.newHere)}{" "}
              <button className="text-primary hover:underline" onClick={() => setMode("signup")}>
                {tr(A.createOne)}
              </button>
            </>
          ) : (
            <>
              {tr(A.haveOne)}{" "}
              <button className="text-primary hover:underline" onClick={() => setMode("signin")}>
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
