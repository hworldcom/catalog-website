import { z } from "zod";

import type { Database } from "@/lib/supabase/types";

import type { AdminProductDraftSource } from "./admin-product-draft-index.types";
import type {
  ProductDraftImageDeliveryErrorCode,
  ProductDraftImageDeliveryStatus,
} from "./server/product-draft-image-delivery.types";

export type AdminProductDraftReviewRequest = {
  productDraftId: string;
};

export type AdminProductDraftReviewImage = {
  imageId: string;
  sourcePosition: number;
  status: Database["public"]["Enums"]["product_draft_image_status"];
  deliveryStatus: ProductDraftImageDeliveryStatus;
  deliveryErrorCode: ProductDraftImageDeliveryErrorCode | null;
  isCover: boolean;
  url: string | null;
  expiresAt: string | null;
};

export type AdminProductDraftReview = {
  productDraftId: string;
  productCode: string;
  title: string;
  titleSource: "human" | "model" | null;
  status: Database["public"]["Enums"]["product_status"];
  seller: {
    id: string;
    name: string;
    slug: string;
  };
  category: {
    id: string;
    name: string;
    slug: string;
  } | null;
  source: AdminProductDraftSource | null;
  coverImageId: string | null;
  previewImageId: string | null;
  previewDeliveryStatus: ProductDraftImageDeliveryStatus;
  previewDeliveryErrorCode: ProductDraftImageDeliveryErrorCode | null;
  images: AdminProductDraftReviewImage[];
  createdAt: string;
  updatedAt: string;
};

export type AdminProductDraftReviewErrorCode =
  | "admin_product_drafts_invalid"
  | "product_draft_not_found"
  | "admin_product_draft_review_unavailable";

export class AdminProductDraftReviewError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 500,
    public readonly code: AdminProductDraftReviewErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminProductDraftReviewError";
  }
}

const requestSchema = z
  .object({
    productDraftId: z.string().uuid(),
  })
  .strict();

export function parseAdminProductDraftReviewRequest(
  input: unknown,
): AdminProductDraftReviewRequest {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw invalidAdminProductDraftReviewRequest();
  return parsed.data;
}

export function invalidAdminProductDraftReviewRequest(): AdminProductDraftReviewError {
  return new AdminProductDraftReviewError(
    400,
    "admin_product_drafts_invalid",
    "The administrator ProductDraft request is invalid.",
  );
}

export function adminProductDraftNotFound(): AdminProductDraftReviewError {
  return new AdminProductDraftReviewError(
    404,
    "product_draft_not_found",
    "The ProductDraft was not found.",
  );
}

export function adminProductDraftReviewUnavailable(): AdminProductDraftReviewError {
  return new AdminProductDraftReviewError(
    500,
    "admin_product_draft_review_unavailable",
    "The administrator ProductDraft review is temporarily unavailable.",
  );
}
