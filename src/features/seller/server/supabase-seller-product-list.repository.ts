import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database, Json } from "@/lib/supabase/types";

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
import { productModerationStatusFieldsSchema } from "./supabase-product-moderation-status.repository";

type DatabaseClient = SupabaseClient<Database>;

const productRowSchema = productModerationStatusFieldsSchema
  .extend({
    title: z.string(),
    product_code: z.string().nullable(),
    cover_image_id: z.string().uuid().nullable(),
    cover_image_url: z.string().nullable(),
    price: z.coerce.number().nullable(),
    currency: z.string(),
    moq: z.number().int().nullable(),
    pack_size: z.string().nullable(),
    stock: z.enum(["in_stock", "low_stock", "out_of_stock", "made_to_order"]),
    created_at: z.string(),
  })
  .strict();

export class SupabaseSellerProductListRepository implements SellerProductListRepository {
  constructor(private readonly database: DatabaseClient) {}

  async listProducts(
    input: Parameters<SellerProductListRepository["listProducts"]>[0],
  ): Promise<SellerProductListRecord[]> {
    const response = await this.database.rpc(
      "list_seller_products_for_moderation" as never,
      {
        p_seller_id: input.sellerId,
        p_status: input.status,
        p_limit: input.limit,
        p_before_created_at: input.before?.createdAt ?? null,
        p_before_product_id: input.before?.productId ?? null,
      } as never,
    );
    if (response.error) throw productDatabaseError(response.error);
    const parsed = z.array(productRowSchema).safeParse(response.data as Json);
    if (!parsed.success) {
      throw new SellerProductListRepositoryError(
        "Seller product moderation list returned an invalid response.",
      );
    }
    return parsed.data;
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

function productDatabaseError(error: { message: string }): SellerProductListRepositoryError {
  return new SellerProductListRepositoryError(
    `Seller product database operation failed: ${error.message}`,
  );
}
