import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260818120000_administrator_moderation_read_models.sql",
);

describe("administrator moderation read-model migration", () => {
  it("selects one mixed limit-plus-one page in a protected database function", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("CREATE FUNCTION public.list_administrator_moderation_requests");
    expect(migration).toContain("UNION ALL");
    expect(migration).toContain(
      "ORDER BY request.submitted_at, request.submission_type, request.submission_id",
    );
    expect(migration).toContain("LIMIT p_limit + 1");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.list_administrator");
  });

  it("provides passive immutable seller and product detail reads", async () => {
    const migration = await readFile(migrationPath, "utf8");

    for (const operation of [
      "read_administrator_seller_moderation_request",
      "read_administrator_product_moderation_request",
    ]) {
      expect(migration).toContain(`CREATE FUNCTION public.${operation}`);
      expect(migration).toMatch(
        new RegExp(`CREATE FUNCTION public\\.${operation}\\([\\s\\S]+?STABLE`),
      );
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${operation}`);
    }
    expect(migration).toContain("administrator_seller_submission_snapshot");
    expect(migration).toContain("administrator_product_submission_images");
    expect(migration).toContain("public.product_activation_error_is_retryable");
  });

  it("keeps helper and read operations unavailable to browser roles", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).not.toContain("TO authenticated");
  });
});
