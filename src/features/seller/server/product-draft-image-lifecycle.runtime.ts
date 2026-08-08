import { ProductDraftImageLifecycleService } from "./product-draft-image-lifecycle.service";
import { SupabaseProductDraftImageLifecycleRepository } from "./supabase-product-draft-image-lifecycle.repository";
import { SupabaseProductDraftImageLifecycleStorage } from "./product-draft-image-lifecycle.storage";

export async function createProductDraftImageLifecycleService(): Promise<ProductDraftImageLifecycleService> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "product_draft_image_lifecycle_configuration_invalid: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }

  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return new ProductDraftImageLifecycleService(
    new SupabaseProductDraftImageLifecycleRepository(supabaseAdmin),
    new SupabaseProductDraftImageLifecycleStorage({
      database: supabaseAdmin,
      supabaseUrl,
      serviceRoleKey,
    }),
  );
}
