import type {
  ProductDraftImageContentType,
  ProductDraftImageGalleryMutationResponse,
} from "../product-draft-image-lifecycle.types";

export type ProductDraftImageLifecycleRecord = {
  imageId: string;
  productDraftId: string;
  clientUploadId: string;
  originalFilename: string;
  contentType: ProductDraftImageContentType;
  sizeBytes: number;
  destinationKey: string;
  durableStatus: "pending" | "available" | "failed" | "deleting";
  lifecycleErrorCode: string | null;
};

export type PreparedProductDraftImageRecord = ProductDraftImageLifecycleRecord;

export type PrepareProductDraftImageRecordsResult = {
  result:
    | "prepared"
    | "not_found"
    | "not_editable"
    | "not_allowed"
    | "gallery_locked"
    | "stale"
    | "limit_exceeded"
    | "upload_conflict"
    | "cleanup_required"
    | "verification_required";
  galleryRevision: number | null;
  images: PreparedProductDraftImageRecord[];
};

export type FinalizeProductDraftImageRecord = {
  imageId: string;
  outcome: "available" | "failed";
  contentType?: ProductDraftImageContentType;
  sizeBytes?: number;
  errorCode?:
    | "product_draft_image_object_missing"
    | "product_draft_image_verification_failed"
    | "product_draft_image_upload_cleanup_failed";
};

export interface ProductDraftImageLifecycleRepository {
  listByClientUploadIds(
    productDraftId: string,
    sellerId: string,
    clientUploadIds: string[],
  ): Promise<ProductDraftImageLifecycleRecord[]>;
  listByImageIds(
    productDraftId: string,
    sellerId: string,
    imageIds: string[],
  ): Promise<ProductDraftImageLifecycleRecord[]>;
  prepare(input: {
    productDraftId: string;
    sellerId: string;
    expectedGalleryRevision: number;
    files: Array<{
      clientUploadId: string;
      originalFilename: string;
      contentType: ProductDraftImageContentType;
      sizeBytes: number;
    }>;
    verifiedAbsentImageIds: string[];
  }): Promise<PrepareProductDraftImageRecordsResult>;
  finalize(input: {
    productDraftId: string;
    sellerId: string;
    results: FinalizeProductDraftImageRecord[];
  }): Promise<ProductDraftImageGalleryMutationResponse & { result: string }>;
  failUploadCleanup(input: {
    productDraftId: string;
    sellerId: string;
    imageId: string;
  }): Promise<ProductDraftImageGalleryMutationResponse & { result: string }>;
  completeUploadCleanup(input: {
    productDraftId: string;
    sellerId: string;
    imageId: string;
  }): Promise<ProductDraftImageGalleryMutationResponse & { result: string }>;
  update(input: {
    productDraftId: string;
    sellerId: string;
    expectedGalleryRevision: number;
    orderedAvailableImageIds: string[];
    coverImageId: string;
  }): Promise<ProductDraftImageGalleryMutationResponse & { result: string }>;
  beginRemoval(input: {
    productDraftId: string;
    sellerId: string;
    imageId: string;
    expectedGalleryRevision: number;
  }): Promise<
    ProductDraftImageGalleryMutationResponse & {
      result: string;
      destinationKey: string | null;
    }
  >;
  completeRemoval(input: {
    productDraftId: string;
    sellerId: string;
    imageId: string;
  }): Promise<ProductDraftImageGalleryMutationResponse & { result: string }>;
  failRemoval(input: {
    productDraftId: string;
    sellerId: string;
    imageId: string;
  }): Promise<ProductDraftImageGalleryMutationResponse & { result: string }>;
}
