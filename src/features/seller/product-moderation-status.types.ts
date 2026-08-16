import type {
  ProductDraftImageDeliveryErrorCode,
  ProductDraftImageDeliveryStatus,
} from "@/features/admin/server/product-draft-image-delivery.types";
import type { Json } from "@/lib/supabase/types";

export type ProductPublicState = "draft" | "published" | "archived";
export type ProductModerationReviewStatus =
  "pending" | "changes_requested" | "approved" | "rejected" | "withdrawn";
export type ProductModerationSubmissionKind = "initial_publication" | "update";
export type ProductActivationPhase = "activation" | "pre_switch_cleanup" | "post_switch_cleanup";
export type ProductActivationStatus =
  "pending" | "running" | "failed" | "cleanup_required" | "completed" | "abandoned";
export type ProductActivationDispatchStatus = "pending" | "dispatched" | "failed";
export type ProductActivationDisplayState =
  | "waiting_for_dispatch"
  | "dispatch_failed"
  | "publishing"
  | "activation_failed"
  | "abandonment_cleanup"
  | "abandonment_cleanup_required"
  | "public_cleanup"
  | "public_cleanup_required"
  | "completed"
  | "abandoned";

export type ProductModerationReview = {
  submissionId: string;
  kind: ProductModerationSubmissionKind;
  revision: number;
  status: ProductModerationReviewStatus;
  submittedAt: string;
  decidedAt: string | null;
  sellerVisibleReason: string | null;
};

export type ProductActivationStatusSnapshot = {
  runId: string;
  phase: ProductActivationPhase;
  status: ProductActivationStatus;
  dispatchStatus: ProductActivationDispatchStatus;
  dispatchGeneration: number;
  dispatchErrorCode: string | null;
  errorCode: string | null;
  displayState: ProductActivationDisplayState;
};

export type ProductModerationActions = {
  canEdit: boolean;
  canSubmit: boolean;
  canWithdraw: boolean;
  canAbandonFailedActivation: boolean;
  canRetryAbandonmentCleanup: boolean;
  canArchive: boolean;
  canRestore: boolean;
};

export type ProductModerationStatusCommon = {
  productId: string;
  publicState: ProductPublicState;
  actionRevision: number;
  hasWorkingCopy: boolean;
  review: ProductModerationReview | null;
  activation: ProductActivationStatusSnapshot | null;
  actions: ProductModerationActions;
};

export type ProductModerationSubmittedImage = {
  productDraftImageId: string;
  position: number;
  isCover: boolean;
  deliveryStatus: ProductDraftImageDeliveryStatus;
  deliveryErrorCode:
    ProductDraftImageDeliveryErrorCode | "product_draft_image_delivery_unavailable" | null;
  url: string | null;
  expiresAt: string | null;
};

export type ProductModerationSubmittedRevision = {
  submissionId: string;
  snapshotSchemaVersion: 1;
  snapshot: Json;
  images: ProductModerationSubmittedImage[];
};

export type ProductModerationStatusDetail = ProductModerationStatusCommon & {
  submittedRevision: ProductModerationSubmittedRevision | null;
};

export type ProductModerationStatusErrorCode =
  | "product_moderation_status_invalid"
  | "product_moderation_not_found"
  | "product_moderation_status_unavailable";

export class ProductModerationStatusError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 500,
    public readonly code: ProductModerationStatusErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProductModerationStatusError";
  }
}

export function invalidProductModerationStatusRequest(): ProductModerationStatusError {
  return new ProductModerationStatusError(
    400,
    "product_moderation_status_invalid",
    "The product moderation status request is invalid.",
  );
}

export function productModerationStatusNotFound(): ProductModerationStatusError {
  return new ProductModerationStatusError(
    404,
    "product_moderation_not_found",
    "The product was not found.",
  );
}

export function productModerationStatusUnavailable(): ProductModerationStatusError {
  return new ProductModerationStatusError(
    500,
    "product_moderation_status_unavailable",
    "Product moderation status is temporarily unavailable.",
  );
}
