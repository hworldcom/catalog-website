import { createProductDraftImageDeliveryEngine } from "@/features/admin/server/product-draft-image-delivery.runtime";
import type { Database } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  SellerProductListService,
  SellerProductSummaryService,
} from "./seller-product-list.service";
import {
  SupabaseSellerProductListRepository,
  SupabaseSellerProductPreviewCandidateRepository,
} from "./supabase-seller-product-list.repository";

type RequesterClient = SupabaseClient<Database>;

export async function createSellerProductListService(
  _requesterDatabase: RequesterClient,
): Promise<SellerProductListService> {
  const [{ supabaseAdmin }, delivery] = await Promise.all([
    import("@/lib/supabase/client.server"),
    createProductDraftImageDeliveryEngine(),
  ]);
  return new SellerProductListService(
    new SupabaseSellerProductListRepository(supabaseAdmin),
    new SupabaseSellerProductPreviewCandidateRepository(supabaseAdmin),
    delivery,
  );
}

export function createSellerProductSummaryService(
  requesterDatabase: RequesterClient,
): SellerProductSummaryService {
  return new SellerProductSummaryService(
    new SupabaseSellerProductListRepository(requesterDatabase),
  );
}
