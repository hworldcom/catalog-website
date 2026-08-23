import type {
  ProductActivationDispatchStatus,
  ProductActivationPhase,
  ProductActivationStatus,
  ProductModerationReviewStatus,
  ProductModerationSubmissionKind,
  ProductMarketplaceVisibility,
  ProductPublicState,
} from "../product-moderation-status.types";
import type { Json } from "@/lib/supabase/types";

export type ProductModerationStatusRecord = {
  id: string;
  status: ProductPublicState;
  marketplace_visibility: ProductMarketplaceVisibility;
  moderation_revision: number;
  has_working_copy: boolean;
  review_submission_id: string | null;
  review_kind: ProductModerationSubmissionKind | null;
  review_revision: number | null;
  review_status: ProductModerationReviewStatus | null;
  review_submitted_at: string | null;
  review_decided_at: string | null;
  review_seller_visible_reason: string | null;
  activation_run_id: string | null;
  activation_phase: ProductActivationPhase | null;
  activation_status: ProductActivationStatus | null;
  activation_dispatch_status: ProductActivationDispatchStatus | null;
  activation_dispatch_generation: number | null;
  activation_dispatch_error_code: string | null;
  activation_error_code: string | null;
  can_edit: boolean;
  can_submit: boolean;
  can_withdraw: boolean;
  can_abandon_failed_activation: boolean;
  can_retry_abandonment_cleanup: boolean;
  can_archive: boolean;
  can_restore: boolean;
};

export type ProductModerationSubmittedImageRecord = {
  productDraftImageId: string;
  position: number;
  isCover: boolean;
};

export type ProductModerationStatusDetailRecord = ProductModerationStatusRecord & {
  submitted_snapshot_schema_version: 1 | null;
  submitted_snapshot_json: Json | null;
  submitted_images: ProductModerationSubmittedImageRecord[] | null;
};

export interface ProductModerationStatusRepository {
  getOwnedStatus(
    productId: string,
    sellerId: string,
  ): Promise<ProductModerationStatusDetailRecord | null>;
}

export class ProductModerationStatusRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductModerationStatusRepositoryError";
  }
}
