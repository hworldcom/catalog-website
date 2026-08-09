import { z } from "zod";

import type { Database } from "@/lib/supabase/types";

import type {
  ProductDraftImageDeliveryErrorCode,
  ProductDraftImageDeliveryStatus,
} from "@/features/admin/server/product-draft-image-delivery.types";

export const SELLER_PRODUCT_LIST_DEFAULT_LIMIT = 25;
export const SELLER_PRODUCT_LIST_MAX_LIMIT = 100;

export type SellerProductListRequest = {
  limit: number;
  cursor: string | null;
};

export type SellerProductPreviewSource = "public_cover" | "private_draft" | "none" | "unavailable";

export type SellerProductPreview = {
  source: SellerProductPreviewSource;
  imageId: string | null;
  deliveryStatus: ProductDraftImageDeliveryStatus | null;
  deliveryErrorCode: ProductDraftImageDeliveryErrorCode | null;
  url: string | null;
  expiresAt: string | null;
};

export type SellerProductListItem = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  | "id"
  | "title"
  | "product_code"
  | "cover_image_url"
  | "price"
  | "currency"
  | "moq"
  | "pack_size"
  | "stock"
  | "status"
  | "created_at"
> & {
  preview: SellerProductPreview;
};

export type SellerProductListPage = {
  products: SellerProductListItem[];
  nextCursor: string | null;
  previewDelivery: {
    status: "available" | "unavailable";
    errorCode: "product_draft_image_delivery_unavailable" | null;
  };
};

export type SellerProductSummary = {
  productCount: number;
  publishedProductCount: number;
};

export type SellerProductListErrorCode =
  | "seller_product_list_invalid"
  | "seller_product_list_unavailable"
  | "seller_product_summary_unavailable";

export class SellerProductListError extends Error {
  constructor(
    public readonly statusCode: 400 | 500,
    public readonly code: SellerProductListErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SellerProductListError";
  }
}

const requestSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(SELLER_PRODUCT_LIST_MAX_LIMIT)
      .default(SELLER_PRODUCT_LIST_DEFAULT_LIMIT),
    cursor: z.string().trim().min(1).nullable().default(null),
  })
  .strict();

export function parseSellerProductListRequest(input: unknown): SellerProductListRequest {
  const parsed = requestSchema.safeParse(input ?? {});
  if (!parsed.success) throw invalidSellerProductListRequest();
  return parsed.data;
}

export function emptySellerProductListPage(): SellerProductListPage {
  return {
    products: [],
    nextCursor: null,
    previewDelivery: {
      status: "available",
      errorCode: null,
    },
  };
}

export function emptySellerProductSummary(): SellerProductSummary {
  return {
    productCount: 0,
    publishedProductCount: 0,
  };
}

export function invalidSellerProductListRequest(): SellerProductListError {
  return new SellerProductListError(
    400,
    "seller_product_list_invalid",
    "The seller product list request is invalid.",
  );
}

export function sellerProductListUnavailable(): SellerProductListError {
  return new SellerProductListError(
    500,
    "seller_product_list_unavailable",
    "The seller product list is temporarily unavailable.",
  );
}

export function sellerProductSummaryUnavailable(): SellerProductListError {
  return new SellerProductListError(
    500,
    "seller_product_summary_unavailable",
    "The seller product summary is temporarily unavailable.",
  );
}
