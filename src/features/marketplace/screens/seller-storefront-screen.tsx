import { useSuspenseQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, Mail, MessageCircle, Package, Shapes } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ProductCard } from "@/components/product/product-card";
import { t, tr, useLang } from "@/lib/i18n";

import { InquiryForm } from "../components/inquiry-form";
import { SellerCategoryDiscovery } from "../components/seller-category-discovery";
import {
  FloatingSellerWhatsApp,
  SellerStorefrontFooter,
} from "../components/seller-storefront-footer";
import { SellerStorefrontHeader } from "../components/seller-storefront-header";
import { SellerStorefrontHero } from "../components/seller-storefront-hero";
import { sellerQueryOptions } from "../queries";
import type { PublicAudience } from "../public-audience";
import { getPublicCategoryLabel } from "../public-category-labels";
import {
  buildWhatsAppUrl,
  filterStorefrontProducts,
  getYearsInBusiness,
  groupStorefrontProducts,
  type StorefrontProduct,
} from "../seller-storefront";

const S = {
  catalog: t("Wholesale catalog", "Katalog hurtowy", "Großhandelskatalog", "Danh mục bán buôn"),
  products: t("products", "produktów", "Produkte", "sản phẩm"),
  allProducts: t("All products", "Wszystkie produkty", "Alle Produkte", "Tất cả sản phẩm"),
  clearFilter: t("Show all", "Pokaż wszystkie", "Alle anzeigen", "Hiển thị tất cả"),
  empty: t(
    "This supplier hasn't published products yet.",
    "Ten dostawca nie opublikował jeszcze produktów.",
    "Dieser Lieferant hat noch keine Produkte veröffentlicht.",
    "Nhà cung cấp này chưa đăng sản phẩm.",
  ),
  about: t("About the supplier", "O dostawcy", "Über den Anbieter", "Giới thiệu nhà cung cấp"),
  years: t("Years in business", "Lat działalności", "Jahre im Geschäft", "Năm hoạt động"),
  publishedProducts: t(
    "Published products",
    "Opublikowane produkty",
    "Veröffentlichte Produkte",
    "Sản phẩm đã đăng",
  ),
  categories: t("Categories", "Kategorie", "Kategorien", "Danh mục"),
  inquiryEyebrow: t(
    "Direct inquiry",
    "Bezpośrednie zapytanie",
    "Direkte Anfrage",
    "Yêu cầu trực tiếp",
  ),
  inquiryTitle: t(
    "Tell the supplier what you need",
    "Powiedz dostawcy, czego potrzebujesz",
    "Teilen Sie dem Anbieter Ihren Bedarf mit",
    "Cho nhà cung cấp biết bạn cần gì",
  ),
  inquiryDescription: t(
    "Share quantities, specifications, and delivery destination. Your inquiry goes directly to the supplier.",
    "Podaj ilości, specyfikację i miejsce dostawy. Zapytanie trafi bezpośrednio do dostawcy.",
    "Nennen Sie Mengen, Spezifikationen und Lieferort. Ihre Anfrage geht direkt an den Anbieter.",
    "Chia sẻ số lượng, thông số và nơi giao hàng. Yêu cầu được gửi trực tiếp đến nhà cung cấp.",
  ),
  email: t("Email supplier", "Napisz e-mail", "E-Mail senden", "Gửi email"),
  whatsapp: t(
    "WhatsApp seller",
    "WhatsApp do sprzedawcy",
    "WhatsApp-Verkäufer",
    "WhatsApp nhà bán",
  ),
};

