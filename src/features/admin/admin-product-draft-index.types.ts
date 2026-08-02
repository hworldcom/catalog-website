import { z } from "zod";

import type { Database } from "@/lib/supabase/types";

import type {
  ProductDraftImageDeliveryErrorCode,
  ProductDraftImageDeliveryStatus,
} from "./server/product-draft-image-delivery.types";

export const ADMIN_PRODUCT_DRAFT_INDEX_DEFAULT_LIMIT = 25;
export const ADMIN_PRODUCT_DRAFT_INDEX_MAX_LIMIT = 100;
export const ADMIN_PRODUCT_DRAFT_STATUSES = ["draft", "published", "archived"] as const;

export type AdminProductDraftStatus = Database["public"]["Enums"]["product_status"];

export type AdminProductDraftIndexRequest = {
  limit: number;
  cursor: string | null;
  status: AdminProductDraftStatus | null;
  sellerId: string | null;
};

export type AdminProductDraftSource = {
  classifierOrganizationId: string;
  classifierBatchId: string;
  classifierGroupId: string;
};

export type AdminProductDraftPreview = {
  deliveryStatus: ProductDraftImageDeliveryStatus;
  deliveryErrorCode: ProductDraftImageDeliveryErrorCode | null;
  url: string | null;
  expiresAt: string | null;
};

export type AdminProductDraftIndexItem = {
  productDraftId: string;
  productCode: string;
  title: string;
  status: AdminProductDraftStatus;
  seller: {
    id: string;
    name: string;
    slug: string;
  };
  category: {
    id: string;
    slug: string;
    name: string;
  } | null;
  factsRevision: number | null;
  source: AdminProductDraftSource | null;
  coverImageId: string | null;
  previewImageId: string | null;
  preview: AdminProductDraftPreview;
  createdAt: string;
  updatedAt: string;
};

export type AdminProductDraftIndexPage = {
  items: AdminProductDraftIndexItem[];
  nextCursor: string | null;
};

export type AdminProductDraftIndexErrorCode =
  | "admin_product_drafts_invalid"
  | "product_draft_source_inconsistent"
  | "admin_product_drafts_unavailable";

export class AdminProductDraftIndexError extends Error {
  constructor(
    public readonly statusCode: 400 | 500,
    public readonly code: AdminProductDraftIndexErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminProductDraftIndexError";
  }
}

const requestSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(ADMIN_PRODUCT_DRAFT_INDEX_MAX_LIMIT)
      .default(ADMIN_PRODUCT_DRAFT_INDEX_DEFAULT_LIMIT),
    cursor: z.string().min(1).nullable().optional(),
    status: z.enum(ADMIN_PRODUCT_DRAFT_STATUSES).nullable().optional(),
    sellerId: z.string().uuid().nullable().optional(),
  })
  .strict();

export function parseAdminProductDraftIndexRequest(input: unknown): AdminProductDraftIndexRequest {
  const parsed = requestSchema.safeParse(input ?? {});
  if (!parsed.success) throw invalidAdminProductDraftIndexRequest();

  return {
    limit: parsed.data.limit,
    cursor: parsed.data.cursor ?? null,
    status: parsed.data.status ?? null,
    sellerId: parsed.data.sellerId ?? null,
  };
}

export function invalidAdminProductDraftIndexRequest(): AdminProductDraftIndexError {
  return new AdminProductDraftIndexError(
    400,
    "admin_product_drafts_invalid",
    "The administrator ProductDraft request is invalid.",
  );
}

export function productDraftSourceInconsistent(): AdminProductDraftIndexError {
  return new AdminProductDraftIndexError(
    500,
    "product_draft_source_inconsistent",
    "The ProductDraft classifier source is inconsistent.",
  );
}

export function adminProductDraftsUnavailable(): AdminProductDraftIndexError {
  return new AdminProductDraftIndexError(
    500,
    "admin_product_drafts_unavailable",
    "Administrator ProductDrafts are temporarily unavailable.",
  );
}
