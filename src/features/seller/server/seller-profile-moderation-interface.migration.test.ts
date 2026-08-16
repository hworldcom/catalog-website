import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260816120000_seller_profile_moderation_interface.sql",
);

describe("seller profile moderation interface migration", () => {
  it("adds a service-role-only, side-effect-free moderation snapshot", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("CREATE FUNCTION public.read_seller_profile_moderation_snapshot");
    expect(migration).toContain("LANGUAGE sql\nSTABLE");
    expect(migration).toContain("seller.approved_profile_submission_id");
    expect(migration).toContain("ORDER BY submission.revision DESC, submission.id DESC");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.read_seller_profile_moderation_snapshot(uuid)",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.read_seller_profile_moderation_snapshot(uuid)\n  TO service_role",
    );
  });

  it("returns immutable storefront preference receipts", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("result text,\n  storefront_enabled boolean");
    expect(migration).toContain(
      "RETURN QUERY SELECT 'replay'::text, replay_event.storefront_enabled",
    );
    expect(migration).toContain("RETURN QUERY SELECT 'recorded'::text, p_enabled");
  });
});
