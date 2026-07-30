import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ClassifierImportGroupOutcome,
  ClassifierImportRun,
} from "@/features/admin/server/classifier-import.types";
import type { Database } from "@/lib/supabase/types";

import type {
  SellerClassifierProductDraftImageStatus,
  SellerClassifierProductDraftSummary,
} from "../seller-classifier-import.types";
import type {
  OwnedClassifierImportBindingResult,
  SellerClassifierImportActionState,
  SellerClassifierImportRepository,
} from "./seller-classifier-import.repository";

type AdminClient = SupabaseClient<Database>;
type BindingRow =
  Database["public"]["Functions"]["create_or_get_owned_classifier_import"]["Returns"][number];

export class SupabaseSellerClassifierImportRepository implements SellerClassifierImportRepository {
  constructor(private readonly database: AdminClient) {}

  async findBySource(
    classifierOrganizationId: string,
    classifierBatchId: string,
  ): Promise<ClassifierImportRun | null> {
    const response = await this.database
      .from("classifier_import_runs")
      .select("*")
      .eq("classifier_organization_id", classifierOrganizationId)
      .eq("classifier_batch_id", classifierBatchId)
      .maybeSingle();
    if (response.error) throw databaseError(response.error);
    return response.data;
  }

  async createOrGetOwned(input: {
    workflowId: string;
    sellerId: string;
    classifierOrganizationId: string;
    classifierBatchId: string;
    requestedByUserId: string;
  }): Promise<OwnedClassifierImportBindingResult> {
    const response = await this.database.rpc("create_or_get_owned_classifier_import", {
      p_workflow_id: input.workflowId,
      p_seller_id: input.sellerId,
      p_classifier_organization_id: input.classifierOrganizationId,
      p_classifier_batch_id: input.classifierBatchId,
      p_requested_by_user_id: input.requestedByUserId,
    });
    if (response.error) throw databaseError(response.error);
    const row = response.data?.[0];
    if (!row) throw new Error("Owned classifier import operation returned no result.");
    const operation = parseOperation(row.operation_result);
    return {
      operation,
      run: operation === "created" || operation === "existing" ? requireRun(row) : null,
    };
  }

  async findOwned(workflowId: string, sellerId: string): Promise<ClassifierImportRun | null> {
    const response = await this.database.rpc("get_owned_seller_classifier_import", {
      p_workflow_id: workflowId,
      p_seller_id: sellerId,
    });
    if (response.error) throw databaseError(response.error);
    return response.data?.[0] ?? null;
  }

  async listGroupOutcomes(importId: string): Promise<ClassifierImportGroupOutcome[]> {
    const response = await this.database
      .from("classifier_import_group_outcomes")
      .select("*")
      .eq("classifier_import_run_id", importId)
      .order("source_group_position", { nullsFirst: false })
      .order("created_at")
      .order("classifier_group_id");
    if (response.error) throw databaseError(response.error);
    return response.data ?? [];
  }

  async getActionState(importId: string): Promise<SellerClassifierImportActionState> {
    const response = await this.database.rpc("get_classifier_import_action_state", {
      p_import_id: importId,
    });
    if (response.error) throw databaseError(response.error);
    return {
      canRetryTemporary: response.data?.[0]?.can_retry_temporary ?? false,
    };
  }

