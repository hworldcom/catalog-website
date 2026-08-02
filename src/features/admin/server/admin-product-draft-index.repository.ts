import type { Database } from "@/lib/supabase/types";

import type { AdminProductDraftStatus } from "../admin-product-draft-index.types";
import type { AdminProductDraftIndexCursor } from "../admin-product-draft-index.cursor";

export type AdminProductDraftIndexProductRecord = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  | "id"
  | "product_code"
  | "title"
  | "status"
  | "seller_id"
  | "category_id"
  | "cover_image_id"
  | "created_at"
  | "updated_at"
>;

export type AdminProductDraftIndexSellerRecord = Pick<
  Database["public"]["Tables"]["sellers"]["Row"],
  "id" | "name" | "slug"
>;

export type AdminProductDraftIndexCategoryRecord = Pick<
  Database["public"]["Tables"]["categories"]["Row"],
  "id" | "name" | "slug"
>;

export type AdminProductDraftIndexFactsRecord = Pick<
  Database["public"]["Tables"]["product_draft_facts"]["Row"],
  "product_draft_id" | "facts_revision"
>;

export type AdminProductDraftIndexSourceRecord = Pick<
  Database["public"]["Tables"]["product_draft_source_memberships"]["Row"],
  "product_draft_id" | "classifier_organization_id" | "classifier_batch_id" | "classifier_group_id"
>;

export type AdminProductDraftIndexImageRecord = Pick<
  Database["public"]["Tables"]["product_draft_images"]["Row"],
  "id" | "product_draft_id" | "source_position"
>;

export type AdminProductDraftIndexQuery = {
  limit: number;
  status: AdminProductDraftStatus | null;
  sellerId: string | null;
  before: AdminProductDraftIndexCursor | null;
};

export type AdminProductDraftIndexDetails = {
  sellers: AdminProductDraftIndexSellerRecord[];
  categories: AdminProductDraftIndexCategoryRecord[];
  facts: AdminProductDraftIndexFactsRecord[];
  sources: AdminProductDraftIndexSourceRecord[];
  images: AdminProductDraftIndexImageRecord[];
};

export interface AdminProductDraftIndexRepository {
  listProducts(query: AdminProductDraftIndexQuery): Promise<AdminProductDraftIndexProductRecord[]>;
  loadDetails(
    products: AdminProductDraftIndexProductRecord[],
  ): Promise<AdminProductDraftIndexDetails>;
}

export class AdminProductDraftIndexRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminProductDraftIndexRepositoryError";
  }
}
