import type { Json } from "@/lib/supabase/types";

import type {
  AdministratorModerationActivationStatus,
  AdministratorModerationFilters,
  AdministratorModerationSubmissionType,
} from "../administrator-moderation.types";
import type { AdministratorModerationCursor } from "../administrator-moderation.cursor";
import type {
  ProductActivationDispatchStatus,
  ProductActivationPhase,
  ProductActivationStatus,
  ProductModerationReviewStatus,
} from "@/features/seller/product-moderation-status.types";

export type AdministratorModerationActivationRecord = {
  runId: string;
  phase: ProductActivationPhase;
  status: ProductActivationStatus;
  dispatchStatus: ProductActivationDispatchStatus;
  dispatchGeneration: number;
  dispatchErrorCode: string | null;
  errorCode: string | null;
};

export type AdministratorModerationQueueRecord = {
  submission_type: AdministratorModerationSubmissionType;
  submission_id: string;
  seller_id: string;
  seller_name: string;
  revision: number;
  submitted_at: string;
  review_status: ProductModerationReviewStatus;
  seller_visible_reason: string | null;
  seller_preview_kind: "seller_logo" | "seller_cover" | null;
  seller_preview_asset_id: string | null;
  seller_preview_durable_status: "pending" | "available" | "deleting" | "failed" | "deleted" | null;
  seller_preview_error_code: string | null;
  product_id: string | null;
  product_snapshot_schema_version: number | null;
  product_snapshot_json: Json | null;
  product_cover_image_id: string | null;
  activation_run_id: string | null;
  activation_phase: ProductActivationPhase | null;
  activation_status: AdministratorModerationActivationStatus | null;
  activation_dispatch_status: ProductActivationDispatchStatus | null;
  activation_dispatch_generation: number | null;
  activation_dispatch_error_code: string | null;
  activation_error_code: string | null;
};

export type AdministratorSellerAssetRecord = {
  assetId: string;
  kind: "logo" | "cover";
  durableStatus: "pending" | "available" | "deleting" | "failed" | "deleted";
  errorCode: string | null;
};

export type AdministratorSellerModerationDetailRecord = {
  submissionId: string;
  sellerId: string;
  sellerName: string;
  revision: number;
  submittedAt: string;
  reviewStatus: ProductModerationReviewStatus;
  sellerVisibleReason: string | null;
  administratorUserId: string | null;
  decisionRequestId: string | null;
  decidedAt: string | null;
  proposed: {
    snapshot: Json;
    logoAsset: AdministratorSellerAssetRecord | null;
    coverAsset: AdministratorSellerAssetRecord | null;
  };
  comparisonBaseline: {
    submissionId: string;
    revision: number;
    snapshot: Json;
    logoAsset: AdministratorSellerAssetRecord | null;
    coverAsset: AdministratorSellerAssetRecord | null;
  } | null;
  currentApprovedReference: { submissionId: string; revision: number } | null;
  canDecide: boolean;
};

export type AdministratorProductSubmissionImageRecord = {
  productDraftImageId: string;
  position: number;
  isCover: boolean;
};

export type AdministratorProductModerationDetailRecord = {
  submissionId: string;
  productId: string;
  sellerId: string;
  sellerName: string;
  revision: number;
  submissionKind: "initial_publication" | "update";
  submittedAt: string;
  reviewStatus: ProductModerationReviewStatus;
  sellerVisibleReason: string | null;
  administratorUserId: string | null;
  decisionRequestId: string | null;
  decidedAt: string | null;
  proposed: {
    snapshotSchemaVersion: number;
    snapshot: Json;
    images: AdministratorProductSubmissionImageRecord[];
  };
  comparisonBaseline: {
    submissionId: string;
    revision: number;
    snapshotSchemaVersion: number;
    snapshot: Json;
    images: AdministratorProductSubmissionImageRecord[];
  } | null;
  currentApprovedReference: { submissionId: string; revision: number } | null;
  activation: AdministratorModerationActivationRecord | null;
  canDecide: boolean;
  canRetryDispatch: boolean;
  canRetryActivation: boolean;
  canRetryPostSwitchCleanup: boolean;
};

export interface AdministratorModerationRepository {
  list(
    filters: AdministratorModerationFilters,
    after: AdministratorModerationCursor | null,
  ): Promise<AdministratorModerationQueueRecord[]>;
  getSeller(submissionId: string): Promise<AdministratorSellerModerationDetailRecord | null>;
  getProduct(submissionId: string): Promise<AdministratorProductModerationDetailRecord | null>;
}

export class AdministratorModerationRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdministratorModerationRepositoryError";
  }
}
