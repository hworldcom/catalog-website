import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import { getCurrentSellerId } from "./current-seller.service";
import type { SellerProductDraftReadRepository } from "./seller-product-draft-read.service";

type RequesterClient = SupabaseClient<Database>;
type AdminClient = SupabaseClient<Database>;

export class SupabaseSellerProductDraftReadRepository implements SellerProductDraftReadRepository {
  constructor(
    private readonly database: RequesterClient,
    private readonly adminDatabase: AdminClient,
  ) {}

  async findSellerId(userId: string): Promise<string | null> {
    return getCurrentSellerId({
      supabase: this.database,
      userId,
    });
  }

  async findOwnedProduct(productDraftId: string, sellerId: string) {
    const result = await this.database
      .from("products")
      .select("*")
      .eq("id", productDraftId)
      .eq("seller_id", sellerId)
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  async hasSourceMembership(productDraftId: string): Promise<boolean> {
    const result = await this.adminDatabase
      .from("product_draft_source_memberships")
      .select("product_draft_id")
      .eq("product_draft_id", productDraftId)
      .limit(1)
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    return result.data !== null;
  }
}
