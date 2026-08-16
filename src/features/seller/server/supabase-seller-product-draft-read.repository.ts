import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import { getCurrentSellerId } from "./current-seller.service";
import {
  readProductModerationEditState,
  type ProductModerationEditState,
} from "./product-moderation-edit-state";
import type { SellerProductDraftReadRepository } from "./seller-product-draft-read.service";

type RequesterClient = SupabaseClient<Database>;
type AdminClient = SupabaseClient<Database>;

export class SupabaseSellerProductDraftReadRepository implements SellerProductDraftReadRepository {
  private readonly editStates = new Map<string, ProductModerationEditState>();

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
    if (!result.data) return null;
    const state = await readProductModerationEditState(
      this.adminDatabase,
      productDraftId,
      sellerId,
    );
    if (!state) return null;
    this.editStates.set(productDraftId, state);
    return {
      ...result.data,
      title: state.snapshot.title,
      title_source: state.snapshot.titleSource,
      category_id: state.snapshot.categoryId,
      moq: state.snapshot.minimumOrder,
      pack_size: state.snapshot.packSize,
      price: state.snapshot.price,
      currency: state.snapshot.currency,
      stock: state.snapshot.stock,
      cover_image_id: state.snapshot.coverImageId,
      moderation_revision: state.revision,
    };
  }

  async getImageSourceState(productDraftId: string) {
    const [membership, image] = await Promise.all([
      this.adminDatabase
        .from("product_draft_source_memberships")
        .select("product_draft_id")
        .eq("product_draft_id", productDraftId)
        .limit(1)
        .maybeSingle(),
      this.adminDatabase
        .from("product_draft_images")
        .select("product_draft_id")
        .eq("product_draft_id", productDraftId)
        .limit(1)
        .maybeSingle(),
    ]);
    if (membership.error) throw new Error(membership.error.message);
    if (image.error) throw new Error(image.error.message);
    return {
      imageSourceMode: membership.data
        ? ("classifier_import" as const)
        : ("seller_upload" as const),
      usesDurableImagePublication: membership.data !== null || image.data !== null,
    };
  }

  async getAudiences(productDraftId: string): Promise<string[]> {
    const state = this.editStates.get(productDraftId);
    if (state) return state.snapshot.audiences;
    const response = await this.adminDatabase
      .from("product_audience_memberships")
      .select("audience")
      .eq("product_id", productDraftId)
      .order("audience");
    if (response.error) throw new Error(response.error.message);
    return (response.data ?? []).map((membership) => membership.audience);
  }

  isModerationEditable(productDraftId: string): boolean {
    return this.editStates.get(productDraftId)?.editable ?? false;
  }
}
