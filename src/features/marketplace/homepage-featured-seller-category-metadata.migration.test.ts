import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260829212000_homepage_featured_seller_category_metadata.sql",
  ),
  "utf8",
);

const definition = functionDefinition("list_public_featured_sellers");

describe("homepage featured-seller category metadata migration", () => {
  it("replaces the existing function because its table return type changes", () => {
    expect(migration).toMatch(
      /BEGIN;\s+DROP FUNCTION public\.list_public_featured_sellers\(text, integer\);\s+CREATE FUNCTION public\.list_public_featured_sellers\(/,
    );
    expect(migration).toContain("p_audience text,\n  p_limit integer DEFAULT 6");
    expect(migration.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("preserves existing columns and appends primary-category identity", () => {
    expect(normalizedReturnContract(definition)).toBe(
      [
        "id uuid",
        "slug text",
        "name text",
        "city text",
        "country text",
        "verified boolean",
        "cover_image_url text",
        "logo_url text",
        "primary_category_id uuid",
        "primary_category_slug text",
        "primary_category_name text",
      ].join(", "),
    );
    expect(definition).toContain("LEFT JOIN public.categories AS primary_category");
    expect(definition).toContain("ON primary_category.id = seller.primary_category_id");
    expect(definition).toContain("primary_category.slug,\n    primary_category.name");
  });

  it("preserves public visibility, audience filtering, ordering, and bounds", () => {
    expect(definition).toContain("p_limit > 6");
    expect(definition).toContain("WHERE seller.published");
    expect(definition).toContain("product.status = 'published'");
    expect(definition).toContain("normalized_audience = 'all'");
    expect(definition).toContain("membership.audience = normalized_audience");
    expect(definition).toContain("ORDER BY lower(seller.name) ASC, seller.id ASC");
    expect(definition).toContain("LIMIT p_limit");
  });

  it("keeps the function hardened and restores only the intended grants", () => {
    expect(definition).toContain("STABLE");
    expect(definition).toContain("SECURITY DEFINER");
    expect(definition).toContain("SET search_path = ''");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.list_public_featured_sellers(text, integer)\n  FROM PUBLIC, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.list_public_featured_sellers(text, integer)\n  TO anon, authenticated, service_role;",
    );
  });

  it("does not alter tables or mutate stored catalog records", () => {
    expect(migration).not.toMatch(/\b(?:CREATE|ALTER|DROP) TABLE\b/);
    expect(migration).not.toMatch(/\bINSERT INTO\b/);
    expect(migration).not.toMatch(/\bUPDATE public\./);
    expect(migration).not.toMatch(/\bDELETE FROM\b/);
  });
});

function functionDefinition(name: string): string {
  const start = migration.indexOf(`CREATE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`Missing migration function ${name}`);
  const end = migration.indexOf("\n$$;", start);
  if (end < 0) throw new Error(`Unterminated migration function ${name}`);
  return migration.slice(start, end);
}

function normalizedReturnContract(value: string): string {
  const match = value.match(/RETURNS TABLE \(([^)]+)\)\s+LANGUAGE/s);
  if (!match) throw new Error("Missing table return contract");
  return match[1].replace(/\s+/g, " ").trim();
}
