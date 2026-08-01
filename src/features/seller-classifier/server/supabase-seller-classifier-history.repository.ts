import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type {
  SellerClassifierHistoryImportRecord,
  SellerClassifierHistoryRecord,
  SellerClassifierHistoryRepository,
} from "./seller-classifier-history.repository";
import { SellerClassifierHistoryRepositoryError } from "./seller-classifier-history.repository";
import {
  listOwnedClassifierImportProducts,
  type OwnedClassifierImportProduct,
  OwnedClassifierImportProductsError,
} from "./supabase-owned-classifier-import-products";

type DatabaseClient = SupabaseClient<Database>;
type WorkflowRow = Pick<
  Database["public"]["Tables"]["seller_classifier_batches"]["Row"],
  | "id"
  | "initiator_kind"
  | "provisioning_status"
  | "last_known_stage"
  | "original_file_count"
  | "processed_file_count"
  | "group_count"
  | "product_draft_count"
  | "error_code"
  | "retryable"
  | "created_at"
  | "updated_at"
>;
type ImportRow = Pick<
  Database["public"]["Tables"]["classifier_import_runs"]["Row"],
  "id" | "seller_classifier_workflow_id" | "status" | "error_code" | "retryable"
>;

const workflowFields =
  "id,initiator_kind,provisioning_status,last_known_stage,original_file_count,processed_file_count,group_count,product_draft_count,error_code,retryable,created_at,updated_at" as const;

export class SupabaseSellerClassifierHistoryRepository implements SellerClassifierHistoryRepository {
  constructor(private readonly database: DatabaseClient) {}

  async listOwned(
    input: Parameters<SellerClassifierHistoryRepository["listOwned"]>[0],
  ): Promise<SellerClassifierHistoryRecord[]> {
    let query = this.database
      .from("seller_classifier_batches")
      .select(workflowFields)
      .eq("seller_id", input.sellerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(input.limit);

    if (input.before) {
      const createdAt = quotePostgrestValue(input.before.createdAt);
      query = query.or(
        `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${input.before.workflowId})`,
      );
    }

    const workflowResponse = await query;
    if (workflowResponse.error) throw databaseError(workflowResponse.error);
    const workflows = (workflowResponse.data ?? []) as WorkflowRow[];
    if (workflows.length === 0) return [];

    const importResponse = await this.database
      .from("classifier_import_runs")
      .select("id,seller_classifier_workflow_id,status,error_code,retryable")
      .eq("seller_id", input.sellerId)
      .in(
        "seller_classifier_workflow_id",
        workflows.map((workflow) => workflow.id),
      );
    if (importResponse.error) throw databaseError(importResponse.error);

    const imports = new Map<string, SellerClassifierHistoryImportRecord>();
    for (const row of (importResponse.data ?? []) as ImportRow[]) {
      if (!row.seller_classifier_workflow_id) continue;
      if (imports.has(row.seller_classifier_workflow_id)) {
        throw new SellerClassifierHistoryRepositoryError(
          "Classifier history found more than one import for a workflow.",
        );
      }
      imports.set(row.seller_classifier_workflow_id, {
        id: row.id,
        status: row.status,
        errorCode: row.error_code,
        retryable: row.retryable,
      });
    }

    let products: OwnedClassifierImportProduct[];
    try {
      products = await listOwnedClassifierImportProducts(
        this.database,
        input.sellerId,
        [...imports.values()].map((record) => record.id),
      );
    } catch (error) {
      if (error instanceof OwnedClassifierImportProductsError) {
        throw databaseError(error);
      }
      throw error;
    }
    const productCounts = new Map<string, number>();
    for (const product of products) {
      productCounts.set(product.importId, (productCounts.get(product.importId) ?? 0) + 1);
    }

    return workflows.map((workflow) => historyRecord(workflow, imports, productCounts));
  }
}

function historyRecord(
  workflow: WorkflowRow,
  imports: Map<string, SellerClassifierHistoryImportRecord>,
  productCounts: Map<string, number>,
): SellerClassifierHistoryRecord {
  const importRecord = imports.get(workflow.id) ?? null;
  return {
    id: workflow.id,
    initiatorKind: parseResult(workflow.initiator_kind, ["seller", "administrator"]),
    provisioningStatus: parseResult(workflow.provisioning_status, [
      "provisioning",
      "ready",
      "failed",
    ]),
    stage: parseResult(workflow.last_known_stage, [
      "provisioning",
      "upload",
      "processing",
      "review",
      "approved",
      "importing",
      "drafts_ready",
      "failed",
    ]),
    originalFileCount: workflow.original_file_count,
    processedFileCount: workflow.processed_file_count,
    groupCount: workflow.group_count,
    productDraftCount: importRecord
      ? (productCounts.get(importRecord.id) ?? 0)
      : workflow.product_draft_count,
    errorCode: workflow.error_code,
    retryable: workflow.retryable,
    createdAt: workflow.created_at,
    updatedAt: workflow.updated_at,
    import: importRecord,
  };
}

function quotePostgrestValue(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function parseResult<const T extends string>(value: string, allowed: readonly T[]): T {
  if (allowed.includes(value as T)) return value as T;
  throw new SellerClassifierHistoryRepositoryError(
    "Classifier history found an unexpected durable state.",
  );
}

function databaseError(error: { message: string }): SellerClassifierHistoryRepositoryError {
  console.error("[Seller classifier history] Database read failed.", {
    message: error.message,
  });
  return new SellerClassifierHistoryRepositoryError(
    "Classifier workflow history database read failed.",
  );
}
