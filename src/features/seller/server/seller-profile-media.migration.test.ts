import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260811160000_private_seller_profile_media.sql",
);

describe("private seller profile media migration", () => {
  it("creates a private, bounded image bucket", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("'seller-profile-images'");
    expect(migration).toContain("20971520");
    expect(migration).toContain("ARRAY['image/jpeg', 'image/png', 'image/webp']");
    expect(migration).toMatch(/'seller-profile-images',[\s\S]+?false,/);
  });

  it("creates durable ownership, idempotency, and lifecycle constraints", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("CREATE TABLE public.seller_profile_assets");
    expect(migration).toContain("UNIQUE (seller_id, prepare_request_id)");
    expect(migration).toContain("ON CONFLICT (seller_id, prepare_request_id) DO NOTHING");
    expect(migration).toContain("UNIQUE (seller_id, id)");
    expect(migration).toContain(
      "status IN ('pending', 'available', 'deleting', 'failed', 'deleted')",
    );
    expect(migration).toContain("seller_profile_image_cleanup_required");
  });

  it("keeps all mutation and read operations server-only", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain(
      "REVOKE ALL ON public.seller_profile_assets FROM PUBLIC, anon, authenticated",
    );
    for (const operation of [
      "prepare_seller_profile_asset_upload",
      "complete_seller_profile_asset_upload",
      "begin_seller_profile_asset_removal",
      "claim_seller_profile_asset_cleanup_retry",
      "read_public_seller_profile_asset",
    ]) {
      expect(migration).toContain(operation);
    }
  });

  it("validates available seller-owned media in revisioned working-copy saves", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("asset.kind = 'logo'");
    expect(migration).toContain("asset.kind = 'cover'");
    expect(migration).toContain("asset.status = 'available'");
    expect(migration).toContain("seller_profile_image_not_ready");
  });
});
