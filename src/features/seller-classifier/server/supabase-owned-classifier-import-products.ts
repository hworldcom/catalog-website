import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

// History reads one extra record to determine whether a 100-item page has a successor.
const MAX_IMPORTS = 101;

type DatabaseClient = SupabaseClient<Database>;
type ProductStatus = Database["public"]["Enums"]["product_status"];

export type OwnedClassifierImportProduct = {
  importId: string;
  workflowId: string;
  productDraftId: string;
  classifierGroupId: string;
  sourceGroupPosition: number | null;
  title: string;
  status: ProductStatus;
};

export class OwnedClassifierImportProductsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnedClassifierImportProductsError";
  }
}

export async function listOwnedClassifierImportProducts(
  database: DatabaseClient,
  sellerId: string,
  importIds: string[],
): Promise<OwnedClassifierImportProduct[]> {
  const uniqueImportIds = [...new Set(importIds)];
  if (uniqueImportIds.length === 0) return [];
  if (uniqueImportIds.length > MAX_IMPORTS) {
    throw new OwnedClassifierImportProductsError(
      "Owned classifier import ProductDraft read exceeded its bounded import limit.",
    );
  }

  const response = await database.rpc("list_owned_classifier_import_product_drafts", {
    p_seller_id: sellerId,
    p_import_ids: uniqueImportIds,
  });
  if (response.error) {
    throw new OwnedClassifierImportProductsError(response.error.message);
  }

  return (response.data ?? []).map((row) => {
    if (
      !row.classifier_import_run_id ||
      !row.seller_classifier_workflow_id ||
      !row.product_draft_id ||
      !row.classifier_group_id ||
      !isProductStatus(row.product_status)
    ) {
      throw new OwnedClassifierImportProductsError(
        "Owned classifier import ProductDraft read returned an incomplete row.",
      );
    }
    return {
      importId: row.classifier_import_run_id,
      workflowId: row.seller_classifier_workflow_id,
      productDraftId: row.product_draft_id,
      classifierGroupId: row.classifier_group_id,
      sourceGroupPosition: row.source_group_position,
      title: row.title ?? "",
      status: row.product_status,
    };
  });
}

function isProductStatus(value: string | null): value is ProductStatus {
  return value === "draft" || value === "published" || value === "archived";
}
