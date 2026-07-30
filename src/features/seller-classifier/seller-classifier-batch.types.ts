import { z } from "zod";

export type SellerClassifierBatchProvisioningStatus = "provisioning" | "ready" | "failed";

export type SellerClassifierBatchStage =
  | "provisioning"
  | "upload"
  | "processing"
  | "review"
  | "approved"
  | "importing"
  | "drafts_ready"
  | "failed";

export type SellerClassifierBatchSnapshot = {
  workflowId: string;
  provisioningStatus: SellerClassifierBatchProvisioningStatus;
  stage: SellerClassifierBatchStage;
  errorCode: string | null;
  retryAllowed: boolean;
  maxFiles: number | null;
  maxFileSizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
};

export type SellerClassifierBatchErrorCode =
  | "seller_classifier_batch_invalid"
  | "seller_not_found"
  | "seller_classifier_batch_not_found"
  | "seller_classifier_batch_provisioning_in_progress"
  | "seller_classifier_batch_provisioning_not_retryable"
  | "seller_classifier_upload_invalid"
  | "seller_classifier_upload_not_allowed"
  | "seller_classifier_processing_not_allowed"
  | "seller_classifier_review_invalid"
  | "seller_classifier_review_resource_not_found"
  | "seller_classifier_review_not_allowed"
  | "seller_classifier_thumbnail_not_found"
  | "seller_classifier_approval_invalid"
  | "seller_classifier_groups_not_approved"
  | "seller_classifier_import_ownership_conflict"
  | "seller_classifier_import_retry_not_allowed"
  | "seller_classifier_import_unavailable"
  | "seller_classifier_configuration_invalid"
  | "seller_classifier_unavailable";

export class SellerClassifierBatchError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 409 | 500 | 503,
    public readonly code: SellerClassifierBatchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SellerClassifierBatchError";
  }
}

const createRequestSchema = z
  .object({
    requestId: z.string().uuid(),
  })
  .strict();

const workflowRequestSchema = z
  .object({
    workflowId: z.string().uuid(),
  })
  .strict();

export function parseCreateSellerClassifierBatchInput(input: unknown): {
  requestId: string;
} {
  const result = createRequestSchema.safeParse(input);
  if (!result.success) throw invalidSellerClassifierBatch();
  return result.data;
}

export function parseSellerClassifierWorkflowInput(input: unknown): {
  workflowId: string;
} {
  const result = workflowRequestSchema.safeParse(input);
  if (!result.success) throw invalidSellerClassifierBatch();
  return result.data;
}

export function invalidSellerClassifierBatch(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    400,
    "seller_classifier_batch_invalid",
    "The classifier workflow request is invalid.",
  );
}
