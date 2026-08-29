import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { supabase } from "@/lib/supabase/client";
import { MarketplaceNavigation } from "@/features/marketplace/components/marketplace-navigation";
import { marketplaceHomeSearch, type PublicAudience } from "@/features/marketplace/public-audience";
import { LanguageSwitcher, t, tr } from "@/lib/i18n";

import { PublicContainer } from "./public-container";

const S = {
  sellerDashboard: t("Seller dashboard", "Panel sprzedawcy", "Verkäufer-Dashboard", "Bảng nhà bán"),
  signIn: t("Sign in", "Zaloguj się", "Anmelden", "Đăng nhập"),
  footerTagline: t(
    "Wholesale discovery for retailers.",
    "Odkrywanie hurtu dla sklepów.",
    "Großhandelssuche für Händler.",
    "Khám phá bán buôn cho nhà bán lẻ.",
  ),
};

export function PublicShell({
  children,
  marketplaceAudience,
}: {
  children: ReactNode;
  marketplaceAudience?: PublicAudience;
}) {
  return (
    <div className="public-marketplace min-h-screen bg-background text-foreground">
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
    <header className="sticky top-0 z-50 bg-card/95 backdrop-blur">
      <div className="border-b border-border bg-card/95">
        <PublicContainer className="flex min-h-16 items-center justify-between gap-3 py-2">
          <Link
            to="/"
            search={marketplaceHomeSearch}
            aria-label="Bazoria"
            className="flex min-h-11 shrink-0 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <img
              src="/favicon.svg"
              alt=""
              aria-hidden="true"
              width="48"
              height="48"
              className="h-9 w-9 sm:hidden"
            />
            <img
              src="/assets/brand/bazoria-logo.svg"
              alt=""
              aria-hidden="true"
              width="158"
              height="41"
              className="hidden h-9 w-auto max-w-[9.5rem] sm:block"
            />
          </Link>
          <nav className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground sm:gap-4">
            <LanguageSwitcher appearance="publicHeader" />
            {signedIn ? (
              <Link
                to="/seller"
                className="inline-flex min-h-11 shrink-0 items-center border border-foreground bg-foreground px-3 font-medium text-card transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {tr(S.sellerDashboard)}
              </Link>
            ) : signedIn === false ? (
              <Link
                to="/auth"
                className="inline-flex min-h-11 shrink-0 items-center border border-foreground bg-foreground px-3 font-medium text-card transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {tr(S.signIn)}
              </Link>
            ) : null}
          </nav>
        </PublicContainer>
      </div>
      {marketplaceAudience ? <MarketplaceNavigation audience={marketplaceAudience} /> : null}
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-border/60 bg-background">
      <PublicContainer className="flex flex-col gap-2 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          © {new Date().getFullYear()} Bazoria. {tr(S.footerTagline)}
        </div>
      </PublicContainer>
    </footer>
  );
}
