import { Link } from "@tanstack/react-router";

import { PublicContainer } from "@/components/layout/public-container";
import { t, tr } from "@/lib/i18n";

const S = {
  title: t(
    "Sell wholesale on Bazoria",
    "Sprzedawaj hurtowo na Bazoria",
    "Großhandel auf Bazoria verkaufen",
    "Bán buôn trên Bazoria",
  ),
  lead: t(
    "Create a branded catalog, showcase your products, and capture buyer inquiries from retailers and resellers — right from your phone.",
    "Stwórz markowy katalog, pokaż produkty i zbieraj zapytania od sklepów i resellerów — prosto z telefonu.",
    "Erstellen Sie einen Markenkatalog, präsentieren Sie Ihre Produkte und erhalten Sie Käuferanfragen von Händlern und Wiederverkäufern — direkt vom Handy.",
    "Tạo danh mục có thương hiệu, giới thiệu sản phẩm và nhận yêu cầu từ nhà bán lẻ và reseller — ngay trên điện thoại.",
  ),
  action: t(
    "Create seller account",
    "Utwórz konto sprzedawcy",
    "Verkäuferkonto erstellen",
    "Tạo tài khoản người bán",
  ),
};

export function MarketplaceSellerCta() {
  return (
    <section className="bg-accent py-12 sm:py-14 lg:py-16" data-testid="marketplace-seller-cta">
      <PublicContainer className="text-center">
        <h2 className="break-words font-display text-2xl font-semibold sm:text-3xl">
          {tr(S.title)}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          {tr(S.lead)}
        </p>
        <Link
          to="/auth"
          search={(previous) => ({ ...previous })}
          className="mt-7 inline-flex min-h-11 max-w-full items-center justify-center rounded-sm bg-primary px-6 py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {tr(S.action)}
        </Link>
      </PublicContainer>
    </section>
  );
}
