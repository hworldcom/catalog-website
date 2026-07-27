import { ArrowRight } from "lucide-react";

import { t, tr } from "@/lib/i18n";

import type { StorefrontCategoryGroup } from "../seller-storefront";

const C = {
  title: t("Browse by category", "Przeglądaj kategorie", "Nach Kategorie", "Xem theo danh mục"),
  summaryStart: t("Explore", "Odkryj", "Entdecken Sie", "Khám phá"),
  summaryMiddle: t("categories across", "kategorii obejmujących", "Kategorien mit", "danh mục với"),
  products: t("products", "produktów", "Produkten", "sản phẩm"),
  select: t("View category", "Zobacz kategorię", "Kategorie ansehen", "Xem danh mục"),
};

export function SellerCategoryDiscovery({
  groups,
  selectedCategoryId,
  onSelect,
}: {
  groups: StorefrontCategoryGroup[];
  selectedCategoryId: string | null;
  onSelect: (categoryId: string) => void;
}) {
  const productCount = groups.reduce((total, group) => total + group.products.length, 0);

  return (
    <section
      id="categories"
      className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
      aria-labelledby="storefront-categories-heading"
    >
      <div className="mb-10">
        <h2
          id="storefront-categories-heading"
          className="font-display text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          {tr(C.title)}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {tr(C.summaryStart)} {groups.length} {tr(C.summaryMiddle)} {productCount} {tr(C.products)}
          .
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => {
          const selected = selectedCategoryId === group.category.id;
          return (
            <button
              key={group.category.id}
              type="button"
              onClick={() => onSelect(group.category.id)}
              aria-pressed={selected}
              aria-label={`${tr(C.select)}: ${group.category.name}`}
              className={`group relative overflow-hidden border bg-card text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                selected ? "border-primary" : "border-border/60 hover:border-primary/50"
              }`}
            >
              <span className="block aspect-[4/3] overflow-hidden bg-secondary">
                {group.imageUrl ? (
                  <img
                    src={group.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex h-full w-full items-center justify-center font-display text-7xl font-bold text-primary/20"
                  >
                    {group.category.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
                <span>
                  <span className="block font-display text-xl font-semibold">
                    {group.category.name}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {group.products.length} {tr(C.products)}
                  </span>
                </span>
                <ArrowRight
                  className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:translate-x-1"
                  aria-hidden
                />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
