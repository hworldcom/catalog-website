import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260814120000_seller_submission_decision_and_public_enforcement.sql",
);

describe("seller submission, decision, and enforcement migration", () => {
  it("adds seller-owned media references and pending working-copy protection", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("seller_profile_working_copies_logo_asset_fkey");
    expect(migration).toContain("seller_profile_submissions_cover_asset_fkey");
    expect(migration).toContain("enforce_pending_seller_profile_working_copy_lock");
    expect(migration).toContain("seller_approval_submission_conflict");
  });

  it("creates protected idempotent moderation operations", async () => {
    const migration = await readFile(migrationPath, "utf8");

    for (const operation of [
      "submit_seller_profile_working_copy",
      "withdraw_seller_profile_submission",
      "decide_seller_profile_submission",
      "set_seller_storefront_enabled",
    ]) {
      expect(migration).toContain(`CREATE FUNCTION public.${operation}`);
      expect(migration).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${operation}\\(`));
    }
    expect(migration).toContain("pg_catalog.char_length(normalized_reason) > 1000");
  });

  it("enforces effective seller visibility and canonical slug resolution", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("CREATE FUNCTION public.resolve_public_seller_slug");
    expect(migration).toContain('DROP POLICY IF EXISTS "Published products are public"');
    expect(migration).toContain("seller.id = products.seller_id AND seller.published");
    expect(migration).toContain("seller.id = product.seller_id");
    expect(migration).toContain("AND seller.published");
  });

  it("blocks every current product publication boundary for unapproved sellers", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("enforce_approved_seller_product_publication");
    expect(migration).toContain("authorize_seller_product_publication_0040a3_legacy");
    expect(migration).toContain("retry_product_image_publication_0040a3_legacy");
    expect(migration).toContain("finalize_seller_product_publication_0040a3_legacy");
    expect(migration).toContain("seller_approval_required");
  });
});