  async listProductDrafts(
    importId: string,
    sellerId: string,
  ): Promise<SellerClassifierProductDraftSummary[]> {
    const outcomes = await this.listGroupOutcomes(importId);
    const productDraftIds = unique(
      outcomes.flatMap((outcome) => (outcome.product_draft_id ? [outcome.product_draft_id] : [])),
    );
    if (productDraftIds.length === 0) return [];

    const [productsResponse, membershipsResponse, imagesResponse] = await Promise.all([
      this.database.from("products").select("id,title,status,seller_id").in("id", productDraftIds),
      this.database
        .from("product_draft_source_memberships")
        .select("product_draft_id,classifier_image_id,promotion_required")
        .in("product_draft_id", productDraftIds)
        .eq("promotion_required", true),
      this.database
        .from("product_draft_images")
        .select("product_draft_id,classifier_image_id,status")
        .in("product_draft_id", productDraftIds),
    ]);
    if (productsResponse.error) throw databaseError(productsResponse.error);
    if (membershipsResponse.error) throw databaseError(membershipsResponse.error);
    if (imagesResponse.error) throw databaseError(imagesResponse.error);

    const products = new Map((productsResponse.data ?? []).map((product) => [product.id, product]));
    const memberships = membershipsResponse.data ?? [];
    const imageStatuses = new Map(
      (imagesResponse.data ?? []).map((image) => [
        `${image.product_draft_id}:${image.classifier_image_id}`,
        image.status,
      ]),
    );

    return productDraftIds.map((productDraftId) => {
      const product = products.get(productDraftId);
      if (!product || product.seller_id !== sellerId) {
        throw new Error("Owned classifier import contains an invalid ProductDraft.");
      }
      const required = memberships.filter(
        (membership) => membership.product_draft_id === productDraftId,
      );
      return {
        productDraftId,
        title: product.title.trim() || null,
        status: product.status,
        imageStatus: summarizeImageStatus(
          required.map(
            (membership) =>
              imageStatuses.get(
                `${membership.product_draft_id}:${membership.classifier_image_id}`,
              ) ?? null,
          ),
        ),
      };
    });
  }

  async retry(importId: string): Promise<"requeued" | "noop" | "not_found" | "not_allowed"> {
    const response = await this.database.rpc("retry_classifier_import", {
      p_import_id: importId,
      p_include_non_retryable: false,
    });
    if (response.error) throw databaseError(response.error);
    return parseRetryResult(response.data);
  }
}

function requireRun(row: BindingRow): ClassifierImportRun {
  if (
    !row.id ||
    !row.classifier_organization_id ||
    !row.classifier_batch_id ||
    !row.seller_id ||
    !row.status ||
    !row.operation_kind ||
    row.attempt_count === null ||
    row.retryable === null ||
    !row.retry_policy ||
    !row.created_at ||
    !row.updated_at
  ) {
    throw new Error("Owned classifier import operation returned an incomplete import.");
  }
  return {
    id: row.id,
    classifier_organization_id: row.classifier_organization_id,
    classifier_batch_id: row.classifier_batch_id,
    seller_id: row.seller_id,
    seller_classifier_workflow_id: row.seller_classifier_workflow_id,
    pipeline_version: row.pipeline_version,
    status: row.status,
    operation_kind: row.operation_kind,
    requested_by_user_id: row.requested_by_user_id,
    attempt_count: row.attempt_count,
    attempt_token: row.attempt_token,
    claim_started_at: row.claim_started_at,
    last_heartbeat_at: row.last_heartbeat_at,
    error_code: row.error_code,
    retryable: row.retryable,
    retry_policy: row.retry_policy,
    created_at: row.created_at,
    completed_at: row.completed_at,
    updated_at: row.updated_at,
  };
}

function parseOperation(value: string): OwnedClassifierImportBindingResult["operation"] {
  if (
    value === "created" ||
    value === "existing" ||
    value === "ownership_conflict" ||
    value === "stale" ||
    value === "not_found"
  ) {
    return value;
  }
  throw new Error(`Unexpected owned classifier import result: ${value}`);
}

function parseRetryResult(value: string): "requeued" | "noop" | "not_found" | "not_allowed" {
  if (
    value === "requeued" ||
    value === "noop" ||
    value === "not_found" ||
    value === "not_allowed"
  ) {
    return value;
  }
  throw new Error(`Unexpected classifier import retry result: ${value}`);
}

function summarizeImageStatus(
  statuses: Array<"pending" | "available" | "failed" | null>,
): SellerClassifierProductDraftImageStatus {
  if (statuses.length === 0) return "pending";
  const available = statuses.filter((status) => status === "available").length;
  if (available === statuses.length) return "available";
  if (available > 0) return "partially_available";
  if (statuses.some((status) => status === "failed")) return "failed";
  return "pending";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function databaseError(error: { message: string }): Error {
  console.error("[Seller classifier import] Database operation failed.", error);
  return new Error("Seller classifier import database operation failed.");
}
