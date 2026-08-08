import type {
  ProductDraftImageDeliveryErrorCode,
  ProductDraftImageDeliveryStatus,
  ProductDraftImageDurableStatus,
} from "@/features/admin/server/product-draft-image-delivery.types";

export type SellerProductDraftGalleryImage = {
  imageId: string;
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
  deliveryStatus: ProductDraftImageDeliveryStatus;
  deliveryErrorCode: ProductDraftImageDeliveryErrorCode | null;
  url: string | null;
  expiresAt: string | null;
  isSourceCover: boolean;
};

export type SellerProductDraftGallery =
  | {
      status: "available";
      errorCode: null;
      galleryRevision: number;
      images: SellerProductDraftGalleryImage[];
    }
  | {
      status: "unavailable";
      errorCode: "product_draft_image_delivery_unavailable";
      galleryRevision: number;
      images: SellerProductDraftGalleryImage[];
    };
