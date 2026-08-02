import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { parseStoredProductDraftTitleSource } from "@/features/product-draft-title/product-draft-title.types";

import type {
  AdminProductDraftReviewData,
  AdminProductDraftReviewRepository,
} from "./admin-product-draft-review.repository";
import { AdminProductDraftReviewRepositoryError } from "./admin-product-draft-review.repository";

type AdminClient = SupabaseClient<Database>;

const productFields =
  "id,product_code,title,title_source,status,seller_id,category_id,cover_image_id,created_at,updated_at" as const;

export class SupabaseAdminProductDraftReviewRepository implements AdminProductDraftReviewRepository {
  constructor(private readonly database: AdminClient) {}

  async load(productDraftId: string): Promise<AdminProductDraftReviewData | null> {
    const productResponse = await this.database
      .from("products")
      .select(productFields)
      .eq("id", productDraftId)
      .maybeSingle();
    if (productResponse.error) throwDatabaseError(productResponse.error);
    if (!productResponse.data) return null;

    let titleSource;
    try {
      titleSource = parseStoredProductDraftTitleSource(productResponse.data.title_source);
    } catch {
      throwDatabaseError({ message: "Stored ProductDraft title source is invalid." });
    }
    const product = {
      ...productResponse.data,
      title_source: titleSource,
    };
    const [sellerResponse, categoryResponse, sourcesResponse, imagesResponse] = await Promise.all([
      this.database
        .from("sellers")
        .select("id,name,slug")
        .eq("id", product.seller_id)
        .maybeSingle(),
      product.category_id
        ? this.database
            .from("categories")
            .select("id,name,slug")
            .eq("id", product.category_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      this.database
        .from("product_draft_source_memberships")
        .select(
          "product_draft_id,classifier_organization_id,classifier_batch_id,classifier_group_id",
        )
        .eq("product_draft_id", productDraftId),
      this.database
        .from("product_draft_images")
        .select("id,product_draft_id,source_position,status")
        .eq("product_draft_id", productDraftId)
        .order("source_position", { ascending: true })
        .order("id", { ascending: true }),
    ]);

    for (const response of [sellerResponse, categoryResponse, sourcesResponse, imagesResponse]) {
      if (response.error) throwDatabaseError(response.error);
    }

    return {
      product,
      seller: sellerResponse.data,
      category: categoryResponse.data,
      sources: sourcesResponse.data ?? [],
      images: imagesResponse.data ?? [],
    };
  }
}

function throwDatabaseError(error: { message: string }): never {
  throw new AdminProductDraftReviewRepositoryError(
    `Administrator ProductDraft review database read failed: ${error.message}`,
  );
}
