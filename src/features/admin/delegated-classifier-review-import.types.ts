import { z } from "zod";

import type {
  CreateSellerClassifierGroupInput,
  MergeSellerClassifierGroupsInput,
  MoveSellerClassifierImageInput,
  SelectSellerClassifierCategoryInput,
  SelectSellerClassifierCoverInput,
  SellerClassifierCategory,
  SellerClassifierGroupImageInput,
  SellerClassifierGroupInput,
  SellerClassifierReviewSnapshot,
  SetSellerClassifierDuplicateInput,
  SplitSellerClassifierGroupInput,
} from "@/features/seller-classifier/seller-classifier-review.types";
import {
  parseCreateSellerClassifierGroupInput,
  parseMergeSellerClassifierGroupsInput,
  parseMoveSellerClassifierImageInput,
  parseSelectSellerClassifierCategoryInput,
  parseSelectSellerClassifierCoverInput,
  parseSellerClassifierGroupImageInput,
  parseSellerClassifierGroupInput,
  parseSellerClassifierReviewInput,
  parseSetSellerClassifierDuplicateInput,
  parseSplitSellerClassifierGroupInput,
} from "@/features/seller-classifier/seller-classifier-review.types";
import type { SellerClassifierDraftImportSnapshot } from "@/features/seller-classifier/seller-classifier-import.types";

import type { DelegatedUploadSeller } from "./delegated-classifier-upload.types";

export type DelegatedClassifierReviewContext = {
  seller: DelegatedUploadSeller;
  review: SellerClassifierReviewSnapshot;
};

export type DelegatedClassifierCategoriesContext = {
  seller: DelegatedUploadSeller;
  categories: SellerClassifierCategory[];
};

export type DelegatedClassifierDraftImportContext = {
  seller: DelegatedUploadSeller;
  draftImport: SellerClassifierDraftImportSnapshot;
};

export type DelegatedApproveGroupInput = SellerClassifierGroupInput & {
  requestId: string;
};

export type DelegatedApproveBatchInput = {
  workflowId: string;
  requestId: string;
};

export type DelegatedRetryImportInput = DelegatedApproveBatchInput;

export type DelegatedClassifierContinuationErrorCode =
  | "delegated_review_invalid"
  | "delegated_review_resource_not_found"
  | "delegated_review_not_allowed"
  | "delegated_action_in_progress"
  | "delegated_action_request_conflict"
  | "delegated_import_retry_not_allowed"
  | "delegated_action_configuration_invalid"
  | "delegated_action_audit_unavailable"
  | "delegated_import_unavailable"
  | "delegated_classifier_unavailable";

export class DelegatedClassifierContinuationError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 409 | 500 | 503,
    public readonly code: DelegatedClassifierContinuationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DelegatedClassifierContinuationError";
  }
}

const identifier = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const auditedWorkflowSchema = z
  .object({
    workflowId: identifier,
    requestId: identifier,
  })
  .strict();
const auditedGroupSchema = auditedWorkflowSchema
  .extend({
    groupId: identifier,
  })
  .strict();

export function parseDelegatedClassifierReviewInput(input: unknown): { workflowId: string } {
  return mapSellerParser(() => parseSellerClassifierReviewInput(input));
}

export function parseDelegatedCreateGroupInput(input: unknown): CreateSellerClassifierGroupInput {
  return mapSellerParser(() => parseCreateSellerClassifierGroupInput(input));
}

export function parseDelegatedMergeGroupsInput(input: unknown): MergeSellerClassifierGroupsInput {
  return mapSellerParser(() => parseMergeSellerClassifierGroupsInput(input));
}

export function parseDelegatedSplitGroupInput(input: unknown): SplitSellerClassifierGroupInput {
  return mapSellerParser(() => parseSplitSellerClassifierGroupInput(input));
}

export function parseDelegatedMoveImageInput(input: unknown): MoveSellerClassifierImageInput {
  return mapSellerParser(() => parseMoveSellerClassifierImageInput(input));
}

export function parseDelegatedDuplicateInput(input: unknown): SetSellerClassifierDuplicateInput {
  return mapSellerParser(() => parseSetSellerClassifierDuplicateInput(input));
}

