import { Link } from "@tanstack/react-router";
import { Globe2, MessageCircle, Store, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { PublicContainer } from "@/components/layout/public-container";
import { hasImageLoadFailed } from "@/lib/image-failure";
import { t, tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import type { PublicAudience } from "../public-audience";

const HERO = {
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
  browseCta: t("Browse products", "Przeglądaj produkty", "Produkte durchsuchen", "Xem sản phẩm"),
  joinCta: t("Join the network", "Dołącz do sieci", "Netzwerk beitreten", "Tham gia mạng lưới"),
  realSuppliers: t(
    "Real suppliers",
    "Prawdziwi dostawcy",
    "Echte Lieferanten",
    "Nhà cung cấp thật",
  ),
  realSuppliersDescription: t(
    "Independent wholesalers with real catalogs.",
    "Niezależni hurtownicy z prawdziwymi katalogami.",
    "Unabhängige Großhändler mit echten Katalogen.",
    "Nhà bán buôn độc lập với danh mục thực tế.",
  ),
  directContact: t(
    "Direct contact",
    "Bezpośredni kontakt",
    "Direkter Kontakt",
    "Liên hệ trực tiếp",
  ),
  directContactDescription: t(
    "Inquire and negotiate with sellers directly.",
    "Pytaj i negocjuj bezpośrednio ze sprzedawcami.",
    "Direkt bei Verkäufern anfragen und verhandeln.",
    "Hỏi và thương lượng trực tiếp với nhà bán.",
  ),
  globalReach: t("Global reach", "Globalny zasięg", "Globale Reichweite", "Tiếp cận toàn cầu"),
  globalReachDescription: t(
    "Discover products across markets.",
    "Odkrywaj produkty na różnych rynkach.",
    "Produkte auf verschiedenen Märkten entdecken.",
    "Khám phá sản phẩm ở nhiều thị trường.",
  ),
};

const TRUST_POINTS: Array<{
  icon: LucideIcon;
  title: (typeof HERO)["realSuppliers"];
  description: (typeof HERO)["realSuppliersDescription"];
}> = [
  {
    icon: Store,
    title: HERO.realSuppliers,
    description: HERO.realSuppliersDescription,
  },
  {
    icon: MessageCircle,
    title: HERO.directContact,
    description: HERO.directContactDescription,
  },
  {
    icon: Globe2,
    title: HERO.globalReach,
    description: HERO.globalReachDescription,
  },
];

type HeroImageProps = {
  className?: string;
  eager?: boolean;
  height: number;
  name: string;
  src: string;
  width: number;
};

function HeroImage({ className, eager = false, height, name, src, width }: HeroImageProps) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={cn("min-w-0 overflow-hidden rounded-md bg-muted", className)}
      data-testid={`hero-image-${name}`}
    >
      {failed ? null : (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          width={width}
          height={height}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : undefined}
          decoding="async"
          className="block h-full w-full max-w-full object-cover"
          ref={(image) => {
            if (hasImageLoadFailed(image)) setFailed(true);
          }}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

export function MarketplaceHomeHero({ audience }: { audience: PublicAudience }) {
  return (
    <section className="border-b border-border/60 bg-secondary/50">
      <PublicContainer className="py-8 sm:py-10 lg:py-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,48fr)_minmax(0,52fr)] lg:grid-rows-[1fr_auto] lg:items-center lg:gap-x-10 lg:gap-y-7">
          <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:self-end">
            <div className="text-xs font-semibold uppercase text-primary">{tr(HERO.kicker)}</div>
            <h1 className="mt-4 break-words font-display text-[2.5rem] font-semibold leading-[1.08] sm:text-5xl lg:text-[2.5rem] xl:text-[3.25rem]">
              {tr(HERO.titleA)} <span className="block text-primary">{tr(HERO.titleB)}</span>
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              {tr(HERO.lead)}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                to="/c/$category"
                params={{ category: "fashion" }}
                search={(previous) => ({ ...previous, audience })}
                className="inline-flex min-h-11 items-center justify-center bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {tr(HERO.browseCta)}
              </Link>
              <Link
                to="/join"
                search={(previous) => ({ ...previous, audience })}
                className="inline-flex min-h-11 items-center justify-center border border-primary px-5 text-sm font-medium text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {tr(HERO.joinCta)}
              </Link>
            </div>
          </div>

          <div
            className="grid h-[280px] min-w-0 grid-cols-2 grid-rows-[42fr_58fr] gap-1.5 sm:h-[360px] sm:gap-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[500px]"
            data-testid="marketplace-hero-collage"
          >
            <HeroImage
              src="/assets/marketplace/hero-clothing-rack.webp"
              name="rack"
              width={1600}
              height={900}
              eager
              className="col-span-2"
            />
            <HeroImage
              src="/assets/marketplace/hero-casual-woman.webp"
              name="woman"
              width={900}
              height={1200}
            />
            <HeroImage
              src="/assets/marketplace/hero-casual-handbag.webp"
              name="handbag"
              width={900}
              height={1200}
            />
          </div>

          <div className="grid min-w-0 grid-cols-3 gap-3 lg:col-start-1 lg:row-start-2 lg:self-start">
            {TRUST_POINTS.map(({ description, icon: Icon, title }) => (
              <div key={title.EN} className="min-w-0">
                <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <div className="mt-3 text-xs font-semibold text-foreground sm:text-sm">
                  {tr(title)}
                </div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground sm:text-xs sm:leading-5">
                  {tr(description)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </PublicContainer>
    </section>
  );
}
