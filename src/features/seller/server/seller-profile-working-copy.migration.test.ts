import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260811120000_seller_approval_persistence_and_working_copy.sql",
);

describe("seller approval persistence migration", () => {
  it("requires a fresh seller and product dataset", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("seller_moderation_fresh_start_required");
    expect(migration).toMatch(/EXISTS \(SELECT 1 FROM public\.sellers\)/);
    expect(migration).toMatch(/EXISTS \(SELECT 1 FROM public\.products\)/);
  });

  it("creates the revisioned moderation tables and exact submission states", async () => {
    const migration = await readFile(migrationPath, "utf8");

    for (const table of [
      "seller_profile_working_copies",
      "seller_profile_submissions",
      "seller_profile_events",
      "seller_slug_aliases",
    ]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
    }
    expect(migration).toContain(
      "status IN ('pending', 'changes_requested', 'approved', 'rejected', 'withdrawn')",
    );
    expect(migration).toContain("seller_profile_submissions_one_pending_per_seller");
  });

  it("removes browser writes and exposes narrow service-role operations", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.sellers FROM authenticated",
    );
    expect(migration).toContain("read_seller_profile_working_copy");
    expect(migration).toContain("save_seller_profile_working_copy");
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.read_seller_profile_working_copy\(uuid\)\s+TO service_role/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.save_seller_profile_working_copy\([\s\S]+?\) TO service_role/,
    );
  });

  it("maintains the compatibility publication projection in the database", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("maintain_seller_published_projection");
    expect(migration).toContain("NEW.published := NEW.approved_profile_submission_id IS NOT NULL");
    expect(migration).toContain("AND NEW.storefront_enabled");
  });
});
