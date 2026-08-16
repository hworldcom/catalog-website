import type { ProductDraftImageDurableStatus } from "@/features/admin/server/product-draft-image-delivery.types";

export type SellerProductDraftGalleryRecord = {
  imageId: string;
  productDraftId: string;
  sourcePosition: number;
  durableStatus: ProductDraftImageDurableStatus;
  sourceKind: "classifier_import" | "seller_upload";
  clientUploadId: string | null;
  originalFilename: string | null;
  contentType: "image/jpeg" | "image/png" | "image/webp" | null;
  sizeBytes: number | null;
  lifecycleErrorCode: string | null;
  recoveryAction: "retry_finalize" | "retry_upload" | "retry_cleanup" | null;
  canRemove: boolean;
  isSourceCover: boolean;
};

export interface SellerProductDraftImageGalleryRepository {
  list(productDraftId: string): Promise<{
    galleryRevision: number;
    moderationRevision: number;
    records: SellerProductDraftGalleryRecord[];
  }>;
}

export class SellerProductDraftImageGalleryRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SellerProductDraftImageGalleryRepositoryError";
  }
}
