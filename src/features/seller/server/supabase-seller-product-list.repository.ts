import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type {
  SellerProductListRecord,
  SellerProductListRepository,
  SellerProductPreviewCandidateRecord,
  SellerProductPreviewCandidateRepository,
} from "./seller-product-list.repository";
import {
  SellerProductListRepositoryError,
  SellerProductPreviewCandidateRepositoryError,
} from "./seller-product-list.repository";

type DatabaseClient = SupabaseClient<Database>;

const productFields =
  "id,title,product_code,cover_image_id,cover_image_url,price,currency,moq,pack_size,stock,status,created_at" as const;

export class SupabaseSellerProductListRepository implements SellerProductListRepository {
  constructor(private readonly database: DatabaseClient) {}

  async listProducts(
    input: Parameters<SellerProductListRepository["listProducts"]>[0],
  ): Promise<SellerProductListRecord[]> {
    let query = this.database
      .from("products")
      .select(productFields)
      .eq("seller_id", input.sellerId)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(input.limit);

    if (input.before) {
      const createdAt = quotePostgrestValue(input.before.createdAt);
      query = query.or(
        `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${input.before.productId})`,
      );
    }

    const response = await query;
    if (response.error) throw productDatabaseError(response.error);
    return response.data ?? [];
  }

  async countProducts(sellerId: string) {
    const [allProducts, publishedProducts] = await Promise.all([
      this.database
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", sellerId)
        .neq("status", "archived"),
      this.database
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", sellerId)
        .eq("status", "published"),
    ]);

    if (allProducts.error) throw productDatabaseError(allProducts.error);
    if (publishedProducts.error) throw productDatabaseError(publishedProducts.error);
    if (allProducts.count === null || publishedProducts.count === null) {
      throw new SellerProductListRepositoryError(
        "Seller product summary did not return exact counts.",
      );
    }

    return {
      productCount: allProducts.count,
      publishedProductCount: publishedProducts.count,
    };
  }
}

export class SupabaseSellerProductPreviewCandidateRepository implements SellerProductPreviewCandidateRepository {
  constructor(private readonly database: DatabaseClient) {}

  async listImages(productDraftIds: string[]): Promise<SellerProductPreviewCandidateRecord[]> {
    if (productDraftIds.length === 0) return [];

    const response = await this.database
      .from("product_draft_images")
      .select("id,product_draft_id,source_position")
      .in("product_draft_id", productDraftIds)
      .order("source_position", { ascending: true })
      .order("id", { ascending: true });
    if (response.error) {
      throw new SellerProductPreviewCandidateRepositoryError(
        `Seller product preview candidate query failed: ${response.error.message}`,
      );
    }
    return response.data ?? [];
  }
}

function quotePostgrestValue(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function productDatabaseError(error: { message: string }): SellerProductListRepositoryError {
  return new SellerProductListRepositoryError(
    `Seller product database operation failed: ${error.message}`,
  );
}
