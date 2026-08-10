import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260810120000_product_audience_memberships.sql"),
  "utf8",
);
const uatAssignmentMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260810125000_product_audience_uat_assignments.sql"),
  "utf8",
);

describe("product audience membership migration", () => {
  it("stores only canonical audience memberships and rejects duplicates", () => {
    expect(migration).toContain("CREATE TABLE public.product_audience_memberships");
    expect(migration).toContain("PRIMARY KEY (product_id, audience)");
    expect(migration).toContain("CHECK (audience IN ('women', 'men', 'kids'))");
    expect(migration).toContain("REFERENCES public.products(id) ON DELETE CASCADE");
  });

  it("keeps direct mutation and complete-set replacement away from browser roles", () => {
    expect(migration).toContain(
      "ALTER TABLE public.product_audience_memberships ENABLE ROW LEVEL SECURITY",
    );
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.replace_product_audience_memberships(uuid, uuid, text[])",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.replace_product_audience_memberships(uuid, uuid, text[])",
    );
  });

  it("serializes replacement by product and blocks published-product changes", () => {
    const replacement = functionBody("replace_product_audience_memberships");
    expect(replacement).toContain("product.seller_id = p_seller_id");
    expect(replacement).toContain("FOR UPDATE");
    expect(replacement).toContain("selected_product.status = 'published'");
    expect(replacement).toContain("product_audience_moderation_required");
    expect(replacement.indexOf("FOR UPDATE")).toBeLessThan(replacement.indexOf("DELETE FROM"));
  });

  it("requires audiences before code allocation and public-image work", () => {
    const authorization = functionBody("authorize_product_publication_with_correlation");
    expect(authorization).toContain("product_publication_audience_required");
    expect(authorization.indexOf("cardinality(normalized_audiences) = 0")).toBeLessThan(
      authorization.indexOf("authorize_product_publication_with_correlation_0039a_legacy"),
    );
    expect(functionBody("assign_product_code_for_publication")).toContain(
      "product_publication_audience_required",
    );
    expect(functionBody("finalize_seller_product_publication")).toContain(
      "product_audience_memberships",
    );
  });

  it("restores the complete prior set when authorization is not accepted", () => {
    const authorization = functionBody("authorize_product_publication_with_correlation");
    expect(authorization).toContain("previous_audiences");
    expect(authorization).toContain("authorization_result.result <> 'pending'");
    expect(authorization).toContain("FROM unnest(previous_audiences)");
  });

  it("records explicit UAT assignments and still fails preflight for any unassigned product", () => {
    expect(migration).toContain("product_audience_release_preflight_failed");
    expect(migration).not.toContain("SELECT product.id, 'women'");
    expect(migration).not.toContain("SELECT product.id, 'men'");
    expect(migration).not.toContain("SELECT product.id, 'kids'");
    expect(uatAssignmentMigration).toContain(
      "INSERT INTO public.product_audience_memberships (product_id, audience)",
    );
    expect(uatAssignmentMigration).toContain(
      "SELECT public.validate_product_audience_release_preflight();",
    );
    expect(uatAssignmentMigration).toContain("92775a80-b7dc-4953-a9bf-6e865a097c48");
  });
});

function functionBody(name: string): string {
  const create = `CREATE FUNCTION public.${name}(`;
  const replace = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const start = Math.max(migration.indexOf(create), migration.indexOf(replace));
  if (start < 0) throw new Error(`Missing migration function ${name}`);
  const end = migration.indexOf("\n$$;", start);
  if (end < 0) throw new Error(`Unterminated migration function ${name}`);
  return migration.slice(start, end);
}
