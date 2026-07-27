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

  async list(productDraftId: string): Promise<SellerProductDraftGalleryRecord[]> {
    const images = await this.database
      .from("product_draft_images")
      .select("id,product_draft_id,source_position,status")
      .eq("product_draft_id", productDraftId)
      .order("source_position", { ascending: true })
      .order("id", { ascending: true });
    if (images.error) throw databaseError(images.error);
    if (!images.data || images.data.length === 0) return [];

    const imageIds = images.data.map((image) => image.id);
    const promotions = await this.database
      .from("product_draft_image_promotions")
      .select("product_draft_image_id,is_source_cover")
      .eq("product_draft_id", productDraftId)
      .in("product_draft_image_id", imageIds);
    if (promotions.error) throw databaseError(promotions.error);

    const coverByImageId = new Map<string, boolean>();
    for (const promotion of promotions.data ?? []) {
      if (coverByImageId.has(promotion.product_draft_image_id)) {
        throw new SellerProductDraftImageGalleryRepositoryError(
          "ProductDraft image source-cover metadata is inconsistent.",
        );
      }
      coverByImageId.set(promotion.product_draft_image_id, promotion.is_source_cover);
    }

    return images.data.map((image) => {
      const isSourceCover = coverByImageId.get(image.id);
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
        isSourceCover,
      };
    });
  }
}

function databaseError(error: { message: string }): SellerProductDraftImageGalleryRepositoryError {
  return new SellerProductDraftImageGalleryRepositoryError(
    `Seller ProductDraft image gallery database operation failed: ${error.message}`,
  );
}
