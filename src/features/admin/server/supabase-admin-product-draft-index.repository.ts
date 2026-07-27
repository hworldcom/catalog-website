import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type {
  AdminProductDraftIndexDetails,
  AdminProductDraftIndexProductRecord,
  AdminProductDraftIndexQuery,
  AdminProductDraftIndexRepository,
} from "./admin-product-draft-index.repository";
import { AdminProductDraftIndexRepositoryError } from "./admin-product-draft-index.repository";

type AdminClient = SupabaseClient<Database>;

const productFields =
  "id,title,status,seller_id,category_id,cover_image_id,created_at,updated_at" as const;

export class SupabaseAdminProductDraftIndexRepository implements AdminProductDraftIndexRepository {
  constructor(private readonly database: AdminClient) {}

  async listProducts(
    input: AdminProductDraftIndexQuery,
  ): Promise<AdminProductDraftIndexProductRecord[]> {
    let query = this.database
      .from("products")
      .select(productFields)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(input.limit);

    if (input.status) query = query.eq("status", input.status);
    if (input.sellerId) query = query.eq("seller_id", input.sellerId);
    if (input.before) {
      const createdAt = quotePostgrestValue(input.before.createdAt);
      query = query.or(
        `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${input.before.productDraftId})`,
      );
    }

    const response = await query;
    if (response.error) throwDatabaseError(response.error);
    return response.data;
  }

  async loadDetails(
    products: AdminProductDraftIndexProductRecord[],
  ): Promise<AdminProductDraftIndexDetails> {
    if (products.length === 0) {
      return { sellers: [], categories: [], facts: [], sources: [], images: [] };
    }

    const productDraftIds = products.map((product) => product.id);
    const sellerIds = [...new Set(products.map((product) => product.seller_id))];
    const categoryIds = [
      ...new Set(products.flatMap((product) => (product.category_id ? [product.category_id] : []))),
    ];

    const [sellers, categories, facts, sources, images] = await Promise.all([
      this.database.from("sellers").select("id,name,slug").in("id", sellerIds),
      categoryIds.length
        ? this.database.from("categories").select("id,name,slug").in("id", categoryIds)
        : Promise.resolve({ data: [], error: null }),
      this.database
        .from("product_draft_facts")
        .select("product_draft_id,facts_revision")
        .in("product_draft_id", productDraftIds),
      this.database
        .from("product_draft_source_memberships")
        .select(
          "product_draft_id,classifier_organization_id,classifier_batch_id,classifier_group_id",
        )
        .in("product_draft_id", productDraftIds),
      this.database
        .from("product_draft_images")
        .select("id,product_draft_id,source_position")
        .in("product_draft_id", productDraftIds)
        .order("source_position", { ascending: true })
        .order("id", { ascending: true }),
    ]);

    for (const response of [sellers, categories, facts, sources, images]) {
      if (response.error) throwDatabaseError(response.error);
    }

    return {
      sellers: sellers.data ?? [],
      categories: categories.data ?? [],
      facts: facts.data ?? [],
      sources: sources.data ?? [],
      images: images.data ?? [],
    };
  }
}

function quotePostgrestValue(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function throwDatabaseError(error: { message: string }): never {
  throw new AdminProductDraftIndexRepositoryError(
    `Administrator ProductDraft database read failed: ${error.message}`,
  );
}
