import type {
  ProductPublicationCorrelation,
  ProductPublicationItem,
  ProductPublicationRun,
} from "./product-publication.types";
import type { ProductAudience } from "@/features/product-audience/product-audience.types";

export type ProductPublicationAuthorizationInput = {
  audiences: ProductAudience[];
  productDraftId: string;
  sellerId: string;
  titlePatchPresent: boolean;
  title: string | null;
  descriptionPatchPresent: boolean;
  description: string | null;
  categoryId: string | null;
  moq: number | null;
  packSize: string | null;
  price: number | null;
  currency: string;
  stock: "in_stock" | "low_stock" | "out_of_stock" | "made_to_order";
  coverImageUrlPatchPresent: boolean;
  coverImageUrl: string | null;
  trending: boolean;
  delegatedAction: ProductPublicationCorrelation | null;
};

export type ProductPublicationAuthorizationResult =
  | {
      result: "pending" | "in_progress";
      productDraftId: string;
      status: "pending" | "running";
    }
  | {
      result:
        | "not_found"
        | "not_allowed"
        | "direct_product"
        | "cover_not_allowed"
        | "image_required"
        | "images_not_ready"
        | "not_editable"
        | "facts_missing"
        | "title_required"
        | "title_invalid"
        | "description_invalid"
        | "audience_required"
        | "category_required"
        | "product_code_company_unconfigured"
        | "product_code_category_unconfigured"
        | "product_code_allocation_failed";
      productDraftId: string | null;
    };

export type ProductPublicationRetryResult =
  | "requeued"
  | "noop"
  | "not_found"
  | "not_allowed"
  | "cleanup_required"
  | "title_required"
  | "title_invalid"
  | "description_invalid"
  | "audience_required"
  | "category_required"
  | "in_progress";

export interface ProductPublicationRepository {
  authorize(
    input: ProductPublicationAuthorizationInput,
  ): Promise<ProductPublicationAuthorizationResult>;
  getRun(productDraftId: string): Promise<ProductPublicationRun | null>;
  getFirstItemErrorCode(productDraftId: string): Promise<string | null>;
  claimRun(
    productDraftId: string,
    claimTimeoutSeconds: number,
  ): Promise<ProductPublicationRun | null>;
  listItems(productDraftId: string): Promise<ProductPublicationItem[]>;
  recordObjectCreated(input: {
    productDraftId: string;
    productDraftImageId: string;
    attemptToken: string;
    sourceSha256: string;
    publicUrl: string;
  }): Promise<boolean>;
  clearObjectOwnership(input: {
    productDraftId: string;
    productDraftImageId: string;
    attemptToken: string;
    createdAttemptToken: string;
  }): Promise<boolean>;
  verifyItem(input: {
    productDraftId: string;
    productDraftImageId: string;
    attemptToken: string;
    sourceSha256: string;
    publicSizeBytes: number;
    publicSha256: string;
    publicEtag: string | null;
    publicUrl: string;
    createdByCurrentAttempt: boolean;
  }): Promise<boolean>;
  failAttempt(input: {
    productDraftId: string;
    productDraftImageId: string;
    attemptToken: string;
    errorCode: string;
  }): Promise<boolean>;
  failClaimedRun(input: {
    productDraftId: string;
    attemptToken: string;
    errorCode: string;
  }): Promise<boolean>;
  hasPublishedImage(productDraftImageId: string): Promise<boolean>;
  completeCleanup(input: {
    productDraftId: string;
    productDraftImageId: string;
    createdAttemptToken: string;
  }): Promise<boolean>;
  finalizeCleanup(productDraftId: string): Promise<boolean>;
  finalize(input: {
    productDraftId: string;
    sellerId: string;
    attemptToken: string;
  }): Promise<"completed" | "stale_attempt" | "not_found" | "not_allowed">;
  markDispatchFailed(productDraftId: string): Promise<boolean>;
  retry(
    productDraftId: string,
    sellerId: string,
    delegatedAction: ProductPublicationCorrelation | null,
  ): Promise<ProductPublicationRetryResult>;
}
