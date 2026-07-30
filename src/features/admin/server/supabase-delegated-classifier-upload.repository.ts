import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import type { SellerClassifierBatchRecord } from "@/features/seller-classifier/server/seller-classifier-batch.repository";

import type { DelegatedUploadSeller } from "../delegated-classifier-upload.types";
import {
  DelegatedClassifierUploadRepositoryError,
  type DelegatedClassifierUploadRepository,
} from "./delegated-classifier-upload.repository";

type DatabaseClient = SupabaseClient<Database>;
type WorkflowRow = Database["public"]["Tables"]["seller_classifier_batches"]["Row"];

const workflowFields =
  "id,seller_id,client_request_id,classifier_organization_id,classifier_batch_id,max_files,max_file_size_bytes,provisioning_status,last_known_stage,original_file_count,processed_file_count,group_count,product_draft_count,error_code,retryable,initiated_by_user_id,initiator_kind,created_at,updated_at" as const;

export class SupabaseDelegatedClassifierUploadRepository implements DelegatedClassifierUploadRepository {
  constructor(private readonly database: DatabaseClient) {}

  async searchSellers(input: { query: string; limit: number }): Promise<DelegatedUploadSeller[]> {
    const response = await this.database.rpc("search_delegated_upload_sellers", {
      p_query: input.query,
      p_limit: input.limit,
    });
    if (response.error) throw databaseError(response.error);
    return (response.data ?? []).map((seller) => ({
      sellerId: seller.seller_id,
      name: seller.name,
      slug: seller.slug,
      published: seller.published,
    }));
  }

  async findSeller(sellerId: string): Promise<DelegatedUploadSeller | null> {
    const response = await this.database
      .from("sellers")
      .select("id,name,slug,published")
      .eq("id", sellerId)
      .maybeSingle();
    if (response.error) throw databaseError(response.error);
    return response.data
      ? {
          sellerId: response.data.id,
          name: response.data.name,
          slug: response.data.slug,
          published: response.data.published,
        }
      : null;
  }

  async findWorkflow(workflowId: string): Promise<SellerClassifierBatchRecord | null> {
    const response = await this.database
      .from("seller_classifier_batches")
      .select(workflowFields)
      .eq("id", workflowId)
      .maybeSingle();
    if (response.error) throw databaseError(response.error);
    return response.data ? mapWorkflow(response.data) : null;
  }
}

function mapWorkflow(row: WorkflowRow): SellerClassifierBatchRecord {
  return {
    id: row.id,
    sellerId: row.seller_id,
    clientRequestId: row.client_request_id,
    classifierOrganizationId: row.classifier_organization_id,
    classifierBatchId: row.classifier_batch_id,
    maxFiles: row.max_files,
    maxFileSizeBytes: row.max_file_size_bytes,
    provisioningStatus: parseValue(row.provisioning_status, ["provisioning", "ready", "failed"]),
    lastKnownStage: parseValue(row.last_known_stage, [
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
    initiatorKind: parseValue(row.initiator_kind, ["seller", "administrator"]),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseValue<const T extends string>(value: string, allowed: readonly T[]): T {
  if (allowed.includes(value as T)) return value as T;
  throw new DelegatedClassifierUploadRepositoryError(
    "Delegated classifier upload found an unexpected durable value.",
  );
}

function databaseError(error: { message: string }): DelegatedClassifierUploadRepositoryError {
  console.error("[Delegated classifier upload] Database operation failed.", {
    message: error.message,
  });
  return new DelegatedClassifierUploadRepositoryError(
    "Delegated classifier upload database operation failed.",
  );
}
