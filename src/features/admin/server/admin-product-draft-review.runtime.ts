import type { ConfirmedPrototypeAdministratorContext } from "./product-draft-image-delivery.types";
import { createProductDraftImageDeliveryService } from "./product-draft-image-delivery.runtime";
import { AdminProductDraftReviewService } from "./admin-product-draft-review.service";
import { SupabaseAdminProductDraftReviewRepository } from "./supabase-admin-product-draft-review.repository";

export async function createAdminProductDraftReviewService(
  authorization: ConfirmedPrototypeAdministratorContext,
): Promise<AdminProductDraftReviewService> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const imageDelivery = await createProductDraftImageDeliveryService(authorization);
  return new AdminProductDraftReviewService(
    new SupabaseAdminProductDraftReviewRepository(supabaseAdmin),
    imageDelivery,
  );
}
