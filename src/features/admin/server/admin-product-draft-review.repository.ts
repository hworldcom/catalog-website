import type { Database } from "@/lib/supabase/types";
import type { ProductDraftTitleSource } from "@/features/product-draft-title/product-draft-title.types";

import type {
  AdminProductDraftIndexCategoryRecord,
  AdminProductDraftIndexSellerRecord,
  AdminProductDraftIndexSourceRecord,
} from "./admin-product-draft-index.repository";

export type AdminProductDraftReviewProductRecord = Omit<
  Pick<
    Database["public"]["Tables"]["products"]["Row"],
    | "id"
    | "product_code"
    | "title"
    | "title_source"
    | "status"
    | "seller_id"
    | "category_id"
    | "cover_image_id"
    | "created_at"
    | "updated_at"
  >,
  "title_source"
> & {
  title_source: ProductDraftTitleSource;
};

export type AdminProductDraftReviewImageRecord = Pick<
  Database["public"]["Tables"]["product_draft_images"]["Row"],
  "id" | "product_draft_id" | "source_position" | "status"
>;

export type AdminProductDraftReviewData = {
  product: AdminProductDraftReviewProductRecord;
  seller: AdminProductDraftIndexSellerRecord | null;
  category: AdminProductDraftIndexCategoryRecord | null;
  sources: AdminProductDraftIndexSourceRecord[];
  images: AdminProductDraftReviewImageRecord[];
};

export interface AdminProductDraftReviewRepository {
  load(productDraftId: string): Promise<AdminProductDraftReviewData | null>;
}

export class AdminProductDraftReviewRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminProductDraftReviewRepositoryError";
  }
}
