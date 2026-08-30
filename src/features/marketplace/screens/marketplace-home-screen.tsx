import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PublicShell } from "@/components/layout/public-shell";
import { t, tr } from "@/lib/i18n";

import { MarketplaceCategoryDiscovery } from "../components/marketplace-category-discovery";
import { MarketplaceHomeHero } from "../components/marketplace-home-hero";
import { MarketplaceProductRail } from "../components/marketplace-product-rail";
import { MarketplaceSupplierGrid } from "../components/marketplace-supplier-grid";
import type { PublicAudience } from "../public-audience";
import { audienceNavigationQueryOptions, marketplaceQueryOptions } from "../queries";

const H = {
  howTitle: t("How it works", "Jak to działa", "So funktioniert's", "Cách hoạt động"),
  howSub: t(
    "Three steps, zero fees to browse",
    "Trzy kroki, przeglądanie za darmo",
    "Drei Schritte, kostenloses Stöbern",
    "Ba bước, duyệt miễn phí",
  ),
  step1t: t("Browse", "Przeglądaj", "Stöbern", "Duyệt"),
  step1d: t(
    "Explore catalogs across categories and suppliers.",
    "Przeglądaj katalogi w różnych kategoriach i u dostawców.",
    "Kataloge über Kategorien und Lieferanten hinweg erkunden.",
    "Khám phá danh mục theo phân loại và nhà cung cấp.",
  ),
  step2t: t("Inquire", "Zapytaj", "Anfragen", "Yêu cầu"),
  step2d: t(
    "Send a message or open WhatsApp with the seller directly.",
    "Wyślij wiadomość lub otwórz WhatsApp bezpośrednio ze sprzedawcą.",
    "Nachricht senden oder WhatsApp direkt mit dem Verkäufer öffnen.",
    "Gửi tin nhắn hoặc mở WhatsApp trực tiếp với nhà bán.",
  ),
  step3t: t("Deal", "Umowa", "Abschluss", "Chốt đơn"),
  step3d: t(
    "Negotiate pricing, MOQ and shipping off-platform.",
    "Negocjuj ceny, MOQ i wysyłkę poza platformą.",
    "Preis, MBM und Versand außerhalb der Plattform aushandeln.",
    "Thương lượng giá, SL tối thiểu và vận chuyển ngoài nền tảng.",
  ),
  sellerBannerTitle: t(
    "Sell wholesale on Bazoria",
    "Sprzedawaj hurtowo na Bazoria",
    "Großhandel auf Bazoria verkaufen",
    "Bán buôn trên Bazoria",
  ),
  sellerBannerLead: t(
    "Create a branded catalog, showcase your products, and capture buyer inquiries from retailers and resellers — right from your phone.",
    "Stwórz markowy katalog, pokaż produkty i zbieraj zapytania od sklepów i resellerów — prosto z telefonu.",
    "Erstellen Sie einen Markenkatalog, präsentieren Sie Ihre Produkte und erhalten Sie Käuferanfragen von Händlern und Wiederverkäufern — direkt vom Handy.",
    "Tạo danh mục có thương hiệu, giới thiệu sản phẩm và nhận yêu cầu từ nhà bán lẻ và reseller — ngay trên điện thoại.",
  ),
  sellerBannerCta: t(
    "Create seller account",
    "Utwórz konto sprzedawcy",
    "Verkäuferkonto erstellen",
    "Tạo tài khoản người bán",
  ),
};

export function MarketplaceHomeScreen({ audience }: { audience: PublicAudience }) {
  const { data } = useSuspenseQuery(marketplaceQueryOptions(audience));
  const { data: navigation } = useSuspenseQuery(audienceNavigationQueryOptions(audience));

  return (
    <PublicShell marketplaceAudience={audience}>
      <MarketplaceHomeHero audience={audience} />

      <MarketplaceProductRail audience={audience} products={data.trending} />

      <MarketplaceCategoryDiscovery audience={audience} categories={navigation.categories} />

      <MarketplaceSupplierGrid audience={audience} sellers={data.sellers} />

      <Section title={tr(H.howTitle)} subtitle={tr(H.howSub)}>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["01", tr(H.step1t), tr(H.step1d)],
            ["02", tr(H.step2t), tr(H.step2d)],
            ["03", tr(H.step3t), tr(H.step3d)],
          ].map(([n, title, desc]) => (
            <div key={n} className="border border-border/60 bg-card/30 p-5">
              <div className="font-display text-xs uppercase tracking-widest text-primary/80">
                {n}
              </div>
              <div className="mt-2 font-display text-lg font-semibold">{title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{desc}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Seller CTA banner */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="border border-primary/40 bg-primary/5 p-8 sm:p-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                {tr(H.sellerBannerTitle)}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{tr(H.sellerBannerLead)}</p>
            </div>
            <Link
              to="/auth"
              className="inline-flex items-center bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {tr(H.sellerBannerCta)}
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
          {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
        </div>
      </div>
      {children}
    </section>
  );
}
