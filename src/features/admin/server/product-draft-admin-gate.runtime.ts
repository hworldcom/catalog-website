import { ProductDraftAdminGate, readAdminProductDraftsEnabled } from "./product-draft-admin-gate";
import { SupabaseProductDraftImageCutoverStatusReader } from "./supabase-product-draft-admin-gate";

let gatePromise: Promise<ProductDraftAdminGate> | undefined;

export function getProductDraftAdminGate(): Promise<ProductDraftAdminGate> {
  gatePromise ??= createProductDraftAdminGate();
  return gatePromise;
}

async function createProductDraftAdminGate(): Promise<ProductDraftAdminGate> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return new ProductDraftAdminGate(
    new SupabaseProductDraftImageCutoverStatusReader(supabaseAdmin),
    readAdminProductDraftsEnabled(),
  );
}
