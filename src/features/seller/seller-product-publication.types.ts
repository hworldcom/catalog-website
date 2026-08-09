import type { ProductPublicationFailureReasonCode } from "./server/product-publication.types";

export type SellerProductImagePublicationMode = "durable" | "direct";

export type SellerProductPublicationStatus =
  | "not_started"
  | "not_required"
  | "pending"
  | "running"
  | "failed"
  | "cleanup_required"
  | "completed";

export type SellerProductPublicationSnapshot = {
  productDraftId: string;
  productStatus: "draft" | "published" | "archived";
  publicationStatus: SellerProductPublicationStatus;
  attemptCount: number;
  failureReasonCode: ProductPublicationFailureReasonCode | null;
  retryAllowed: boolean;
  publicProductUrl: string | null;
};

export type SellerProductPublicationErrorCode =
  | "product_publication_invalid"
  | "authentication_required"
  | "product_not_found"
  | "product_publication_title_required"
  | "product_publication_title_invalid"
  | "product_publication_description_invalid"
  | "product_publication_audience_required"
  | "product_publication_category_required"
  | "product_publication_image_required"
  | "product_publication_images_not_ready"
  | "product_publication_in_progress"
  | "product_publication_not_allowed"
  | "product_publication_configuration_invalid"
  | "product_publication_unavailable";

export class SellerProductPublicationError extends Error {
  constructor(
    public readonly statusCode: 400 | 401 | 404 | 409 | 500 | 503,
    public readonly code: SellerProductPublicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SellerProductPublicationError";
  }
}
