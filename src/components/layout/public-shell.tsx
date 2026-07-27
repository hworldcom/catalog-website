import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { supabase } from "@/lib/supabase/client";
import { LanguageSwitcher, t, tr } from "@/lib/i18n";

const S = {
  home: t("Home", "Strona główna", "Startseite", "Trang chủ"),
  sellerDashboard: t("Seller dashboard", "Panel sprzedawcy", "Verkäufer-Dashboard", "Bảng nhà bán"),
  signIn: t("Sign in", "Zaloguj się", "Anmelden", "Đăng nhập"),
  footerTagline: t(
    "Wholesale discovery for retailers.",
    "Odkrywanie hurtu dla sklepów.",
    "Großhandelssuche für Händler.",
    "Khám phá bán buôn cho nhà bán lẻ.",
  ),
  designPreview: t("Design preview", "Podgląd designu", "Design-Vorschau", "Xem trước thiết kế"),
  sampleStorefront: t("Sample storefront", "Przykładowy sklep", "Beispiel-Shop", "Gian hàng mẫu"),
};

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="storefront-dark min-h-screen bg-background text-foreground">
      <TopNav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}

function TopNav() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setSignedIn(!!data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setSignedIn(!!session);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center border border-primary/50 bg-primary/10 font-display text-sm font-bold text-primary">
            B
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">Bazoria</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link to="/" className="hidden hover:text-foreground sm:inline">
            {tr(S.home)}
          </Link>
          <LanguageSwitcher />
          {signedIn ? (
            <Link
              to="/seller"
              className="border border-border px-3 py-1.5 text-foreground hover:border-primary"
            >
              {tr(S.sellerDashboard)}
            </Link>
          ) : signedIn === false ? (
            <Link
              to="/auth"
              className="border border-border px-3 py-1.5 text-foreground hover:border-primary"
            >
              {tr(S.signIn)}
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-border/60 bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          © {new Date().getFullYear()} Bazoria. {tr(S.footerTagline)}
        </div>
        <div className="flex gap-4">
          <Link to="/demo/marketplace" className="hover:text-foreground">
            {tr(S.designPreview)}
          </Link>
          <Link to="/demo/kesar-textiles" className="hover:text-foreground">
            {tr(S.sampleStorefront)}
          </Link>
        </div>
      </div>
    </footer>
  );
}
