import { Menu, MessageCircle, X } from "lucide-react";
import { useState } from "react";

import { LanguageSwitcher, t, tr } from "@/lib/i18n";
import type { PublicAudience } from "../public-audience";

import { MarketplaceNavigation } from "./marketplace-navigation";
import { SellerBrand } from "./seller-brand";

const H = {
  subtitle: t("Wholesale storefront", "Sklep hurtowy", "Großhandels-Shop", "Gian hàng bán buôn"),
  categories: t("Categories", "Kategorie", "Kategorien", "Danh mục"),
  catalog: t("Catalog", "Katalog", "Katalog", "Danh mục"),
  about: t("About", "O nas", "Über uns", "Giới thiệu"),
  contact: t("Contact", "Kontakt", "Kontakt", "Liên hệ"),
  whatsapp: t("WhatsApp", "WhatsApp", "WhatsApp", "WhatsApp"),
  openMenu: t("Open menu", "Otwórz menu", "Menü öffnen", "Mở menu"),
  closeMenu: t("Close menu", "Zamknij menu", "Menü schließen", "Đóng menu"),
  nav: t("Storefront navigation", "Nawigacja sklepu", "Shop-Navigation", "Điều hướng gian hàng"),
};

type StorefrontNavItem = {
  href: string;
  label: ReturnType<typeof t>;
};

export function SellerStorefrontHeader({
  sellerName,
  logoUrl,
  whatsappUrl,
  showCategories,
  showAbout,
  audience,
}: {
  sellerName: string;
  logoUrl: string | null;
  whatsappUrl: string | null;
  showCategories: boolean;
  showAbout: boolean;
  audience: PublicAudience;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navItems: StorefrontNavItem[] = [
    ...(showCategories ? [{ href: "#categories", label: H.categories }] : []),
    { href: "#catalog", label: H.catalog },
    ...(showAbout ? [{ href: "#about", label: H.about }] : []),
    { href: "#contact", label: H.contact },
  ];

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <a
          href="#top"
          className="min-w-0 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          aria-label={sellerName}
        >
          <SellerBrand name={sellerName} logoUrl={logoUrl} subtitle={tr(H.subtitle)} />
        </a>

        <nav className="hidden items-center gap-6 lg:flex" aria-label={tr(H.nav)}>
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              {tr(item.label)}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>
          {whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden min-h-10 items-center gap-2 px-2 text-sm font-medium text-primary hover:text-primary/80 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 md:inline-flex"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              {tr(H.whatsapp)}
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="inline-flex h-10 w-10 items-center justify-center border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 lg:hidden"
            aria-expanded={mobileMenuOpen}
            aria-controls="seller-storefront-mobile-menu"
            aria-label={tr(mobileMenuOpen ? H.closeMenu : H.openMenu)}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" aria-hidden />
            ) : (
              <Menu className="h-5 w-5" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div
          id="seller-storefront-mobile-menu"
          className="border-t border-border/60 bg-background px-4 py-4 lg:hidden"
        >
          <nav className="mx-auto flex max-w-7xl flex-col gap-1" aria-label={tr(H.nav)}>
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={closeMenu}
                className="min-h-10 px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {tr(item.label)}
              </a>
            ))}
            {whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                onClick={closeMenu}
                className="inline-flex min-h-10 items-center gap-2 px-2 py-2 text-sm font-medium text-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                {tr(H.whatsapp)}
              </a>
            ) : null}
            <div className="px-2 pt-2 sm:hidden">
              <LanguageSwitcher />
            </div>
          </nav>
        </div>
      ) : null}
      <MarketplaceNavigation audience={audience} />
    </header>
  );
}
