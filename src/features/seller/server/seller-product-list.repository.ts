import type { Database } from "@/lib/supabase/types";

import type { SellerProductListCursor } from "../seller-product-list.cursor";

export type SellerProductListRecord = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  | "id"
  | "title"
  | "cover_image_id"
  | "cover_image_url"
  | "price"
  | "currency"
  | "moq"
  | "pack_size"
  | "stock"
  | "status"
  | "created_at"
>;

export type SellerProductPreviewCandidateRecord = Pick<
  Database["public"]["Tables"]["product_draft_images"]["Row"],
  "id" | "product_draft_id" | "source_position"
>;

export interface SellerProductListRepository {
  listProducts(input: {
    sellerId: string;
    limit: number;
    before: SellerProductListCursor | null;
  }): Promise<SellerProductListRecord[]>;

  countProducts(sellerId: string): Promise<{
    productCount: number;
    publishedProductCount: number;
  }>;
}

export interface SellerProductPreviewCandidateRepository {
  listImages(productDraftIds: string[]): Promise<SellerProductPreviewCandidateRecord[]>;
}

export class SellerProductListRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SellerProductListRepositoryError";
  }
}

export class SellerProductPreviewCandidateRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SellerProductPreviewCandidateRepositoryError";
  }
}
