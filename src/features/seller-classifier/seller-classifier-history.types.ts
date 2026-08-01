import { z } from "zod";

import type { SellerClassifierBatchStage } from "./seller-classifier-batch.types";

export const SELLER_CLASSIFIER_HISTORY_DEFAULT_LIMIT = 25;
export const SELLER_CLASSIFIER_HISTORY_MAX_LIMIT = 100;

export type SellerClassifierHistoryRequest = {
  cursor: string | null;
  limit: number;
};

export type SellerClassifierHistoryErrorSummaryCode =
  | "provisioning_failed"
  | "processing_failed"
  | "import_incomplete"
  | "import_failed"
  | "unexpected_failure";

export type SellerClassifierHistoryPrimaryAction =
  "none" | "retry_provisioning" | "open_upload" | "open_processing" | "open_review" | "open_import";

export type SellerClassifierHistoryProductAccessAction = "none" | "open_products";

export type SellerClassifierHistoryItem = {
  workflowId: string;
  initiatorKind: "seller" | "administrator";
  createdAt: string;
  updatedAt: string;
  stage: SellerClassifierBatchStage;
  counts: {
    originalFiles: number | null;
    processedFiles: number | null;
    groups: number | null;
    productDrafts: number | null;
  };
  errorSummaryCode: SellerClassifierHistoryErrorSummaryCode | null;
  supportReference: string | null;
  primaryAction: SellerClassifierHistoryPrimaryAction;
  productAccessAction: SellerClassifierHistoryProductAccessAction;
};

export type SellerClassifierHistoryPage = {
  workflows: SellerClassifierHistoryItem[];
  nextCursor: string | null;
};

export type SellerClassifierHistoryErrorCode =
  | "seller_classifier_history_invalid"
  | "seller_not_found"
  | "seller_classifier_history_unavailable";

export class SellerClassifierHistoryError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 503,
    public readonly code: SellerClassifierHistoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SellerClassifierHistoryError";
  }
}

const requestSchema = z
  .object({
    cursor: z.string().trim().min(1).nullable().default(null),
    limit: z
      .number()
      .int()
      .min(1)
      .max(SELLER_CLASSIFIER_HISTORY_MAX_LIMIT)
      .default(SELLER_CLASSIFIER_HISTORY_DEFAULT_LIMIT),
  })
  .strict();

export function parseSellerClassifierHistoryRequest(
  input: unknown,
): SellerClassifierHistoryRequest {
  const parsed = requestSchema.safeParse(input ?? {});
  if (!parsed.success) throw invalidSellerClassifierHistoryRequest();
  return parsed.data;
}

export function invalidSellerClassifierHistoryRequest(): SellerClassifierHistoryError {
  return new SellerClassifierHistoryError(
    400,
    "seller_classifier_history_invalid",
    "The classifier workflow history request is invalid.",
  );
}

export function sellerClassifierHistoryUnavailable(): SellerClassifierHistoryError {
  return new SellerClassifierHistoryError(
    503,
    "seller_classifier_history_unavailable",
    "Classifier workflow history is temporarily unavailable.",
  );
}