export function SellerStorefrontScreen({
  sellerSlug,
  audience,
}: {
  sellerSlug: string;
  audience: PublicAudience;
}) {
  const language = useLang();
  const { data } = useSuspenseQuery(sellerQueryOptions(sellerSlug, audience));
  const products: StorefrontProduct[] = useMemo(
    () =>
      data.products.map((product) => ({
        ...product,
        category: product.category
          ? {
              ...product.category,
              name: getPublicCategoryLabel(product.category.slug, product.category.name, language),
            }
          : null,
      })),
    [data.products, language],
  );
  const categoryGroups = useMemo(() => groupStorefrontProducts(products), [products]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const catalogHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setSelectedCategoryId(null);
  }, [sellerSlug, audience]);

  const visibleProducts = useMemo(
    () => filterStorefrontProducts(products, selectedCategoryId),
    [products, selectedCategoryId],
  );
  const seller = data.seller;

  if (!seller) return null;

  const location = [seller.city, seller.country].filter(Boolean).join(", ");
  const yearsInBusiness = getYearsInBusiness(seller.established_year);
  const whatsappUrl = buildWhatsAppUrl(seller.whatsapp);
  const selectedCategory =
    categoryGroups.find((group) => group.category.id === selectedCategoryId)?.category ?? null;
  const showAbout = Boolean(seller.about || location || seller.established_year);

  const moveToCatalog = (categoryId: string | null) => {
    setSelectedCategoryId(categoryId);
    window.setTimeout(() => {
      const heading = catalogHeadingRef.current;
      if (!heading) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      heading.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      heading.focus({ preventScroll: true });
    }, 0);
  };

  return (
    <div className="storefront-dark min-h-screen bg-background text-foreground">
      <SellerStorefrontHeader
        sellerName={seller.name}
        logoUrl={seller.logo_url}
        whatsappUrl={whatsappUrl}
        showCategories={categoryGroups.length > 0}
        showAbout={showAbout}
        audience={audience}
      />

      <main>
        <SellerStorefrontHero
          sellerName={seller.name}
          coverImageUrl={seller.cover_image_url}
          verified={seller.verified}
          description={seller.about}
          location={location}
          establishedYear={seller.established_year}
          whatsappUrl={whatsappUrl}
          hasProducts={products.length > 0}
        />

        {categoryGroups.length > 0 ? (
          <SellerCategoryDiscovery
            groups={categoryGroups}
            selectedCategoryId={selectedCategoryId}
            onSelect={moveToCatalog}
          />
        ) : null}

        <section
          id="catalog"
          className="scroll-mt-20 border-y border-border/50 bg-secondary/30"
          aria-labelledby="storefront-catalog-heading"
        >
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
            <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2
                  id="storefront-catalog-heading"
                  ref={catalogHeadingRef}
                  tabIndex={-1}
                  className="scroll-mt-20 font-display text-3xl font-semibold tracking-tight focus:outline-none sm:text-4xl"
                >
                  {tr(S.catalog)}
                </h2>
                <p className="mt-2 text-muted-foreground" aria-live="polite">
                  {selectedCategory?.name ?? tr(S.allProducts)} · {visibleProducts.length}{" "}
                  {tr(S.products)}
                </p>
              </div>
              {selectedCategory ? (
                <button
                  type="button"
                  onClick={() => moveToCatalog(null)}
                  className="inline-flex min-h-10 items-center justify-center self-start border border-border/60 bg-background px-4 py-2 text-sm font-medium hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 sm:self-auto"
                >
                  {tr(S.clearFilter)}
                </button>
              ) : null}
            </div>

            {products.length === 0 ? (
              <div className="border border-dashed border-border/60 bg-card/50 p-8 text-center text-sm text-muted-foreground">
                {tr(S.empty)}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {visibleProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </section>

        {showAbout ? (
          <section
            id="about"
            className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
            aria-labelledby="storefront-about-heading"
          >
            <div className="grid gap-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)] lg:items-start">
              <div>
                <div className="mb-5 inline-flex h-10 w-10 items-center justify-center border border-primary/35 bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" aria-hidden />
                </div>
                <h2
                  id="storefront-about-heading"
                  className="font-display text-3xl font-semibold tracking-tight sm:text-4xl"
                >
                  {tr(S.about)}
                </h2>
                {seller.about ? (
                  <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                    {seller.about}
                  </p>
                ) : null}
                {location ? <p className="mt-4 text-sm text-muted-foreground">{location}</p> : null}
              </div>

              <dl className="grid grid-cols-2 gap-px border border-border/60 bg-border/60">
                {yearsInBusiness !== null ? (
                  <Stat
                    icon={<CalendarDays className="h-5 w-5" aria-hidden />}
                    value={yearsInBusiness}
                    label={tr(S.years)}
                  />
                ) : null}
                <Stat
                  icon={<Package className="h-5 w-5" aria-hidden />}
                  value={products.length}
                  label={tr(S.publishedProducts)}
                />
                {categoryGroups.length > 0 ? (
                  <Stat
                    icon={<Shapes className="h-5 w-5" aria-hidden />}
                    value={categoryGroups.length}
                    label={tr(S.categories)}
                  />
                ) : null}
              </dl>
            </div>
          </section>
        ) : null}

        <section
          id="inquiry"
          className="scroll-mt-20 border-t border-border/50 bg-primary/10"
          aria-labelledby="storefront-inquiry-heading"
        >
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(30rem,1.2fr)] lg:px-8 lg:py-24">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-primary">
                {tr(S.inquiryEyebrow)}
              </p>
              <h2
                id="storefront-inquiry-heading"
                className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                {tr(S.inquiryTitle)}
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
                {tr(S.inquiryDescription)}
              </p>
              {seller.email || whatsappUrl ? (
                <div className="mt-6 flex flex-col items-start gap-3 text-sm">
                  {seller.email ? (
                    <a
                      href={`mailto:${seller.email}`}
                      className="inline-flex min-h-10 items-center gap-2 text-primary hover:text-primary/80 focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <Mail className="h-4 w-4" aria-hidden />
                      {tr(S.email)}
                    </a>
                  ) : null}
                  {whatsappUrl ? (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-10 items-center gap-2 text-primary hover:text-primary/80 focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <MessageCircle className="h-4 w-4" aria-hidden />
                      {tr(S.whatsapp)}
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>

            <InquiryForm sellerId={seller.id} sellerName={seller.name} whatsapp={seller.whatsapp} />
          </div>
        </section>
      </main>

      <SellerStorefrontFooter
        sellerName={seller.name}
        logoUrl={seller.logo_url}
        email={seller.email}
        location={location}
        whatsappUrl={whatsappUrl}
      />
      <FloatingSellerWhatsApp whatsappUrl={whatsappUrl} />
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="bg-card p-5 sm:p-6">
      <dt className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </dt>
      <dd className="mt-3 font-display text-3xl font-bold text-primary">{value}</dd>
    </div>
  );
}
