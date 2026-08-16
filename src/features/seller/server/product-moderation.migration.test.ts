import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260815120000_initial_product_moderation_submissions.sql",
);
const workingCopyMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260815140000_published_product_moderation_working_copies.sql",
);
const workingCopyImageMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260815141000_published_product_working_copy_images.sql",
);
const workingCopyGenerationMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260815142000_published_product_working_copy_generation.sql",
);
const activationMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260815150000_versioned_product_activation_persistence.sql",
);
const sellerActionsMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260816140000_product_moderation_seller_actions.sql",
);

describe("initial product moderation migration", () => {
  it("creates immutable normalized submissions and product pointers", async () => {
    const migration = await readFile(migrationPath, "utf8");

    for (const table of [
      "product_moderation_working_copies",
      "product_moderation_working_copy_images",
      "product_moderation_submissions",
      "product_moderation_submission_images",
      "product_moderation_events",
    ]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
    }
    expect(migration).toContain("products_active_moderation_submission_fkey");
    expect(migration).toContain("products_approved_moderation_submission_fkey");
    expect(migration).toContain("product_moderation_submission_images_source_fkey");
    expect(migration).toContain("ON DELETE RESTRICT");
    expect(migration).toContain("validate_product_moderation_submission_images");
  });

  it("protects the complete initial draft with one revision and active lock", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("moderation_revision bigint NOT NULL DEFAULT 1");
    expect(migration).toContain("bump_initial_product_moderation_revision");
    expect(migration).toContain("trg_products_05_moderation_scalar");
    expect(migration).toContain("trg_product_draft_descriptions_05_moderation");
    expect(migration).toContain("trg_product_draft_facts_05_moderation");
    expect(migration).toContain("trg_product_audience_memberships_05_moderation");
    expect(migration).toContain("trg_product_draft_images_05_moderation");
    expect(migration).toContain("product_moderation_working_revision_conflict");
  });

  it("exposes only protected service-role read, submit, and withdrawal operations", async () => {
    const migration = await readFile(migrationPath, "utf8");

    for (const operation of [
      "read_initial_product_moderation_state",
      "submit_initial_product_moderation",
      "withdraw_initial_product_moderation",
    ]) {
      expect(migration).toContain(`CREATE FUNCTION public.${operation}`);
      expect(migration).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${operation}\\(`));
    }
    expect(migration).toContain(
      "REVOKE ALL ON public.product_moderation_submissions FROM PUBLIC, anon, authenticated",
    );
  });

  it("discards late generated text after the combined revision changes", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("claimed_moderation_revision bigint");
    expect(migration).toContain(
      "selected_attempt.claimed_moderation_revision IS DISTINCT FROM selected_product.moderation_revision",
    );
    expect(migration).toContain("selected_product.active_moderation_submission_id IS NOT NULL");
    expect(migration).toContain("'input_changed'::text");
  });

  it("routes published edits through a copy-once private working snapshot", async () => {
    const migration = await readFile(workingCopyMigrationPath, "utf8");

    expect(migration).toContain("CREATE FUNCTION public.ensure_product_moderation_working_copy");
    expect(migration).toContain("CREATE FUNCTION public.read_product_moderation_edit_state");
    expect(migration).toContain("CREATE FUNCTION public.submit_product_moderation");
    expect(migration).toContain("CREATE FUNCTION public.withdraw_product_moderation");
    expect(migration).toContain("replay_submission.submission_kind <> 'update'");
    expect(migration).toContain("'update',\n    selected_copy.revision");
    expect(migration).toContain("CREATE TRIGGER trg_products_01_approved_projection");
    expect(migration).toContain("bazoria.product_moderation_activation_ids");
    expect(migration).toContain("product_moderation_product_not_editable");
  });

  it("keeps published image edits private and revision-fenced", async () => {
    const migration = await readFile(workingCopyImageMigrationPath, "utf8");

    expect(migration).toContain(
      "CREATE FUNCTION public.prepare_product_moderation_working_image_uploads",
    );
    expect(migration).toContain("CREATE FUNCTION public.update_product_moderation_working_gallery");
    expect(migration).toContain(
      "CREATE FUNCTION public.begin_product_moderation_working_image_removal",
    );
    expect(migration).toContain("public.assert_product_moderation_working_revision(");
    expect(migration).toContain("CREATE TRIGGER trg_product_draft_images_01_moderation_private");
  });

  it("fences generated text with the working revision and service-only execution", async () => {
    const migration = await readFile(workingCopyGenerationMigrationPath, "utf8");

    expect(migration).toContain(
      "CREATE FUNCTION public.claim_product_moderation_working_description_generation",
    );
    expect(migration).toContain(
      "CREATE FUNCTION public.finalize_product_moderation_working_description_generation",
    );
    expect(migration).toContain("p_expected_revision bigint");
    expect(migration).toContain("claimed_moderation_revision");
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.claim_product_moderation_working_description_generation\(/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.finalize_product_moderation_working_description_generation\(/,
    );
  });

  it("replaces product-scoped publication state with submission-scoped activation", async () => {
    const migration = await readFile(activationMigrationPath, "utf8");

    expect(migration).toContain("moderation_submission_id uuid NOT NULL");
    expect(migration).toContain("product_image_publication_runs_submission_unique");
    expect(migration).toContain("product_image_publication_items_submission_image_fkey");
    expect(migration).toContain("UNIQUE (run_id, destination_key)");
    expect(migration).not.toContain("UNIQUE (destination_key),");
    expect(migration).toContain("snapshot_hash ~ '^[0-9a-f]{64}$'");
  });

  it("persists revision-bound decisions and generation-fenced dispatch", async () => {
    const migration = await readFile(activationMigrationPath, "utf8");

    for (const operation of [
      "decide_product_moderation_submission",
      "record_product_activation_dispatch_result",
      "retry_product_activation_dispatch",
    ]) {
      expect(migration).toContain(`CREATE FUNCTION public.${operation}`);
      expect(migration).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${operation}\\(`));
    }
    expect(migration).toContain("product_activation_dispatch_retries");
    expect(migration).toContain("p_dispatch_generation < selected_run.dispatch_generation");
    expect(migration).toContain("product_activation_dispatch_failed");
    expect(migration).toContain("submission.snapshot_json::text");
  });

  it("exposes deliberate seller actions without making status reads mutate state", async () => {
    const migration = await readFile(sellerActionsMigrationPath, "utf8");

    expect(migration).toContain("CREATE FUNCTION public.begin_product_moderation_editing");
    expect(migration).toContain("CREATE FUNCTION public.read_product_moderation_action_identity");
    expect(migration).toContain("bazoria.product_moderation_restore_ids");
    expect(migration).toContain("restore_seller_product_for_moderation_0040d3a_legacy");
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.begin_product_moderation_editing\(uuid, uuid\)/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.read_product_moderation_action_identity\(/,
    );
  });
});
