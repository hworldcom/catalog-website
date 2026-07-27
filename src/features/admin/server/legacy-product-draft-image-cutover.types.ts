import type { Database } from "@/lib/supabase/types";

export const PRODUCT_DRAFT_IMAGE_CUTOVER_VERSION = "private-product-draft-images-v1";

export const PRODUCT_DRAFT_IMAGE_CUTOVER_CLAIM_TIMEOUT_SECONDS = 10 * 60;
export const PRODUCT_DRAFT_IMAGE_RECONCILIATION_CLAIM_TIMEOUT_SECONDS = 10 * 60;
export const PRODUCT_DRAFT_IMAGE_RECONCILIATION_DEADLINE_MS = 8 * 60 * 1000;
export const PRODUCT_DRAFT_IMAGE_RECONCILIATION_CONCURRENCY = 5;

export type ProductDraftImageStorageCutover =
  Database["public"]["Tables"]["product_draft_image_storage_cutovers"]["Row"];

export type ProductDraftImageStorageReconciliation =
  Database["public"]["Tables"]["product_draft_image_storage_reconciliations"]["Row"];

export type ProductDraftImageCutoverScanPhase =
  Database["public"]["Enums"]["product_draft_image_storage_cutover_scan_phase"];

export type ProductDraftImagePublicObjectState =
  Database["public"]["Enums"]["product_draft_image_public_object_state"];

export type LegacyProductDraftImageCutoverErrorCode =
  | "legacy_source_missing"
  | "legacy_source_conflict"
  | "legacy_private_object_conflict"
  | "legacy_object_unverifiable"
  | "legacy_destination_unowned"
  | "legacy_storage_unavailable"
  | "legacy_public_delete_failed"
  | "legacy_cutover_claim_lost";

export type LegacyProductDraftImageReconciliationWorkItem = {
  destinationKey: string;
  productDraftImageId: string | null;
  reconciliationStatus: "started";
  publicObjectState: ProductDraftImagePublicObjectState;
  attemptCount: number;
  attemptToken: string;
  imageStatus: Database["public"]["Enums"]["product_draft_image_status"] | null;
  storageBucket: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  classifierOrganizationId: string | null;
  classifierBatchId: string | null;
  classifierGroupId: string | null;
  classifierImageId: string | null;
  sourceContentLength: number | null;
};

export type ProductDraftImageCutoverSummary = {
  cutover: ProductDraftImageStorageCutover;
  failuresByCode: Record<string, number>;
};

export type ProductDraftImageCutoverRunResult =
  | {
      status: "completed";
      summary: ProductDraftImageCutoverSummary;
    }
  | {
      status: "failed";
      errorCode: LegacyProductDraftImageCutoverErrorCode;
      summary: ProductDraftImageCutoverSummary;
    };

export class LegacyProductDraftImageCutoverClaimLostError extends Error {
  constructor() {
    super("The legacy ProductDraft image cutover claim was lost.");
    this.name = "LegacyProductDraftImageCutoverClaimLostError";
  }
}
