import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type {
  SellerProductPublicationProduct,
  SellerProductPublicationRepository,
} from "./seller-product-publication.repository";

type AdminClient = SupabaseClient<Database>;

export class SupabaseSellerProductPublicationRepository implements SellerProductPublicationRepository {
  constructor(private readonly database: AdminClient) {}

  async findOwnedProduct(
    productDraftId: string,
    sellerId: string,
  ): Promise<SellerProductPublicationProduct | null> {
    const product = await this.database
      .from("products")
      .select(
        "id,seller_id,title,category_id,status,cover_image_url,classifier_group_id,classifier_organization_id",
      )
      .eq("id", productDraftId)
      .eq("seller_id", sellerId)
      .maybeSingle();
    if (product.error) throw new Error("Seller product publication lookup failed.");
    if (!product.data) return null;

    const [membership, privateImage, seller] = await Promise.all([
      this.database
        .from("product_draft_source_memberships")
        .select("product_draft_id")
        .eq("product_draft_id", productDraftId)
        .limit(1)
        .maybeSingle(),
      this.database
        .from("product_draft_images")
        .select("product_draft_id")
        .eq("product_draft_id", productDraftId)
        .limit(1)
        .maybeSingle(),
      this.database
        .from("sellers")
        .select("approved_profile_submission_id")
        .eq("id", sellerId)
        .maybeSingle(),
    ]);
    if (membership.error) throw new Error("Seller product publication provenance lookup failed.");
    if (privateImage.error) throw new Error("Seller product image publication lookup failed.");
    if (seller.error) throw new Error("Seller product publication approval lookup failed.");
    if (!seller.data) throw new Error("Seller product publication approval lookup failed.");
    if (
      (product.data.classifier_group_id !== null ||
        product.data.classifier_organization_id !== null) &&
      membership.data === null
    ) {
      throw new Error("Seller product publication provenance lookup failed.");
    }

    return {
      productDraftId: product.data.id,
      sellerId: product.data.seller_id,
      title: product.data.title,
      categoryId: product.data.category_id,
      productStatus: product.data.status,
      coverImageUrl: product.data.cover_image_url,
      imagePublicationMode: membership.data || privateImage.data ? "durable" : "direct",
      sellerApproved: seller.data.approved_profile_submission_id !== null,
    };
  }
}
