import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260809120000_localized_public_product_descriptions.sql",
  ),
  "utf8",
);

describe("localized public product description migration", () => {
  it("defines a narrowly scoped security-definer function", () => {
    expect(migration).toContain("CREATE FUNCTION public.get_public_product_description(");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(migration).toContain("TO anon, authenticated");
    expect(migration).not.toContain("GRANT SELECT ON public.product_draft_descriptions");
  });

  it("restricts descriptions to published products and sellers", () => {
    expect(migration).toContain("product.status = 'published'");
    expect(migration).toContain("AND seller.published");
    expect(migration).toContain("product.id = p_product_id");
  });

  it("selects only the requested language or English fallback", () => {
    expect(migration).toContain("description.language = p_language");
    expect(migration).toContain("p_language <> 'en'");
    expect(migration).toContain("description.language = 'en'");
    expect(migration).toContain("CASE WHEN description.language = p_language THEN 0 ELSE 1 END");
    expect(migration).toContain("LIMIT 1");
  });

  it("rejects null, blank, uppercase, and unsupported language values", () => {
    expect(migration).toContain("p_language IS NULL");
    expect(migration).toContain("p_language NOT IN ('pl', 'en', 'de', 'vi')");
    expect(migration).toContain("public_product_description_invalid");
  });
});
