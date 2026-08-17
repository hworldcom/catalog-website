import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260815151000_all_audiences_public_catalog_reads.sql",
  ),
  "utf8",
);

const audienceAwareFunctions = [
  "list_public_clothing_categories",
  "list_public_audience_sellers",
  "list_public_trending_products",
  "list_public_featured_sellers",
  "list_public_category_products",
  "list_public_category_sellers",
  "list_public_seller_products",
];

describe("all-audiences public catalog migration", () => {
  it("accepts All and uses it as the database fallback", () => {
    const normalizer = functionBody("normalize_public_catalog_audience");

    expect(normalizer).toContain("WHEN 'all' THEN 'all'");
    expect(normalizer).toContain("ELSE 'all'");
  });

  it("keeps every bounded public read audience-aware", () => {
    for (const name of audienceAwareFunctions) {
      const body = functionBody(name);
      expect(body).toContain("normalized_audience := public.normalize_public_catalog_audience");
      expect(body).toContain("normalized_audience = 'all'");
      expect(body).toContain("membership.audience = normalized_audience");
      expect(body).toContain("product.status = 'published'");
      expect(body).toContain("seller.published");
    }
  });

  it("deduplicates product result sets through membership existence checks", () => {
    for (const name of [
      "list_public_trending_products",
      "list_public_category_products",
      "list_public_seller_products",
    ]) {
      const body = functionBody(name);
      expect(body).toContain("EXISTS (");
      expect(body).not.toContain("JOIN public.product_audience_memberships");
    }
  });

  it("preserves public execution grants without exposing memberships", () => {
    for (const name of audienceAwareFunctions) {
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${name}`);
    }
    expect(migration).not.toContain("GRANT SELECT ON public.product_audience_memberships");
  });
});

function functionBody(name: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`Missing migration function ${name}`);
  const end = migration.indexOf("\n$$;", start);
  if (end < 0) throw new Error(`Unterminated migration function ${name}`);
  return migration.slice(start, end);
}
