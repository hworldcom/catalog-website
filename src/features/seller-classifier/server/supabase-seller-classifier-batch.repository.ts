import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type {
  SellerClassifierBatchCompletionResult,
  SellerClassifierBatchCreateResult,
  SellerClassifierBatchFailureResult,
  SellerClassifierBatchObservationResult,
  SellerClassifierBatchRecord,
  SellerClassifierBatchRepository,
  SellerClassifierBatchRetryClaimResult,
  SellerClassifierApprovalResult,
  SellerClassifierReviewObservationResult,
} from "./seller-classifier-batch.repository";

type AdminClient = SupabaseClient<Database>;
type BatchRow = Database["public"]["Tables"]["seller_classifier_batches"]["Row"];
type OperationRow =
  Database["public"]["Functions"]["create_or_get_seller_classifier_batch"]["Returns"][number];

export class SupabaseSellerClassifierBatchRepository implements SellerClassifierBatchRepository {
  constructor(private readonly database: AdminClient) {}

  async createOrGet(input: {
    sellerId: string;
    clientRequestId: string;
    classifierOrganizationId: string;
    initiatedByUserId: string;
    initiatorKind: "seller" | "administrator";
  }): Promise<SellerClassifierBatchCreateResult> {
    const response = await this.database.rpc("create_or_get_seller_classifier_batch", {
      p_seller_id: input.sellerId,
      p_client_request_id: input.clientRequestId,
      p_classifier_organization_id: input.classifierOrganizationId,
      p_initiated_by_user_id: input.initiatedByUserId,
      p_initiator_kind: input.initiatorKind,
    });
    if (response.error) throw databaseError(response.error);
    const row = requireOperationRow(response.data?.[0]);
    return {
      operation: parseResult(row.operation_result, ["created", "existing"]),
      record: mapRecord(row),
    };
  }

  async findOwned(
    workflowId: string,
    sellerId: string,
  ): Promise<SellerClassifierBatchRecord | null> {
    const response = await this.database
      .from("seller_classifier_batches")
      .select("*")
      .eq("id", workflowId)
      .eq("seller_id", sellerId)
      .maybeSingle();
    if (response.error) throw databaseError(response.error);
    return response.data ? mapRecord(response.data) : null;
  }

  async completeProvisioning(input: {
    workflowId: string;
    classifierBatchId: string;
    maxFiles: number;
    maxFileSizeBytes: number;
  }): Promise<SellerClassifierBatchCompletionResult> {
    const response = await this.database.rpc("complete_seller_classifier_batch_provisioning", {
      p_workflow_id: input.workflowId,
      p_classifier_batch_id: input.classifierBatchId,
      p_max_files: input.maxFiles,
      p_max_file_size_bytes: input.maxFileSizeBytes,
    });
    if (response.error) throw databaseError(response.error);
    const row = requireOperationRow(response.data?.[0]);
    return {
      operation: parseResult(row.operation_result, [
        "completed",
        "ready",
        "conflict",
        "not_found",
        "not_in_progress",
      ]),
      record: optionalRecord(row),
    };
  }

  async failProvisioning(input: {
    workflowId: string;
    errorCode: string;
    retryable: boolean;
  }): Promise<SellerClassifierBatchFailureResult> {
    const response = await this.database.rpc("fail_seller_classifier_batch_provisioning", {
      p_workflow_id: input.workflowId,
      p_error_code: input.errorCode,
      p_retryable: input.retryable,
    });
    if (response.error) throw databaseError(response.error);
    const row = requireOperationRow(response.data?.[0]);
    return {
      operation: parseResult(row.operation_result, ["failed", "ready", "not_found"]),
      record: optionalRecord(row),
    };
  }

  async claimRetry(
    workflowId: string,
    sellerId: string,
  ): Promise<SellerClassifierBatchRetryClaimResult> {
    const response = await this.database.rpc("claim_seller_classifier_batch_provisioning_retry", {
      p_workflow_id: workflowId,
      p_seller_id: sellerId,
    });
    if (response.error) throw databaseError(response.error);
    const row = requireOperationRow(response.data?.[0]);
    return {
      operation: parseResult(row.operation_result, [
        "claimed",
        "ready",
        "in_progress",
        "not_retryable",
        "not_found",
      ]),
      record: optionalRecord(row),
    };
  }

