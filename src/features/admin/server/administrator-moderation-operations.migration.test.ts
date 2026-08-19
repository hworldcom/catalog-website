import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const originalMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260815150000_versioned_product_activation_persistence.sql",
);
const operationsMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260818130000_administrator_moderation_operations.sql",
);

describe("administrator moderation operations migration", () => {
  it("changes only the qualified working-copy increment in the decision function", async () => {
    const [originalMigration, operationsMigration] = await Promise.all([
      readFile(originalMigrationPath, "utf8"),
      readFile(operationsMigrationPath, "utf8"),
    ]);
    const original = functionDefinition(originalMigration, "decide_product_moderation_submission");
    const replacement = functionDefinition(
      operationsMigration,
      "decide_product_moderation_submission",
    ).replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION");

    expect(replacement).toBe(
      original.replace(
        "SET revision = revision + 1, updated_at = now()",
        "SET revision = working_copy.revision + 1, updated_at = now()",
      ),
    );
  });

  it("adds replay-first service-only post-switch cleanup recovery", async () => {
    const migration = await readFile(operationsMigrationPath, "utf8");
    const cleanup = functionDefinition(
      migration,
      "retry_administrator_product_activation_post_switch_cleanup",
    );

    expect(cleanup.indexOf("IF FOUND THEN")).toBeLessThan(
      cleanup.indexOf("selected_run.dispatch_generation <> p_expected_dispatch_generation"),
    );
    expect(cleanup).toContain("selected_run.phase <> 'post_switch_cleanup'");
    expect(cleanup).toContain("replay_request.resulting_phase <> 'post_switch_cleanup'");
    expect(cleanup).toContain("selected_product.active_moderation_submission_id");
    expect(cleanup).toContain("item.status = 'failed'");
    expect(cleanup).toContain("'retry_cleanup'");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.retry_administrator_product_activation_post_switch_cleanup\([\s\S]+?FROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.retry_administrator_product_activation_post_switch_cleanup\([\s\S]+?TO service_role;/,
    );
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.retry_administrator_product_activation_post_switch_cleanup\([\s\S]+?TO authenticated;/,
    );
  });
});

function functionDefinition(migration: string, name: string): string {
  const match = migration.match(
    new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]+?\\n\\$\\$;`),
  );
  if (!match) throw new Error(`Missing ${name} function definition.`);
  return match[0];
}
