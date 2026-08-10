import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { PublicShell } from "@/components/layout/public-shell";
import { ProductCard } from "@/components/product/product-card";
import { useLang } from "@/lib/i18n";

import type { PublicAudience } from "../public-audience";
import { getPublicCategoryLabel } from "../public-category-labels";
import { categoryQueryOptions } from "../queries";

export function CategoryScreen({
  categorySlug,
  audience,
}: {
  categorySlug: string;
  audience: PublicAudience;
}) {
  const language = useLang();
  const { data } = useSuspenseQuery(categoryQueryOptions(categorySlug, audience));
  if (!data.category) return null;
  const categoryName = getPublicCategoryLabel(data.category.slug, data.category.name, language);
  return (
    <PublicShell marketplaceAudience={audience}>
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/10 to-transparent">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="text-xs uppercase tracking-widest text-primary/80">Category</div>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {categoryName}
          </h1>
          {data.category.tagline ? (
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{data.category.tagline}</p>
          ) : null}
        </div>
      </section>

      {data.sellers.length > 0 ? (
        <section className="mx-auto max-w-6xl px-6 py-10">
          <h2 className="mb-4 font-display text-lg font-semibold">Suppliers</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.sellers.map((s) => (
              <Link
                key={s.id}
                to="/s/$sellerSlug"
                params={{ sellerSlug: s.slug }}
                className="flex items-center gap-3 border border-border/60 bg-card/40 p-3 hover:border-primary/70"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden bg-muted">
                  {s.cover_image_url ? (
                    <img src={s.cover_image_url} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[s.city, s.country].filter(Boolean).join(", ")}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="mb-4 font-display text-lg font-semibold">
          Products ({data.products.length})
        </h2>
        {data.products.length === 0 ? (
          <div className="border border-dashed border-border/60 bg-card/20 p-8 text-center text-sm text-muted-foreground">
            No products in this category yet.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </PublicShell>
  );
}
