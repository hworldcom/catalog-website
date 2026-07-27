import type { AdminProductDraftReview } from "./admin-product-draft-review.types";

export function mergeReviewGallery(
  current: AdminProductDraftReview,
  replacement: AdminProductDraftReview,
): AdminProductDraftReview {
  if (current.productDraftId !== replacement.productDraftId) return current;
  return {
    ...current,
    coverImageId: replacement.coverImageId,
    previewImageId: replacement.previewImageId,
    previewDeliveryStatus: replacement.previewDeliveryStatus,
    previewDeliveryErrorCode: replacement.previewDeliveryErrorCode,
    images: replacement.images,
  };
}
