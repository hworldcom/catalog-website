import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PublicContainer } from "@/components/layout/public-container";
import { ProductCard } from "@/components/product/product-card";
import { Button } from "@/components/ui/button";
import { t, tr } from "@/lib/i18n";

import type { PublicTrendingProduct } from "../catalog.functions";
import type { PublicAudience } from "../public-audience";

const R = {
  title: t(
    "Trending this week",
    "Popularne w tym tygodniu",
    "Diese Woche im Trend",
    "Xu hướng tuần này",
  ),
  subtitle: t(
    "Popular with buyers",
    "Popularne wśród kupujących",
    "Beliebt bei Käufern",
    "Được người mua ưa chuộng",
  ),
  empty: t(
    "No trending products yet. Check back soon.",
    "Brak popularnych produktów. Zajrzyj później.",
    "Noch keine Trendprodukte. Bald wieder vorbeischauen.",
    "Chưa có sản phẩm xu hướng. Hãy quay lại sau.",
  ),
  viewAll: t("View all", "Zobacz wszystkie", "Alle ansehen", "Xem tất cả"),
  previous: t("Previous products", "Poprzednie produkty", "Vorherige Produkte", "Sản phẩm trước"),
  next: t("Next products", "Następne produkty", "Nächste Produkte", "Sản phẩm tiếp theo"),
  rail: t("Trending products", "Popularne produkty", "Trendprodukte", "Sản phẩm xu hướng"),
};

type RailState = {
  canScrollNext: boolean;
  canScrollPrevious: boolean;
  hasOverflow: boolean;
};

const INITIAL_RAIL_STATE: RailState = {
  canScrollNext: false,
  canScrollPrevious: false,
  hasOverflow: false,
};

export function MarketplaceProductRail({
  audience,
  products,
}: {
  audience: PublicAudience;
  products: PublicTrendingProduct[];
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [railState, setRailState] = useState<RailState>(INITIAL_RAIL_STATE);

  const measureRail = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;

    const maximumScroll = Math.max(rail.scrollWidth - rail.clientWidth, 0);
    const hasOverflow = maximumScroll > 1;
    const nextState = {
      hasOverflow,
      canScrollPrevious: hasOverflow && rail.scrollLeft > 1,
      canScrollNext: hasOverflow && rail.scrollLeft < maximumScroll - 1,
    };

    setRailState((current) =>
      current.hasOverflow === nextState.hasOverflow &&
      current.canScrollPrevious === nextState.canScrollPrevious &&
      current.canScrollNext === nextState.canScrollNext
        ? current
        : nextState,
    );
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    measureRail();
    window.addEventListener("resize", measureRail);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measureRail());
    observer?.observe(rail);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureRail);
    };
  }, [measureRail, products.length]);

  const scrollRail = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    rail.scrollBy({
      left: direction * Math.max(rail.clientWidth * 0.9, 1),
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  return (
    <section id="products" className="py-12 sm:py-14 lg:py-16">
      <PublicContainer>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-semibold">{tr(R.title)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tr(R.subtitle)}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/c/$category"
              params={{ category: "fashion" }}
              search={(previous) => ({ ...previous, audience })}
              className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium text-primary transition-colors hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {tr(R.viewAll)}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>

            {railState.hasOverflow ? (
              <div className="flex items-center gap-1" data-testid="product-rail-controls">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 rounded-md bg-card"
                  aria-label={tr(R.previous)}
                  disabled={!railState.canScrollPrevious}
                  onClick={() => scrollRail(-1)}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 rounded-md bg-card"
                  aria-label={tr(R.next)}
                  disabled={!railState.canScrollNext}
                  onClick={() => scrollRail(1)}
                >
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {products.length === 0 ? (
          <div className="border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            {tr(R.empty)}
          </div>
        ) : (
          <div
            ref={railRef}
            role="region"
            aria-label={tr(R.rail)}
            tabIndex={0}
            onScroll={measureRail}
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-scrollbar]:hidden"
          >
            {products.map((product) => (
              <div
                key={product.id}
                className="min-w-0 shrink-0 basis-[calc((100%-0.75rem)/2)] snap-start md:basis-[calc((100%-1.5rem)/3)] lg:basis-[calc((100%-3rem)/5)]"
              >
                <ProductCard appearance="editorial" audience={audience} product={product} />
              </div>
            ))}
          </div>
        )}
      </PublicContainer>
    </section>
  );
}
