import type { ProductDraftImageDurableStatus } from "@/features/admin/server/product-draft-image-delivery.types";

export type SellerProductDraftGalleryRecord = {
  imageId: string;
  productDraftId: string;
  sourcePosition: number;
  durableStatus: ProductDraftImageDurableStatus;
  isSourceCover: boolean;
};

export interface SellerProductDraftImageGalleryRepository {
  list(productDraftId: string): Promise<SellerProductDraftGalleryRecord[]>;
}

export class SellerProductDraftImageGalleryRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SellerProductDraftImageGalleryRepositoryError";
  }
}
