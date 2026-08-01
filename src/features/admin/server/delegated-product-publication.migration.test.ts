import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260731120000_delegated_product_publication.sql"),
  "utf8",
);

describe("delegated ProductDraft publication migration", () => {
  it("adds durable delegated publication correlation and category enforcement", () => {
    expect(migration).toContain("ADD COLUMN delegated_action_request_id uuid");
    expect(migration).toContain("ADD COLUMN delegated_action_request_fingerprint text");
    expect(migration).toContain("CREATE FUNCTION public.enforce_published_product_category()");
    expect(migration).toContain(
      "CREATE FUNCTION public.enforce_product_image_publication_category()",
    );
    expect(migration).toContain("product_publication_category_required");
  });

  it("scopes description writes and replaces broad service-role entry points", () => {
    expect(migration).toContain(
      "CREATE FUNCTION public.apply_scoped_product_draft_description_patch(",
    );
    expect(migration).toContain("product.seller_id = p_expected_seller_id");
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.apply_product_draft_description_patch(",
    );
    expect(migration).toContain(
      "CREATE FUNCTION public.authorize_product_publication_with_correlation(",
    );
    expect(migration).toContain(
      "CREATE FUNCTION public.retry_product_publication_with_correlation(",
    );
    expect(migration).toContain("authorization_result.result = 'in_progress'");
    expect(migration).toContain("run.delegated_action_request_id = p_delegated_action_request_id");
  });
});
