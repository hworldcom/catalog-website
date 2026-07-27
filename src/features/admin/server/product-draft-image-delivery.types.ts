import { z } from "zod";

import type { Database } from "@/lib/supabase/types";

import type { LegacyProductDraftImageCutoverErrorCode } from "./legacy-product-draft-image-cutover.types";

export const PRODUCT_DRAFT_IMAGE_DELIVERY_MAX_PAIRS = 100;
export const PRODUCT_DRAFT_IMAGE_DELIVERY_CONCURRENCY = 10;
export const PRODUCT_DRAFT_IMAGE_DELIVERY_OPERATION_TIMEOUT_MS = 10_000;
export const PRODUCT_DRAFT_IMAGE_DELIVERY_REQUEST_TIMEOUT_MS = 30_000;
export const PRODUCT_DRAFT_IMAGE_SIGNED_URL_LIFETIME_SECONDS = 5 * 60;

export type ConfirmedPrototypeAdministratorContext = {
  userId: string;
  prototypeAdministrator: true;
};

export type ProductDraftImageDeliveryRequestEntry = {
  productDraftId: string;
  imageIds: string[];
};

export type ProductDraftImageDeliveryInput = ProductDraftImageDeliveryRequestEntry[];

export type ProductDraftImageDurableStatus =
  Database["public"]["Enums"]["product_draft_image_status"];

export type ProductDraftImageDeliveryStatus =
  "available" | "pending" | "failed" | "missing" | "unavailable";

export type ProductDraftImageRuntimeDeliveryErrorCode =
  "private_object_missing" | "private_object_conflict" | "private_object_signing_failed";

export type ProductDraftImageDeliveryErrorCode =
  LegacyProductDraftImageCutoverErrorCode | ProductDraftImageRuntimeDeliveryErrorCode;

export type ProductDraftImageDeliveryResult = {
  imageId: string;
  durableStatus: ProductDraftImageDurableStatus | null;
  deliveryStatus: ProductDraftImageDeliveryStatus;
  deliveryErrorCode: ProductDraftImageDeliveryErrorCode | null;
  url: string | null;
  expiresAt: string | null;
};

export type ProductDraftImageDeliveryResponse = {
  entries: Array<{
    productDraftId: string;
    images: ProductDraftImageDeliveryResult[];
  }>;
};

export type ProductDraftImageDeliveryRequestErrorCode =
  | "product_draft_image_delivery_invalid"
  | "product_draft_not_found"
  | "product_draft_image_delivery_unavailable";

export class ProductDraftImageDeliveryRequestError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 500,
    public readonly code: ProductDraftImageDeliveryRequestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProductDraftImageDeliveryRequestError";
  }
}

const requestEntrySchema = z
  .object({
    productDraftId: z.string().uuid(),
    imageIds: z.array(z.string().uuid()).min(1),
  })
  .strict();

const requestSchema = z.array(requestEntrySchema).min(1);

export function parseProductDraftImageDeliveryInput(
  input: unknown,
): ProductDraftImageDeliveryInput {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw invalidDeliveryRequest();

  const productDraftIds = new Set<string>();
  let uniquePairCount = 0;
  const entries = parsed.data.map((entry) => {
    if (productDraftIds.has(entry.productDraftId)) {
      throw invalidDeliveryRequest();
    }
    productDraftIds.add(entry.productDraftId);

    const imageIds = [...new Set(entry.imageIds)];
    uniquePairCount += imageIds.length;
    if (uniquePairCount > PRODUCT_DRAFT_IMAGE_DELIVERY_MAX_PAIRS) {
      throw invalidDeliveryRequest();
    }
    return {
      productDraftId: entry.productDraftId,
      imageIds,
    };
  });

  return entries;
}

export function productDraftNotFound(): ProductDraftImageDeliveryRequestError {
  return new ProductDraftImageDeliveryRequestError(
    404,
    "product_draft_not_found",
    "The ProductDraft was not found.",
  );
}

export function productDraftImageDeliveryUnavailable(): ProductDraftImageDeliveryRequestError {
  return new ProductDraftImageDeliveryRequestError(
    500,
    "product_draft_image_delivery_unavailable",
    "ProductDraft image delivery is temporarily unavailable.",
  );
}

function invalidDeliveryRequest(): ProductDraftImageDeliveryRequestError {
  return new ProductDraftImageDeliveryRequestError(
    400,
    "product_draft_image_delivery_invalid",
    "The ProductDraft image delivery request is invalid.",
  );
}
