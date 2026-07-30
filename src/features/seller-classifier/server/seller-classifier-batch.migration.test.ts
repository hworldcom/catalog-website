import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260727200000_seller_classifier_batch_ownership.sql",
  ),
  "utf8",
);
const createConflictCorrection = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260727203000_fix_seller_classifier_batch_create_conflict.sql",
  ),
  "utf8",
);
const workflowObservationMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260727210000_seller_classifier_upload_processing_observations.sql",
  ),
  "utf8",
);
const reviewObservationMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260727220000_seller_classifier_review_observations.sql",
  ),
  "utf8",
);

describe("seller classifier batch ownership migration", () => {
  it("keeps the ownership table and functions service-role only", () => {
    expect(migration).toContain("CREATE TABLE public.seller_classifier_batches");
    expect(migration).toContain(
      "REVOKE ALL ON public.seller_classifier_batches FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain("GRANT ALL ON public.seller_classifier_batches TO service_role");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("TO service_role");
  });

  it("owns create idempotency and immutable classifier assignment in the database", () => {
    expect(migration).toContain("UNIQUE (seller_id, client_request_id)");
    expect(migration).toContain(
      "CREATE UNIQUE INDEX seller_classifier_batches_classifier_batch_unique",
    );
    expect(functionBody("create_or_get_seller_classifier_batch")).toContain(
      "ON CONFLICT ON CONSTRAINT seller_classifier_batches_seller_request_unique",
    );
    expect(createConflictCorrection).toContain(
      "ON CONFLICT ON CONSTRAINT seller_classifier_batches_seller_request_unique",
    );
    expect(functionBody("enforce_seller_classifier_batch_immutability")).toContain(
      "OLD.classifier_batch_id IS NOT NULL",
    );
  });

  it("makes completion idempotent and prevents late failure from replacing success", () => {
    const completion = functionBody("complete_seller_classifier_batch_provisioning");
    expect(completion).toContain("selected.provisioning_status = 'ready'");
    expect(completion).toContain("selected.classifier_batch_id = p_classifier_batch_id");
    expect(functionBody("fail_seller_classifier_batch_provisioning")).toContain(
      "selected.provisioning_status = 'ready'",
    );
  });

  it("claims only owned retryable failures before another classifier call", () => {
    const retry = functionBody("claim_seller_classifier_batch_provisioning_retry");
    expect(retry).toContain("workflow.seller_id = p_seller_id");
    expect(retry).toContain("FOR UPDATE");
    expect(retry).toContain("selected.retryable = false");
    expect(retry).toContain("selected_result := 'claimed'");
  });

  it("records seller-owned observations without regressing later stages", () => {
    const observation = observationFunctionBody("record_seller_classifier_batch_observation");
    expect(observation).toContain("workflow.seller_id = p_seller_id");
    expect(observation).toContain("FOR UPDATE");
    expect(observation).toContain("incoming_rank < current_rank");
    expect(observation).toContain("selected_result := 'stale'");
    expect(observation).toContain("greatest(");
  });

  it("keeps downstream observation writes service-role only", () => {
    expect(workflowObservationMigration).toContain("seller_classifier_batches_stage_error_check");
    expect(workflowObservationMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(workflowObservationMigration).toContain("TO service_role");
  });

  it("records exact seller-owned review summaries without reopening later states", () => {
    const observation = migrationFunctionBody(
      reviewObservationMigration,
      "record_seller_classifier_review_observation",
    );
    expect(observation).toContain("workflow.seller_id = p_seller_id");
    expect(observation).toContain("FOR UPDATE");
    expect(observation).toContain("group_count = p_group_count");
    expect(observation).toContain("'failed', 'importing', 'drafts_ready'");
    expect(reviewObservationMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(reviewObservationMigration).toContain("TO service_role");
  });
});

function functionBody(name: string): string {
  const start = migration.indexOf(`CREATE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`Missing migration function ${name}`);
  const end = migration.indexOf("\n$$;", start);
  if (end < 0) throw new Error(`Unterminated migration function ${name}`);
  return migration.slice(start, end);
}

function observationFunctionBody(name: string): string {
  const start = workflowObservationMigration.indexOf(`CREATE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`Missing migration function ${name}`);
  const end = workflowObservationMigration.indexOf("\n$$;", start);
  if (end < 0) throw new Error(`Unterminated migration function ${name}`);
  return workflowObservationMigration.slice(start, end);
}

function migrationFunctionBody(migrationSql: string, name: string): string {
  const start = migrationSql.indexOf(`CREATE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`Missing migration function ${name}`);
  const end = migrationSql.indexOf("\n$$;", start);
  if (end < 0) throw new Error(`Unterminated migration function ${name}`);
  return migrationSql.slice(start, end);
}
