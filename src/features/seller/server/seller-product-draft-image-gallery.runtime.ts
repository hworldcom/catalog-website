import { createProductDraftImageDeliveryEngine } from "@/features/admin/server/product-draft-image-delivery.runtime";

import { SellerProductDraftImageGalleryService } from "./seller-product-draft-image-gallery.service";
import { SupabaseSellerProductDraftImageGalleryRepository } from "./supabase-product-draft-image-gallery.repository";

export async function createSellerProductDraftImageGalleryService(): Promise<SellerProductDraftImageGalleryService> {
  const [{ supabaseAdmin }, delivery] = await Promise.all([
    import("@/lib/supabase/client.server"),
    createProductDraftImageDeliveryEngine(),
  ]);

  return new SellerProductDraftImageGalleryService(
    new SupabaseSellerProductDraftImageGalleryRepository(supabaseAdmin),
    delivery,
  );
}
