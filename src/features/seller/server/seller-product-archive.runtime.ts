import { SellerProductArchiveService } from "./seller-product-archive.service";
import { SupabaseSellerProductArchiveRepository } from "./supabase-seller-product-archive.repository";

export async function createSellerProductArchiveService(): Promise<SellerProductArchiveService> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return new SellerProductArchiveService(new SupabaseSellerProductArchiveRepository(supabaseAdmin));
}
