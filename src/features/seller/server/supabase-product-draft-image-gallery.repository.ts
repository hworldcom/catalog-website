import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import {
  SellerProductDraftImageGalleryRepositoryError,
  type SellerProductDraftGalleryRecord,
  type SellerProductDraftImageGalleryRepository,
} from "./product-draft-image-gallery.repository";

type AdminClient = SupabaseClient<Database>;

export class SupabaseSellerProductDraftImageGalleryRepository implements SellerProductDraftImageGalleryRepository {
  constructor(private readonly database: AdminClient) {}

  async list(productDraftId: string): Promise<{
    galleryRevision: number;
    records: SellerProductDraftGalleryRecord[];
  }> {
    const product = await this.database
      .from("products")
      .select("id,cover_image_id,image_gallery_revision")
      .eq("id", productDraftId)
      .maybeSingle();
    if (product.error) throw databaseError(product.error);
    if (!product.data)
      throw new SellerProductDraftImageGalleryRepositoryError("Product not found.");
    const productRecord = product.data;

    const images = await this.database
      .from("product_draft_images")
      .select(
        "id,product_draft_id,source_position,status,source_kind,client_upload_id,original_filename,content_type,size_bytes,lifecycle_error_code",
      )
      .eq("product_draft_id", productDraftId)
      .order("source_position", { ascending: true })
      .order("id", { ascending: true });
    if (images.error) throw databaseError(images.error);
    if (!images.data || images.data.length === 0) {
      return { galleryRevision: productRecord.image_gallery_revision, records: [] };
    }

    const classifierImageIds = images.data
      .filter((image) => image.source_kind === "classifier_import")
      .map((image) => image.id);
    let promotions: Array<{ product_draft_image_id: string; is_source_cover: boolean }> = [];
    if (classifierImageIds.length > 0) {
      const promotionResponse = await this.database
        .from("product_draft_image_promotions")
        .select("product_draft_image_id,is_source_cover")
        .eq("product_draft_id", productDraftId)
        .in("product_draft_image_id", classifierImageIds);
      if (promotionResponse.error) throw databaseError(promotionResponse.error);
      promotions = promotionResponse.data ?? [];
    }

    const coverByImageId = new Map<string, boolean>();
    for (const promotion of promotions) {
      if (coverByImageId.has(promotion.product_draft_image_id)) {
        throw new SellerProductDraftImageGalleryRepositoryError(
          "ProductDraft image source-cover metadata is inconsistent.",
        );
      }
      coverByImageId.set(promotion.product_draft_image_id, promotion.is_source_cover);
    }

    const records = images.data.map((image) => {
      const sourceKind = parseSourceKind(image.source_kind);
      const isSourceCover =
        sourceKind === "seller_upload"
          ? productRecord.cover_image_id === image.id
          : coverByImageId.get(image.id);
      if (isSourceCover === undefined) {
        throw new SellerProductDraftImageGalleryRepositoryError(
          "ProductDraft image source-cover metadata is missing.",
        );
      }
      return {
        imageId: image.id,
        productDraftId: image.product_draft_id,
        sourcePosition: image.source_position,
        durableStatus: image.status,
        sourceKind,
        clientUploadId: sourceKind === "seller_upload" ? image.client_upload_id : null,
        originalFilename: image.original_filename,
        contentType: parseContentType(image.content_type),
        sizeBytes: image.size_bytes,
        lifecycleErrorCode: image.lifecycle_error_code,
        recoveryAction:
          sourceKind === "seller_upload"
            ? recoveryAction(image.status, image.lifecycle_error_code)
            : null,
        canRemove: sourceKind === "seller_upload",
        isSourceCover,
      };
    });
    return { galleryRevision: productRecord.image_gallery_revision, records };
  }
}

function parseContentType(value: string | null): SellerProductDraftGalleryRecord["contentType"] {
  if (value === null || value === "image/jpeg" || value === "image/png" || value === "image/webp") {
    return value;
  }
  throw new SellerProductDraftImageGalleryRepositoryError(
    "ProductDraft image content type is invalid.",
  );
}

function parseSourceKind(value: string): SellerProductDraftGalleryRecord["sourceKind"] {
  if (value === "classifier_import" || value === "seller_upload") return value;
  throw new SellerProductDraftImageGalleryRepositoryError(
    "ProductDraft image source metadata is invalid.",
  );
}

function recoveryAction(
  status: Database["public"]["Enums"]["product_draft_image_status"],
  errorCode: string | null,
): SellerProductDraftGalleryRecord["recoveryAction"] {
  if (status === "pending") return "retry_finalize";
  if (status === "deleting" || errorCode === "product_draft_image_upload_cleanup_failed") {
    return "retry_cleanup";
  }
  if (status === "failed") return "retry_upload";
  return null;
}

function databaseError(error: { message: string }): SellerProductDraftImageGalleryRepositoryError {
  return new SellerProductDraftImageGalleryRepositoryError(
    `Seller ProductDraft image gallery database operation failed: ${error.message}`,
  );
}
