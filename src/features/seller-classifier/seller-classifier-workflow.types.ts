import { z } from "zod";

import { SellerClassifierBatchError } from "./seller-classifier-batch.types";

export type SellerClassifierUploadStatus =
  | "created"
  | "uploading"
  | "queued"
  | "processing"
  | "review_required"
  | "approved"
  | "failed"
  | "cancelled";

export type SellerClassifierUploadImageStatus =
  "pending" | "uploaded" | "processing" | "processed" | "failed";

export type SellerClassifierUploadImage = {
  imageId: string;
  uploadOrder: number;
  originalFilename: string;
  status: SellerClassifierUploadImageStatus;
  errorCode: string | null;
  retryAllowed: boolean;
};

export type SellerClassifierUploadSnapshot = {
  workflowId: string;
  status: SellerClassifierUploadStatus;
  stage: "upload" | "processing" | "review" | "approved" | "failed";
  originalFileCount: number;
  processedFileCount: number;
  finalizedAt: string | null;
  images: SellerClassifierUploadImage[];
};

export type SellerClassifierRegisteredUpload = {
  imageId: string;
  uploadOrder: number;
  originalFilename: string;
  uploadUrl: string;
};

export type SellerClassifierUploadRegistration = {
  workflowId: string;
  status: "uploading";
  uploads: SellerClassifierRegisteredUpload[];
};

export type SellerClassifierProcessingError = {
  code: "image_processing_failed" | "image_classification_failed";
  message: string;
};

export type SellerClassifierProcessingImage = {
  imageId: string;
  uploadOrder: number;
  originalFilename: string;
  imageStatus: SellerClassifierUploadImageStatus;
  processJobStatus: string | null;
  processError: SellerClassifierProcessingError | null;
  classifyJobStatus: string | null;
  classifyError: SellerClassifierProcessingError | null;
  categorySlug: string | null;
  confidence: number | null;
  hasHashes: boolean;
  hasEmbedding: boolean;
};

export type SellerClassifierProcessingSnapshot = {
  workflowId: string;
  status: "queued" | "processing" | "review_required" | "approved" | "failed" | "cancelled";
  stage: "processing" | "review" | "approved" | "failed";
  originalFileCount: number;
  processedFileCount: number;
  pipelineVersion: string;
  retryAllowed: boolean;
  images: SellerClassifierProcessingImage[];
};

export type SellerClassifierFinalizeResult = {
  upload: SellerClassifierUploadSnapshot;
  processing: SellerClassifierProcessingSnapshot | null;
};

const workflowId = z.string().uuid();
const filename = z
  .string()
  .max(512)
  .refine((value) => value.trim().length > 0);

const registerRequestSchema = z
  .object({
    workflowId,
    files: z
      .array(
        z
          .object({
            originalFilename: filename,
            mimeType: z.literal("image/jpeg"),
            sizeBytes: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

const retryRequestSchema = z
  .object({
    workflowId,
    imageIds: z.array(z.string().uuid()).min(1).max(100),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.imageIds).size !== input.imageIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["imageIds"],
        message: "Image identifiers must be unique.",
      });
    }
  });

const workflowRequestSchema = z
  .object({
    workflowId,
  })
  .strict();

export type RegisterSellerClassifierUploadsInput = z.infer<typeof registerRequestSchema>;
export type RetrySellerClassifierUploadsInput = z.infer<typeof retryRequestSchema>;

export function parseRegisterSellerClassifierUploadsInput(
  input: unknown,
): RegisterSellerClassifierUploadsInput {
  const result = registerRequestSchema.safeParse(input);
  if (!result.success) throw invalidUpload();
  return result.data;
}

export function parseRetrySellerClassifierUploadsInput(
  input: unknown,
): RetrySellerClassifierUploadsInput {
  const result = retryRequestSchema.safeParse(input);
  if (!result.success) throw invalidUpload();
  return result.data;
}

export function parseSellerClassifierCommandInput(input: unknown): {
  workflowId: string;
} {
  const result = workflowRequestSchema.safeParse(input);
  if (!result.success) throw invalidUpload();
  return result.data;
}

function invalidUpload(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    400,
    "seller_classifier_upload_invalid",
    "The classifier upload request is invalid.",
  );
}
