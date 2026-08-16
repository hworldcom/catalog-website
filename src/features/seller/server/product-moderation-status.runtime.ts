import { createProductDraftImageDeliveryEngine } from "@/features/admin/server/product-draft-image-delivery.runtime";

import { ProductModerationStatusService } from "./product-moderation-status.service";
import { SupabaseProductModerationStatusRepository } from "./supabase-product-moderation-status.repository";

export async function createProductModerationStatusService(): Promise<ProductModerationStatusService> {
  const [{ supabaseAdmin }, delivery] = await Promise.all([
    import("@/lib/supabase/client.server"),
    createProductDraftImageDeliveryEngine(),
  ]);
  return new ProductModerationStatusService(
    new SupabaseProductModerationStatusRepository(supabaseAdmin),
    delivery,
  );
}
