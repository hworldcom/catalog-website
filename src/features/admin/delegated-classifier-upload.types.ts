import { z } from "zod";

import type { SellerClassifierBatchSnapshot } from "@/features/seller-classifier/seller-classifier-batch.types";
import {
  parseRegisterSellerClassifierUploadsInput,
  parseRetrySellerClassifierUploadsInput,
  parseSellerClassifierCommandInput,
  type RegisterSellerClassifierUploadsInput,
  type RetrySellerClassifierUploadsInput,
} from "@/features/seller-classifier/seller-classifier-workflow.types";

export const DELEGATED_UPLOAD_SELLER_SEARCH_DEFAULT_LIMIT = 20;
export const DELEGATED_UPLOAD_SELLER_SEARCH_MAX_LIMIT = 50;
export const DELEGATED_UPLOAD_SELLER_SEARCH_MAX_QUERY_LENGTH = 100;

export type DelegatedUploadSeller = {
  sellerId: string;
  name: string;
  slug: string;
  published: boolean;
};

export type DelegatedUploadSellerSearchRequest = {
  query: string;
  limit: number;
};

export type DelegatedUploadSellerSearchResult = {
  sellers: DelegatedUploadSeller[];
};

export type DelegatedClassifierWorkflowContext = {
  seller: DelegatedUploadSeller;
  workflow: SellerClassifierBatchSnapshot;
};

export type CreateDelegatedClassifierBatchInput = {
  sellerId: string;
  requestId: string;
};

export type DelegatedClassifierWorkflowInput = {
  workflowId: string;
};

export type DelegatedClassifierUploadErrorCode =
  | "delegated_upload_invalid"
  | "delegated_upload_seller_not_found"
  | "delegated_upload_workflow_not_found"
  | "delegated_upload_unavailable";

export class DelegatedClassifierUploadError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 503,
    public readonly code: DelegatedClassifierUploadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DelegatedClassifierUploadError";
  }
}

const sellerSearchSchema = z
  .object({
    query: z.string().max(DELEGATED_UPLOAD_SELLER_SEARCH_MAX_QUERY_LENGTH).default(""),
    limit: z
      .number()
      .int()
      .min(1)
      .max(DELEGATED_UPLOAD_SELLER_SEARCH_MAX_LIMIT)
      .default(DELEGATED_UPLOAD_SELLER_SEARCH_DEFAULT_LIMIT),
  })
  .strict();

const createSchema = z
  .object({
    sellerId: z.string().uuid(),
    requestId: z.string().uuid(),
  })
  .strict();

const workflowSchema = z
  .object({
    workflowId: z.string().uuid(),
  })
  .strict();

export function parseDelegatedUploadSellerSearchRequest(
  input: unknown,
): DelegatedUploadSellerSearchRequest {
  const result = sellerSearchSchema.safeParse(input ?? {});
  if (!result.success) throw delegatedUploadInvalid();
  return {
    query: result.data.query.trim(),
    limit: result.data.limit,
  };
}

export function parseCreateDelegatedClassifierBatchInput(
  input: unknown,
): CreateDelegatedClassifierBatchInput {
  return parseWithSchema(createSchema, input);
}

export function parseDelegatedClassifierWorkflowInput(
  input: unknown,
): DelegatedClassifierWorkflowInput {
  return parseWithSchema(workflowSchema, input);
}

export function parseDelegatedRegisterUploadsInput(
  input: unknown,
): RegisterSellerClassifierUploadsInput {
  return mapSellerParser(() => parseRegisterSellerClassifierUploadsInput(input));
}

export function parseDelegatedRetryUploadsInput(input: unknown): RetrySellerClassifierUploadsInput {
  return mapSellerParser(() => parseRetrySellerClassifierUploadsInput(input));
}

export function parseDelegatedClassifierCommandInput(
  input: unknown,
): DelegatedClassifierWorkflowInput {
  return mapSellerParser(() => parseSellerClassifierCommandInput(input));
}

export function delegatedUploadInvalid(): DelegatedClassifierUploadError {
  return new DelegatedClassifierUploadError(
    400,
    "delegated_upload_invalid",
    "The delegated classifier upload request is invalid.",
  );
}

export function delegatedUploadSellerNotFound(): DelegatedClassifierUploadError {
  return new DelegatedClassifierUploadError(
    404,
    "delegated_upload_seller_not_found",
    "The selected seller was not found.",
  );
}

export function delegatedUploadWorkflowNotFound(): DelegatedClassifierUploadError {
  return new DelegatedClassifierUploadError(
    404,
    "delegated_upload_workflow_not_found",
    "The delegated classifier workflow was not found.",
  );
}

export function delegatedUploadUnavailable(): DelegatedClassifierUploadError {
  return new DelegatedClassifierUploadError(
    503,
    "delegated_upload_unavailable",
    "Delegated classifier uploads are temporarily unavailable.",
  );
}

function parseWithSchema<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw delegatedUploadInvalid();
  return result.data;
}

function mapSellerParser<T>(operation: () => T): T {
  try {
    return operation();
  } catch {
    throw delegatedUploadInvalid();
  }
}
