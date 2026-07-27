import type {
  ProductDraftImageDeliveryErrorCode,
  ProductDraftImageDeliveryStatus,
  ProductDraftImageDurableStatus,
} from "@/features/admin/server/product-draft-image-delivery.types";

export type SellerProductDraftGalleryImage = {
  imageId: string;
  sourcePosition: number;
  durableStatus: ProductDraftImageDurableStatus;
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
      images: SellerProductDraftGalleryImage[];
    }
  | {
      status: "unavailable";
      errorCode: "product_draft_image_delivery_unavailable";
      images: SellerProductDraftGalleryImage[];
    };
