import type { Database } from "@/lib/supabase/types";

import type { ProductDraftTitleSource, ProductDraftTitleStatus } from "./product-draft-title.types";

type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

export type ProductDraftTitleRecord = {
  productDraftId: string;
  title: string;
  titleSource: ProductDraftTitleSource;
  productStatus: ProductDraftTitleStatus;
};

export type HumanProductDraftTitleWrite = {
  title: string;
  titleSource: "human" | null;
};

export type SellerProductFields = Pick<
  ProductUpdate,
  "moq" | "pack_size" | "price" | "currency" | "stock" | "cover_image_url" | "trending" | "status"
> & {
  category_id?: string | null;
  description?: string | null;
};

export type ProductDraftTitleUpdateResult =
  | ({ result: "updated" } & ProductDraftTitleRecord)
  | { result: "not_found" }
  | {
      result: "not_editable";
      productDraftId: string;
      productStatus: ProductDraftTitleStatus;
    }
  | { result: "title_required" }
  | { result: "title_invalid" }
  | { result: "invalid" };

export type ProductDraftTitleCreateResult =
  | ({ result: "created" } & ProductDraftTitleRecord)
  | { result: "title_required" }
  | { result: "title_invalid" }
  | {
      result:
        | "product_category_required"
        | "product_category_not_supported"
        | "product_code_company_unconfigured"
        | "product_code_category_unconfigured"
        | "product_code_allocation_failed";
    }
  | { result: "invalid" };

export interface ProductDraftTitleRepository {
  get(
    productDraftId: string,
    expectedSellerId: string | null,
  ): Promise<ProductDraftTitleRecord | null>;

  update(
    productDraftId: string,
    expectedSellerId: string,
    titleWrite: HumanProductDraftTitleWrite | null,
    productFields: SellerProductFields,
  ): Promise<ProductDraftTitleUpdateResult>;

  updateTitle(
    productDraftId: string,
    expectedSellerId: string | null,
    titleWrite: HumanProductDraftTitleWrite,
  ): Promise<ProductDraftTitleUpdateResult>;

  create(
    sellerId: string,
    titleWrite: HumanProductDraftTitleWrite,
    productFields: SellerProductFields,
  ): Promise<ProductDraftTitleCreateResult>;
}
