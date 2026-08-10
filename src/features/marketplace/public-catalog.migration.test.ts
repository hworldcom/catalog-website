import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260810130000_audience_aware_public_catalog_reads.sql",
  ),
  "utf8",
);

describe("audience-aware public catalog migration", () => {
  it("keeps membership rows private and exposes bounded read functions", () => {
    expect(migration).toContain("CREATE FUNCTION public.list_public_clothing_categories");
    expect(migration).toContain("CREATE FUNCTION public.list_public_audience_sellers");
    expect(migration).toContain("CREATE FUNCTION public.list_public_trending_products");
    expect(migration).toContain("CREATE FUNCTION public.list_public_featured_sellers");
    expect(migration).toContain("CREATE FUNCTION public.list_public_category_products");
    expect(migration).toContain("CREATE FUNCTION public.list_public_category_sellers");
    expect(migration).toContain("CREATE FUNCTION public.list_public_seller_products");
    expect(migration).toContain("TO anon, authenticated, service_role");
    expect(migration).not.toContain("GRANT SELECT ON public.product_audience_memberships");
  });

  it("enforces exact audiences and public product and seller visibility", () => {
    for (const name of [
      "list_public_clothing_categories",
      "list_public_audience_sellers",
      "list_public_trending_products",
      "list_public_featured_sellers",
      "list_public_category_products",
      "list_public_category_sellers",
      "list_public_seller_products",
    ]) {
      const body = functionBody(name);
      expect(body).toContain("membership.audience = normalized_audience");
      expect(body).toContain("product.status = 'published'");
      expect(body).toContain("seller.published");
    }
  });

  it("uses deterministic limits and ordering", () => {
    expect(functionBody("list_public_clothing_categories")).toContain(
      "ORDER BY category.sort_order ASC, category.id ASC",
    );
    expect(functionBody("list_public_audience_sellers")).toContain(
      "ORDER BY lower(seller.name) ASC, seller.id ASC",
    );
    expect(functionBody("list_public_trending_products")).toContain(
      "ORDER BY product.created_at DESC, product.id DESC",
    );
    expect(functionBody("list_public_featured_sellers")).toContain(
      "ORDER BY lower(seller.name) ASC, seller.id ASC",
    );
    expect(functionBody("list_public_category_products")).toContain(
      "ORDER BY product.created_at DESC, product.id DESC",
    );
    expect(functionBody("list_public_seller_products")).toContain(
      "ORDER BY product.created_at DESC, product.id DESC",
    );
    expect(migration).toContain("p_limit > 50");
    expect(migration).toContain("p_limit > 100");
    expect(migration).toContain("p_limit > 48");
  });

  it("supports the Clothing root and configured Fashion leaves only", () => {
    const products = functionBody("list_public_category_products");
    expect(products).toContain("category.slug = 'fashion'");
    expect(products).toContain("product_category.parent_id = fashion.id");
    expect(products).toContain("target.parent_id = fashion.id");
    expect(products).toContain("product_category.product_code_prefix IS NOT NULL");
  });
});

function functionBody(name: string): string {
  const start = migration.indexOf(`CREATE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`Missing migration function ${name}`);
  const end = migration.indexOf("\n$$;", start);
  if (end < 0) throw new Error(`Unterminated migration function ${name}`);
  return migration.slice(start, end);
}
