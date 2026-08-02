import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type {
  ClassifierImportRepository,
  CreateImportRunInput,
  CreateImportRunResult,
  PreparedImportGroup,
  ReconcileImportResult,
  RetryImportResult,
} from "./classifier-import.repository";
import type {
  ApprovedGroup,
  ClassifierImportGroupOutcome,
  ClassifierImportRun,
} from "./classifier-import.types";

type AdminClient = SupabaseClient<Database>;

function throwDatabaseError(error: { message: string }): never {
  throw new Error(`Classifier import database operation failed: ${error.message}`);
}

export class SupabaseClassifierImportRepository implements ClassifierImportRepository {
  constructor(private readonly database: AdminClient) {}

  async getRunBySource(
    classifierOrganizationId: string,
    classifierBatchId: string,
  ): Promise<ClassifierImportRun | null> {
    const result = await this.database
      .from("classifier_import_runs")
      .select("*")
      .eq("classifier_organization_id", classifierOrganizationId)
      .eq("classifier_batch_id", classifierBatchId)
      .maybeSingle();
    if (result.error) throwDatabaseError(result.error);
    return result.data;
  }

  async createOrGetRun(input: CreateImportRunInput): Promise<CreateImportRunResult> {
    const inserted = await this.database
      .from("classifier_import_runs")
      .insert({
        classifier_organization_id: input.classifierOrganizationId,
        classifier_batch_id: input.classifierBatchId,
        seller_id: input.sellerId,
        requested_by_user_id: input.requestedByUserId,
      })
      .select("*")
      .maybeSingle();

    if (!inserted.error && inserted.data) {
      return { run: inserted.data, created: true };
    }
    if (inserted.error && inserted.error.code !== "23505") {
      throwDatabaseError(inserted.error);
    }

    const existing = await this.database
      .from("classifier_import_runs")
      .select("*")
      .eq("classifier_organization_id", input.classifierOrganizationId)
      .eq("classifier_batch_id", input.classifierBatchId)
      .maybeSingle();
    if (existing.error) throwDatabaseError(existing.error);
    if (!existing.data) {
      throw new Error("Concurrent classifier import was not visible after uniqueness conflict.");
    }
    return { run: existing.data, created: false };
  }

  async getRun(importId: string): Promise<ClassifierImportRun | null> {
    const result = await this.database
      .from("classifier_import_runs")
      .select("*")
      .eq("id", importId)
      .maybeSingle();
    if (result.error) throwDatabaseError(result.error);
    return result.data;
  }

  async getSellerName(sellerId: string): Promise<string | null> {
    const result = await this.database
      .from("sellers")
      .select("name")
      .eq("id", sellerId)
      .maybeSingle();
    if (result.error) throwDatabaseError(result.error);
    return result.data?.name ?? null;
  }

  async getEligibleSeller(sellerId: string) {
    const result = await this.database
      .from("sellers")
      .select("id,name")
      .eq("id", sellerId)
      .eq("published", true)
      .maybeSingle();
    if (result.error) throwDatabaseError(result.error);
    if (!result.data || result.data.name.trim().length === 0) return null;
    return result.data;
  }

  async listRunsForBatches(
    classifierOrganizationId: string,
    classifierBatchIds: string[],
  ): Promise<ClassifierImportRun[]> {
    if (classifierBatchIds.length === 0) return [];
    const result = await this.database
      .from("classifier_import_runs")
      .select("*")
      .eq("classifier_organization_id", classifierOrganizationId)
      .in("classifier_batch_id", classifierBatchIds)
      .order("created_at")
      .order("id");
    if (result.error) throwDatabaseError(result.error);
    return result.data ?? [];
  }

  async getSellerNames(sellerIds: string[]): Promise<Map<string, string>> {
    if (sellerIds.length === 0) return new Map();
    const result = await this.database.from("sellers").select("id,name").in("id", sellerIds);
    if (result.error) throwDatabaseError(result.error);
    return new Map((result.data ?? []).map((seller) => [seller.id, seller.name]));
  }

  async listGroupOutcomes(importId: string): Promise<ClassifierImportGroupOutcome[]> {
    const result = await this.database
      .from("classifier_import_group_outcomes")
      .select("*")
      .eq("classifier_import_run_id", importId)
      .order("created_at")
      .order("classifier_group_id");
    if (result.error) throwDatabaseError(result.error);
    return result.data ?? [];
  }

  async retryImport(importId: string, includeNonRetryable: boolean): Promise<RetryImportResult> {
    const result = await this.database.rpc("retry_classifier_import", {
      p_import_id: importId,
      p_include_non_retryable: includeNonRetryable,
    });
    if (result.error) throwDatabaseError(result.error);
    return parseActionResult<RetryImportResult>(result.data, [
      "requeued",
      "noop",
      "not_found",
      "not_allowed",
    ]);
  }

