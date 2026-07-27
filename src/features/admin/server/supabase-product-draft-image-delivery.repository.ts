import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type {
  ProductDraftImageDeliveryData,
  ProductDraftImageDeliveryRecord,
  ProductDraftImageDeliveryRepository,
} from "./product-draft-image-delivery.repository";
import { ProductDraftImageDeliveryRepositoryError } from "./product-draft-image-delivery.repository";

type AdminClient = SupabaseClient<Database>;

export class SupabaseProductDraftImageDeliveryRepository implements ProductDraftImageDeliveryRepository {
  constructor(private readonly database: AdminClient) {}

  async load(
    productDraftIds: string[],
    imageIds: string[],
    signal: AbortSignal,
  ): Promise<ProductDraftImageDeliveryData> {
    const [productsResponse, imagesResponse] = await Promise.all([
      this.database.from("products").select("id").in("id", productDraftIds).abortSignal(signal),
      this.database
        .from("product_draft_images")
        .select("id,product_draft_id,status,storage_bucket,destination_key,content_type,size_bytes")
        .in("id", imageIds)
        .abortSignal(signal),
    ]);
    if (productsResponse.error) throwDatabaseError(productsResponse.error);
    if (imagesResponse.error) throwDatabaseError(imagesResponse.error);

    const reconciliationByImageId = await this.loadReconciliations(
      imagesResponse.data.map((image) => image.id),
      signal,
    );

    return {
      existingProductDraftIds: new Set(productsResponse.data.map((product) => product.id)),
      images: imagesResponse.data.map((image): ProductDraftImageDeliveryRecord => {
        const reconciliation = reconciliationByImageId.get(image.id);
        return {
          productDraftId: image.product_draft_id,
          imageId: image.id,
          status: image.status,
          storageBucket: image.storage_bucket,
          destinationKey: image.destination_key,
          contentType: image.content_type,
          sizeBytes: image.size_bytes,
          reconciliationStatus: reconciliation?.status ?? null,
          reconciliationErrorCode: reconciliation?.error_code ?? null,
        };
      }),
    };
  }

  private async loadReconciliations(
    imageIds: string[],
    signal: AbortSignal,
  ): Promise<
    Map<
      string,
      Pick<
        Database["public"]["Tables"]["product_draft_image_storage_reconciliations"]["Row"],
        "status" | "error_code"
      >
    >
  > {
    if (imageIds.length === 0) return new Map();

    const response = await this.database
      .from("product_draft_image_storage_reconciliations")
      .select("product_draft_image_id,status,error_code")
      .in("product_draft_image_id", imageIds)
      .abortSignal(signal);
    if (response.error) throwDatabaseError(response.error);

    return new Map(
      response.data.flatMap((row) =>
        row.product_draft_image_id
          ? [[row.product_draft_image_id, { status: row.status, error_code: row.error_code }]]
          : [],
      ),
    );
  }
}

function throwDatabaseError(error: { message: string }): never {
  throw new ProductDraftImageDeliveryRepositoryError(
    `ProductDraft image delivery database read failed: ${error.message}`,
  );
}
