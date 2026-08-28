import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { supabase } from "@/lib/supabase/client";
import { MarketplaceNavigation } from "@/features/marketplace/components/marketplace-navigation";
import { marketplaceHomeSearch, type PublicAudience } from "@/features/marketplace/public-audience";
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

export function PublicShell({
  children,
  marketplaceAudience,
}: {
  children: ReactNode;
  marketplaceAudience?: PublicAudience;
}) {
  return (
    <div className="storefront-dark min-h-screen bg-background text-foreground">
      <TopNav marketplaceAudience={marketplaceAudience} />
      <main>{children}</main>
      <Footer />
    </div>
  );
}

function TopNav({ marketplaceAudience }: { marketplaceAudience?: PublicAudience }) {
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
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" search={marketplaceHomeSearch} className="flex shrink-0 items-center">
          <img
            src="/assets/brand/bazoria-logo.svg"
            alt="Bazoria"
            width="158"
            height="41"
            className="h-8 w-auto max-w-[8.5rem] sm:h-9 sm:max-w-[9.5rem]"
          />
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link
            to="/"
            search={marketplaceHomeSearch}
            className="hidden hover:text-foreground sm:inline"
          >
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
              className="border border-orange-600 bg-orange-600 px-3 py-1.5 font-medium text-white hover:border-orange-700 hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
            >
              {tr(S.signIn)}
            </Link>
          ) : null}
        </nav>
      </div>
      {marketplaceAudience ? <MarketplaceNavigation audience={marketplaceAudience} /> : null}
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