  async reconcileImport(importId: string): Promise<ReconcileImportResult> {
    const result = await this.database.rpc("reconcile_classifier_import", {
      p_import_id: importId,
    });
    if (result.error) throwDatabaseError(result.error);
    return parseActionResult<ReconcileImportResult>(result.data, [
      "requeued",
      "not_found",
      "not_allowed",
    ]);
  }

  async claimNextRun(leaseTimeoutSeconds: number): Promise<ClassifierImportRun | null> {
    const result = await this.database.rpc("claim_next_classifier_import_run", {
      p_lease_timeout_seconds: leaseTimeoutSeconds,
    });
    if (result.error) throwDatabaseError(result.error);
    return result.data?.[0] ?? null;
  }

  async claimRun(
    importId: string,
    leaseTimeoutSeconds: number,
  ): Promise<ClassifierImportRun | null> {
    const result = await this.database.rpc("claim_classifier_import_run", {
      p_import_id: importId,
      p_lease_timeout_seconds: leaseTimeoutSeconds,
    });
    if (result.error) throwDatabaseError(result.error);
    return result.data?.[0] ?? null;
  }

  async heartbeat(importId: string, attemptToken: string): Promise<boolean> {
    const result = await this.database.rpc("heartbeat_classifier_import_run", {
      p_import_id: importId,
      p_attempt_token: attemptToken,
    });
    if (result.error) throwDatabaseError(result.error);
    return result.data;
  }

  async setPipelineVersion(
    importId: string,
    attemptToken: string,
    pipelineVersion: string,
  ): Promise<boolean> {
    const result = await this.database.rpc("set_classifier_import_pipeline_version", {
      p_import_id: importId,
      p_attempt_token: attemptToken,
      p_pipeline_version: pipelineVersion,
    });
    if (result.error) throwDatabaseError(result.error);
    return result.data;
  }

  async isRunSellerEligible(run: ClassifierImportRun): Promise<boolean> {
    if (!run.seller_classifier_workflow_id) {
      return (await this.getEligibleSeller(run.seller_id)) !== null;
    }

    const result = await this.database
      .from("sellers")
      .select("id")
      .eq("id", run.seller_id)
      .maybeSingle();
    if (result.error) throwDatabaseError(result.error);
    return result.data !== null;
  }

  async prepareGroup(
    importId: string,
    attemptToken: string,
    group: ApprovedGroup,
    sourceGroupPosition: number,
  ): Promise<PreparedImportGroup> {
    const response = await this.database.rpc("prepare_classifier_import_group_at_position", {
      p_import_id: importId,
      p_attempt_token: attemptToken,
      p_classifier_group_id: group.groupId,
      p_approved_category_slug: group.approvedCategorySlug,
      p_source_cover_classifier_image_id: group.coverImageId,
      p_source_group_position: sourceGroupPosition,
    });
    if (response.error) throwDatabaseError(response.error);
    const row = response.data?.[0];
    if (!row) throw new Error("Classifier import group preparation returned no result.");

    if (row.result === "prepared") {
      if (!row.product_draft_id) {
        throw new Error("Prepared classifier import group has no ProductDraft.");
      }
      return { result: "prepared", productDraftId: row.product_draft_id };
    }
    if (
      row.result === "category_not_mapped" ||
      row.result === "product_category_not_supported" ||
      row.result === "product_code_company_unconfigured" ||
      row.result === "product_code_category_unconfigured" ||
      row.result === "product_code_allocation_failed" ||
      row.result === "product_draft_source_conflict" ||
      row.result === "claim_lost"
    ) {
      return { result: row.result };
    }
    throw new Error(`Unexpected classifier import group result: ${row.result}`);
  }

  async setGroupResult(
    importId: string,
    attemptToken: string,
    groupId: string,
    result:
      | { status: "pending" | "processing" | "complete"; errorCode?: null }
      | { status: "failed"; errorCode: string; retryable: boolean },
  ): Promise<boolean> {
    const response = await this.database.rpc("set_classifier_import_group_result", {
      p_import_id: importId,
      p_attempt_token: attemptToken,
      p_classifier_group_id: groupId,
      p_status: result.status,
      p_error_code: result.status === "failed" ? result.errorCode : null,
      p_retryable: result.status === "failed" ? result.retryable : false,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async finalizeRun(
    importId: string,
    attemptToken: string,
    result:
      | { status: "completed" | "completed_with_errors"; errorCode?: null }
      | { status: "failed"; errorCode: string; retryable: boolean },
  ): Promise<boolean> {
    const response = await this.database.rpc("finalize_classifier_import_run", {
      p_import_id: importId,
      p_attempt_token: attemptToken,
      p_status: result.status,
      p_error_code: result.status === "failed" ? result.errorCode : null,
      p_retryable: result.status === "failed" ? result.retryable : false,
    });
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }
}

function parseActionResult<T extends string>(value: string, allowed: readonly T[]): T {
  if (allowed.includes(value as T)) return value as T;
  throw new Error(`Unexpected classifier import action result: ${value}`);
}
