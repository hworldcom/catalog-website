import type { ProductModerationRequester } from "./product-moderation.service";
import { ProductModerationService } from "./product-moderation.service";
import { ProductModerationSellerActionsService } from "./product-moderation-seller-actions.service";
import { SupabaseProductModerationSellerActionsRepository } from "./product-moderation-seller-actions.repository";

export async function createProductModerationSellerActionsService(
  requester: ProductModerationRequester,
): Promise<ProductModerationSellerActionsService> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const administrator = supabaseAdmin as never;
  return new ProductModerationSellerActionsService(
    requester,
    new SupabaseProductModerationSellerActionsRepository(administrator),
    new ProductModerationService(requester, administrator),
    async () => {
      const { createProductModerationStatusService } =
        await import("./product-moderation-status.runtime");
      return createProductModerationStatusService();
    },
    async () => {
      const { getProductActivationRuntime } =
        await import("@/features/admin/server/product-activation.runtime");
      return getProductActivationRuntime();
    },
  );
}
