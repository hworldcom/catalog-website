import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PublicShell } from "@/components/layout/public-shell";
import { ProductCard } from "@/components/product/product-card";
import { t, tr, useLang } from "@/lib/i18n";

import type { PublicAudience } from "../public-audience";
import { getPublicCategoryLabel } from "../public-category-labels";
import { audienceNavigationQueryOptions, marketplaceQueryOptions } from "../queries";

const H = {
  kicker: t(
    "B2B Wholesale Discovery",
    "B2B Odkrywanie hurtu",
    "B2B Großhandel entdecken",
    "Khám phá bán buôn B2B",
  ),
  titleA: t(
    "Find wholesale products",
    "Znajdź produkty hurtowe",
    "Großhandelsprodukte finden",
    "Tìm sản phẩm bán buôn",
  ),
  titleB: t(
    "from real suppliers.",
    "od prawdziwych dostawców.",
    "von echten Lieferanten.",
    "từ nhà cung cấp thật.",
  ),
  lead: t(
    "Bazoria is where retailers, online sellers and market vendors discover wholesale catalogs. Browse products, open a supplier's storefront, and inquire directly — no checkout, no middlemen.",
    "Bazoria to miejsce, gdzie sklepy, sprzedawcy online i handlarze bazarowi odkrywają katalogi hurtowe. Przeglądaj produkty, wejdź do sklepu dostawcy i zapytaj bezpośrednio — bez koszyka, bez pośredników.",
    "Bazoria ist der Ort, an dem Händler, Online-Verkäufer und Marktverkäufer Großhandelskataloge entdecken. Produkte durchsuchen, den Shop eines Lieferanten öffnen und direkt anfragen — kein Checkout, keine Mittelsmänner.",
    "Bazoria là nơi nhà bán lẻ, người bán online và tiểu thương chợ khám phá danh mục bán buôn. Duyệt sản phẩm, mở gian hàng nhà cung cấp và hỏi trực tiếp — không thanh toán, không trung gian.",
  ),
  trendingTitle: t(
    "Trending this week",
    "Popularne w tym tygodniu",
    "Diese Woche im Trend",
    "Xu hướng tuần này",
  ),
  trendingSub: t(
    "Popular with buyers",
    "Popularne wśród kupujących",
    "Beliebt bei Käufern",
    "Được người mua ưa chuộng",
  ),
  trendingEmpty: t(
    "No trending products yet. Check back soon.",
    "Brak popularnych produktów. Zajrzyj później.",
    "Noch keine Trendprodukte. Bald wieder vorbeischauen.",
    "Chưa có sản phẩm xu hướng. Hãy quay lại sau.",
  ),
  suppliersTitle: t(
    "Featured suppliers",
    "Wyróżnieni dostawcy",
    "Ausgewählte Lieferanten",
    "Nhà cung cấp nổi bật",
  ),
  suppliersSub: t(
    "Real catalogs, direct contact",
    "Prawdziwe katalogi, bezpośredni kontakt",
    "Echte Kataloge, direkter Kontakt",
    "Danh mục thật, liên hệ trực tiếp",
  ),
  suppliersEmpty: t(
    "No sellers listed yet.",
    "Brak dostawców.",
    "Noch keine Verkäufer.",
    "Chưa có nhà bán.",
  ),
  verified: t("Verified", "Zweryfikowany", "Verifiziert", "Đã xác minh"),
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
  browseCta: t("Browse products", "Przeglądaj produkty", "Produkte durchsuchen", "Xem sản phẩm"),
  sellerNudge: t(
    "Are you a wholesaler?",
    "Jesteś hurtownikiem?",
    "Sind Sie Großhändler?",
    "Bạn là nhà bán buôn?",
  ),
  listCta: t(
    "List your catalog →",
    "Dodaj swój katalog →",
    "Katalog einstellen →",
    "Đăng danh mục →",
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
  const language = useLang();
  const { data } = useSuspenseQuery(marketplaceQueryOptions(audience));
  const { data: navigation } = useSuspenseQuery(audienceNavigationQueryOptions(audience));
  const catBySeller = new Map(
    navigation.categories.map((category) => [
      category.id,
      getPublicCategoryLabel(category.slug, category.name, language),
    ]),
  );

  return (
    <PublicShell marketplaceAudience={audience}>
      {/* Hero */}
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/10 to-transparent">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <div className="text-xs uppercase tracking-widest text-primary/80">{tr(H.kicker)}</div>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            {tr(H.titleA)}
            <br />
            <span className="text-primary">{tr(H.titleB)}</span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm text-muted-foreground sm:text-base">{tr(H.lead)}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/c/$category"
              params={{ category: "fashion" }}
              search={(previous) => ({ ...previous, audience })}
              className="inline-flex items-center bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {tr(H.browseCta)}
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center border border-primary/60 px-5 py-2.5 text-sm font-medium text-primary hover:bg-primary/10"
            >
              {tr(H.listCta)}
            </Link>
            <span className="text-xs text-muted-foreground">{tr(H.sellerNudge)}</span>
          </div>
        </div>
      </section>

      <Section id="products" title={tr(H.trendingTitle)} subtitle={tr(H.trendingSub)}>
        {data.trending.length === 0 ? (
          <EmptyBox>{tr(H.trendingEmpty)}</EmptyBox>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.trending.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </Section>

      <Section title={tr(H.suppliersTitle)} subtitle={tr(H.suppliersSub)}>
        {data.sellers.length === 0 ? (
          <EmptyBox>{tr(H.suppliersEmpty)}</EmptyBox>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.sellers.map((s) => {
              const categoryName = s.primary_category_id
                ? catBySeller.get(s.primary_category_id)
                : null;
              return (
                <Link
                  key={s.id}
                  to="/s/$sellerSlug"
                  params={{ sellerSlug: s.slug }}
                  className="group overflow-hidden border border-border/60 bg-card/40 transition-colors hover:border-primary/70"
                >
                  <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
                    {s.cover_image_url ? (
                      <img
                        src={s.cover_image_url}
                        alt={s.name}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="font-display text-base font-semibold">{s.name}</div>
                      {s.verified ? (
                        <span className="border border-primary/60 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-primary">
                          {tr(H.verified)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {[s.city, s.country].filter(Boolean).join(", ")}
                      {categoryName ? ` · ${categoryName}` : ""}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Section>

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

function EmptyBox({ children }: { children: ReactNode }) {
  return (
    <div className="border border-dashed border-border/60 bg-card/20 p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