  async recordObservation(input: {
    workflowId: string;
    sellerId: string;
    observationKind: "upload" | "processing" | "processing_retry";
    stage: "upload" | "processing" | "review" | "approved" | "failed";
    originalFileCount: number;
    processedFileCount: number;
    errorCode: string | null;
    retryable: boolean;
  }): Promise<SellerClassifierBatchObservationResult> {
    const response = await this.database.rpc("record_seller_classifier_batch_observation", {
      p_workflow_id: input.workflowId,
      p_seller_id: input.sellerId,
      p_observation_kind: input.observationKind,
      p_stage: input.stage,
      p_original_file_count: input.originalFileCount,
      p_processed_file_count: input.processedFileCount,
      p_error_code: input.errorCode,
      p_retryable: input.retryable,
    });
    if (response.error) throw databaseError(response.error);
    const row = requireOperationRow(response.data?.[0]);
    return {
      operation: parseResult(row.operation_result, ["recorded", "stale", "not_found", "not_ready"]),
      record: optionalRecord(row),
    };
  }

  async recordReviewObservation(input: {
    workflowId: string;
    sellerId: string;
    stage: "review" | "approved";
    groupCount: number;
  }): Promise<SellerClassifierReviewObservationResult> {
    const response = await this.database.rpc("record_seller_classifier_review_observation", {
      p_workflow_id: input.workflowId,
      p_seller_id: input.sellerId,
      p_stage: input.stage,
      p_group_count: input.groupCount,
    });
    if (response.error) throw databaseError(response.error);
    const row = requireOperationRow(response.data?.[0]);
    return {
      operation: parseResult(row.operation_result, ["recorded", "stale", "not_found", "not_ready"]),
      record: optionalRecord(row),
    };
  }

  async recordApproved(input: {
    workflowId: string;
    sellerId: string;
    groupCount: number;
  }): Promise<SellerClassifierApprovalResult> {
    const response = await this.database.rpc("record_seller_classifier_batch_approved", {
      p_workflow_id: input.workflowId,
      p_seller_id: input.sellerId,
      p_group_count: input.groupCount,
    });
    if (response.error) throw databaseError(response.error);
    const row = requireOperationRow(response.data?.[0]);
    return {
      operation: parseResult(row.operation_result, ["recorded", "stale", "not_found", "not_ready"]),
      record: optionalRecord(row),
    };
  }
}

function optionalRecord(row: OperationRow): SellerClassifierBatchRecord | null {
  return row.id ? mapRecord(row) : null;
}

function requireOperationRow(row: OperationRow | undefined): OperationRow {
  if (!row) throw new Error("Seller classifier workflow operation returned no result.");
  return row;
}

function mapRecord(row: BatchRow | OperationRow): SellerClassifierBatchRecord {
  return {
    id: row.id,
    sellerId: row.seller_id,
    clientRequestId: row.client_request_id,
    classifierOrganizationId: row.classifier_organization_id,
    classifierBatchId: row.classifier_batch_id,
    maxFiles: row.max_files,
    maxFileSizeBytes: row.max_file_size_bytes,
    provisioningStatus: parseResult(row.provisioning_status, ["provisioning", "ready", "failed"]),
    lastKnownStage: parseResult(row.last_known_stage, [
      "provisioning",
      "upload",
      "processing",
      "review",
      "approved",
      "importing",
      "drafts_ready",
      "failed",
    ]),
    originalFileCount: row.original_file_count,
    processedFileCount: row.processed_file_count,
    groupCount: row.group_count,
    productDraftCount: row.product_draft_count,
    errorCode: row.error_code,
    retryable: row.retryable,
    initiatedByUserId: row.initiated_by_user_id,
    initiatorKind: parseResult(row.initiator_kind, ["seller", "administrator"]),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseResult<const T extends string>(value: string, allowed: readonly T[]): T {
  if (allowed.includes(value as T)) return value as T;
  throw new Error(`Unexpected seller classifier workflow value: ${value}`);
}

function databaseError(error: { message: string }): Error {
  console.error("[Seller classifier] Database operation failed.", error);
  return new Error("Seller classifier database operation failed.");
}
