import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { PublicContainer } from "@/components/layout/public-container";
import { t, tr, useLang } from "@/lib/i18n";

import type { PublicFeaturedSeller } from "../catalog.functions";
import type { PublicAudience } from "../public-audience";
import { getPublicCategoryLabel } from "../public-category-labels";

const S = {
  title: t(
    "Featured suppliers",
    "Wyróżnieni dostawcy",
    "Ausgewählte Lieferanten",
    "Nhà cung cấp nổi bật",
  ),
  subtitle: t(
    "Real catalogs, direct contact",
    "Prawdziwe katalogi, bezpośredni kontakt",
    "Echte Kataloge, direkter Kontakt",
    "Danh mục thật, liên hệ trực tiếp",
  ),
  empty: t(
    "No sellers listed yet.",
    "Brak dostawców.",
    "Noch keine Verkäufer.",
    "Chưa có nhà bán.",
  ),
  verified: t("Verified", "Zweryfikowany", "Verifiziert", "Đã xác minh"),
};

export function MarketplaceSupplierGrid({
  audience,
  sellers,
}: {
  audience: PublicAudience;
  sellers: PublicFeaturedSeller[];
}) {
  const language = useLang();

  return (
    <section className="py-12 sm:py-14 lg:py-16">
      <PublicContainer>
        <h2 className="font-display text-2xl font-semibold">{tr(S.title)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{tr(S.subtitle)}</p>

        {sellers.length === 0 ? (
          <div className="mt-6 border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            {tr(S.empty)}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sellers.map((seller) => {
              const location = joinPresentValues(seller.city, seller.country);
              const category =
                seller.primary_category_slug && seller.primary_category_name
                  ? getPublicCategoryLabel(
                      seller.primary_category_slug,
                      seller.primary_category_name,
                      language,
                    )
                  : null;

              return (
                <Link
                  key={seller.id}
                  to="/s/$sellerSlug"
                  params={{ sellerSlug: seller.slug }}
                  search={(previous) => ({ ...previous, audience })}
                  aria-label={seller.name}
                  className="group min-w-0 overflow-hidden rounded-md border border-border/60 bg-card transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <SupplierMedia seller={seller} />
                  <div className="p-4">
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="line-clamp-1 min-w-0 flex-1 font-display text-lg font-semibold">
                        {seller.name}
                      </div>
                      {seller.verified ? (
                        <span className="shrink-0 rounded-sm border border-primary/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                          {tr(S.verified)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">
                      {location ? <div className="line-clamp-1">{location}</div> : null}
                      {category ? <div className="line-clamp-1">{category}</div> : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </PublicContainer>
    </section>
  );
}

function SupplierMedia({ seller }: { seller: PublicFeaturedSeller }) {
  const [media, setMedia] = useState<"cover" | "logo" | "empty">(
    seller.cover_image_url ? "cover" : seller.logo_url ? "logo" : "empty",
  );

  return (
    <div
      className="flex aspect-video w-full items-center justify-center overflow-hidden bg-muted"
      data-testid={`supplier-media-${seller.slug}`}
      data-media={media}
    >
      {media === "cover" ? (
        <img
          src={seller.cover_image_url}
          alt=""
          width={640}
          height={360}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
          onError={() => setMedia(seller.logo_url ? "logo" : "empty")}
        />
      ) : null}
      {media === "logo" ? (
        <img
          src={seller.logo_url}
          alt=""
          width={160}
          height={160}
          loading="lazy"
          decoding="async"
          className="max-h-[56%] max-w-[56%] object-contain"
          onError={() => setMedia("empty")}
        />
      ) : null}
    </div>
  );
}

function joinPresentValues(...values: Array<string | null | undefined>): string {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ");
}
