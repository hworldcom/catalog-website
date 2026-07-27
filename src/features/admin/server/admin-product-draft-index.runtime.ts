import type { ConfirmedPrototypeAdministratorContext } from "./product-draft-image-delivery.types";
import { createProductDraftImageDeliveryService } from "./product-draft-image-delivery.runtime";
import { AdminProductDraftIndexService } from "./admin-product-draft-index.service";
import { SupabaseAdminProductDraftIndexRepository } from "./supabase-admin-product-draft-index.repository";

export async function createAdminProductDraftIndexService(
  authorization: ConfirmedPrototypeAdministratorContext,
): Promise<AdminProductDraftIndexService> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const imageDelivery = await createProductDraftImageDeliveryService(authorization);
  return new AdminProductDraftIndexService(
    new SupabaseAdminProductDraftIndexRepository(supabaseAdmin),
    imageDelivery,
  );
}
