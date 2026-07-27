import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260727120000_durable_product_image_publication.sql",
  ),
  "utf8",
);
const interfaceCorrections = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260727160000_product_publication_interface_corrections.sql",
  ),
  "utf8",
);

describe("durable product image publication migration", () => {
  it("keeps runs, manifests, and public provenance service-role only", () => {
    expect(migration).toContain("CREATE TABLE public.product_image_publication_runs");
    expect(migration).toContain("CREATE TABLE public.product_image_publication_items");
    expect(migration).toContain("ADD COLUMN source_product_draft_image_id uuid");
    expect(migration).toContain("REVOKE UPDATE ON public.products FROM authenticated");
    expect(migration).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.product_images FROM authenticated",
    );
  });

  it("allows workers to claim only pending or expired running runs", () => {
    const claim = functionBody("claim_product_image_publication");
    expect(claim).toContain("run.status = 'pending'");
    expect(claim).toContain("run.status = 'running'");
    expect(claim).not.toContain("run.status = 'failed'");
    expect(claim).not.toContain("run.status = 'cleanup_required'");
  });

  it("uses protected retry and token-fenced final writes", () => {
    expect(functionBody("retry_product_image_publication")).toContain("status = 'pending'");
    expect(functionBody("verify_product_image_publication_item")).toContain(
      "run.attempt_token = p_attempt_token",
    );
    expect(functionBody("finalize_seller_product_publication")).toContain(
      "selected_run.attempt_token IS DISTINCT FROM p_attempt_token",
    );
  });

  it("enforces the completed manifest before an imported product becomes public", () => {
    const guard = functionBody("enforce_product_image_publication");
    expect(guard).toContain("run.status = 'completed'");
    expect(guard).toContain("item.status = 'completed'");
    expect(guard).toContain("image.source_product_draft_image_id");
    expect(guard).toContain("NEW.cover_image_url IS DISTINCT FROM cover_url");
  });

  it("uses immediate order uniqueness and a disjoint temporary range", () => {
    expect(migration).toContain("CONSTRAINT product_images_product_sort_order_unique");
    const finalize = functionBody("finalize_seller_product_publication");
    expect(finalize).toContain("temporary_base := greatest(");
    expect(finalize).toContain("array_position(all_ids, image.id)");
    expect(finalize).toContain("manifest_count + manual_index - 1");
  });

  it("rejects every imported cover patch through the protected seller save", () => {
    const save = functionBody("save_seller_product_with_description");
    expect(save).toContain("imported_product AND COALESCE(p_cover_image_url_patch_present, false)");
    expect(save).toContain("RAISE EXCEPTION 'product_publication_not_allowed'");
  });

  it("provides a token-fenced closure for unexpected claimed-worker failures", () => {
    expect(interfaceCorrections).toContain(
      "CREATE FUNCTION public.fail_claimed_product_image_publication(",
    );
    expect(interfaceCorrections).toContain("run.attempt_token = p_attempt_token");
    expect(interfaceCorrections).toContain("REVOKE ALL ON FUNCTION");
    expect(interfaceCorrections).toContain("GRANT EXECUTE ON FUNCTION");
    expect(interfaceCorrections).toContain("TO service_role");
  });
});

function functionBody(name: string): string {
  const start = migration.indexOf(`CREATE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`Missing migration function ${name}`);
  const end = migration.indexOf("\n$$;", start);
  if (end < 0) throw new Error(`Unterminated migration function ${name}`);
  return migration.slice(start, end);
}