export function parseDelegatedCoverInput(input: unknown): SelectSellerClassifierCoverInput {
  return mapSellerParser(() => parseSelectSellerClassifierCoverInput(input));
}

export function parseDelegatedCategoryInput(input: unknown): SelectSellerClassifierCategoryInput {
  return mapSellerParser(() => parseSelectSellerClassifierCategoryInput(input));
}

export function parseDelegatedGroupImageInput(input: unknown): SellerClassifierGroupImageInput {
  return mapSellerParser(() => parseSellerClassifierGroupImageInput(input));
}

export function parseDelegatedApproveGroupInput(input: unknown): DelegatedApproveGroupInput {
  return parse(auditedGroupSchema, input);
}

export function parseDelegatedApproveBatchInput(input: unknown): DelegatedApproveBatchInput {
  return parse(auditedWorkflowSchema, input);
}

export function parseDelegatedRetryImportInput(input: unknown): DelegatedRetryImportInput {
  return parse(auditedWorkflowSchema, input);
}

export function delegatedReviewInvalid(): DelegatedClassifierContinuationError {
  return new DelegatedClassifierContinuationError(
    400,
    "delegated_review_invalid",
    "The delegated classifier review request is invalid.",
  );
}

export function delegatedReviewResourceNotFound(): DelegatedClassifierContinuationError {
  return new DelegatedClassifierContinuationError(
    404,
    "delegated_review_resource_not_found",
    "The delegated classifier review resource was not found.",
  );
}

export function delegatedReviewNotAllowed(): DelegatedClassifierContinuationError {
  return new DelegatedClassifierContinuationError(
    409,
    "delegated_review_not_allowed",
    "The delegated classifier review cannot be changed in its current state.",
  );
}

export function delegatedActionInProgress(): DelegatedClassifierContinuationError {
  return new DelegatedClassifierContinuationError(
    409,
    "delegated_action_in_progress",
    "The delegated administrator action is still being reconciled.",
  );
}

export function delegatedActionRequestConflict(): DelegatedClassifierContinuationError {
  return new DelegatedClassifierContinuationError(
    409,
    "delegated_action_request_conflict",
    "The delegated administrator request identifier was reused for a different action.",
  );
}

export function delegatedImportRetryNotAllowed(): DelegatedClassifierContinuationError {
  return new DelegatedClassifierContinuationError(
    409,
    "delegated_import_retry_not_allowed",
    "The delegated classifier import cannot be retried in its current state.",
  );
}

export function delegatedActionConfigurationInvalid(): DelegatedClassifierContinuationError {
  return new DelegatedClassifierContinuationError(
    500,
    "delegated_action_configuration_invalid",
    "Delegated administrator actions are not configured correctly.",
  );
}

export function delegatedActionAuditUnavailable(): DelegatedClassifierContinuationError {
  return new DelegatedClassifierContinuationError(
    500,
    "delegated_action_audit_unavailable",
    "The delegated administrator action audit is temporarily unavailable.",
  );
}

export function delegatedImportUnavailable(): DelegatedClassifierContinuationError {
  return new DelegatedClassifierContinuationError(
    500,
    "delegated_import_unavailable",
    "The delegated classifier import is temporarily unavailable.",
  );
}

export function delegatedClassifierUnavailable(): DelegatedClassifierContinuationError {
  return new DelegatedClassifierContinuationError(
    503,
    "delegated_classifier_unavailable",
    "The classifier is temporarily unavailable.",
  );
}

export function delegatedTerminalError(code: string | null): DelegatedClassifierContinuationError {
  if (code === "delegated_review_invalid") return delegatedReviewInvalid();
  if (code === "delegated_review_resource_not_found") {
    return delegatedReviewResourceNotFound();
  }
  if (code === "delegated_review_not_allowed") return delegatedReviewNotAllowed();
  if (code === "delegated_import_retry_not_allowed") {
    return delegatedImportRetryNotAllowed();
  }
  throw delegatedActionAuditUnavailable();
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw delegatedReviewInvalid();
  return result.data;
}

function mapSellerParser<T>(operation: () => T): T {
  try {
    return operation();
  } catch {
    throw delegatedReviewInvalid();
  }
}
