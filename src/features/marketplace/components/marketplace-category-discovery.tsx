import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { PublicContainer } from "@/components/layout/public-container";
import { hasImageLoadFailed } from "@/lib/image-failure";
import { t, tr, useLang, type T } from "@/lib/i18n";

import type { PublicClothingCategory } from "../catalog.functions";
import type { PublicAudience } from "../public-audience";
import { getPublicCategoryLabel } from "../public-category-labels";

const C = {
  title: t("Explore categories", "Odkrywaj kategorie", "Kategorien entdecken", "Khám phá danh mục"),
  women: t("Women", "Kobiety", "Damen", "Nữ"),
  men: t("Men", "Mężczyźni", "Herren", "Nam"),
  kids: t("Kids", "Dzieci", "Kinder", "Trẻ em"),
};

const AUDIENCE_TILES: Array<{
  audience: Exclude<PublicAudience, "all">;
  imageSrc: string;
  label: T;
}> = [
  {
    audience: "women",
    imageSrc: "/assets/marketplace/categories/audience-women.webp",
    label: C.women,
  },
  {
    audience: "men",
    imageSrc: "/assets/marketplace/categories/audience-men.webp",
    label: C.men,
  },
  {
    audience: "kids",
    imageSrc: "/assets/marketplace/categories/audience-kids.webp",
    label: C.kids,
  },
];

const CATEGORY_TILES = [
  {
    slug: "dresses",
    imageSrc: "/assets/marketplace/categories/category-dresses.webp",
  },
  {
    slug: "sportswear",
    imageSrc: "/assets/marketplace/categories/category-sportswear.webp",
  },
] as const;

export function MarketplaceCategoryDiscovery({
  audience,
  categories,
}: {
  audience: PublicAudience;
  categories: PublicClothingCategory[];
}) {
  const language = useLang();
  const liveCategories = CATEGORY_TILES.flatMap((approved) => {
    const category = categories.find(({ slug }) => slug === approved.slug);
    return category ? [{ ...approved, category }] : [];
  });

  return (
    <section className="py-12 sm:py-14 lg:py-16">
      <PublicContainer>
        <h2 className="font-display text-2xl font-semibold">{tr(C.title)}</h2>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {AUDIENCE_TILES.map((tile) => {
            const label = tr(tile.label);
            return (
              <Link
                key={tile.audience}
                to="/c/$category"
                params={{ category: "fashion" }}
                search={(previous) => ({ ...previous, audience: tile.audience })}
                aria-label={label}
                className="group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <CategoryTileImage imageSrc={tile.imageSrc} label={label} />
              </Link>
            );
          })}

          {liveCategories.map(({ category, imageSrc }) => {
            const label = getPublicCategoryLabel(category.slug, category.name, language);
            return (
              <Link
                key={category.id}
                to="/c/$category"
                params={{ category: category.slug }}
                search={(previous) => ({ ...previous, audience })}
                aria-label={label}
                className="group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <CategoryTileImage imageSrc={imageSrc} label={label} />
              </Link>
            );
          })}
        </div>
      </PublicContainer>
    </section>
  );
}

function CategoryTileImage({ imageSrc, label }: { imageSrc: string; label: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className="relative aspect-[4/5] min-w-0 overflow-hidden rounded-md bg-muted"
      data-testid={`category-tile-${label}`}
    >
      {!failed ? (
        <img
          src={imageSrc}
          alt=""
          width={1024}
          height={1280}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
          ref={(image) => {
            if (hasImageLoadFailed(image)) setFailed(true);
          }}
          onError={() => setFailed(true)}
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <span className="absolute bottom-0 left-0 right-0 break-words p-3 text-sm font-semibold leading-5 text-white sm:p-4 sm:text-base">
        {label}
      </span>
    </div>
  );
}
