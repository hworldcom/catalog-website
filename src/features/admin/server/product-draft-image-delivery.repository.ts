import type { Database } from "@/lib/supabase/types";

export type ProductDraftImageDeliveryRecord = {
  productDraftId: string;
  imageId: string;
  status: Database["public"]["Enums"]["product_draft_image_status"];
  storageBucket: string;
  destinationKey: string;
  contentType: string | null;
  sizeBytes: number | null;
  reconciliationStatus:
    Database["public"]["Enums"]["product_draft_image_storage_reconciliation_status"] | null;
  reconciliationErrorCode: string | null;
};

export type ProductDraftImageDeliveryData = {
  existingProductDraftIds: ReadonlySet<string>;
  images: ProductDraftImageDeliveryRecord[];
};

export interface ProductDraftImageDeliveryRepository {
  load(
    productDraftIds: string[],
    imageIds: string[],
    signal: AbortSignal,
  ): Promise<ProductDraftImageDeliveryData>;
}

export class ProductDraftImageDeliveryRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductDraftImageDeliveryRepositoryError";
  }
}
