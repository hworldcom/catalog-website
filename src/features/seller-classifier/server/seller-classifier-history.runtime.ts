import { SellerClassifierHistoryService } from "./seller-classifier-history.service";
import { SupabaseSellerClassifierHistoryRepository } from "./supabase-seller-classifier-history.repository";

let servicePromise: Promise<SellerClassifierHistoryService> | undefined;

export function getSellerClassifierHistoryService(): Promise<SellerClassifierHistoryService> {
  servicePromise ??= createSellerClassifierHistoryService();
  return servicePromise;
}

export async function createSellerClassifierHistoryService(): Promise<SellerClassifierHistoryService> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return new SellerClassifierHistoryService(
    new SupabaseSellerClassifierHistoryRepository(supabaseAdmin),
  );
}
