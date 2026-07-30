import { z } from "zod";

import { SellerClassifierBatchError } from "./seller-classifier-batch.types";

export type SellerClassifierReviewStage = "review" | "approved";

export type SellerClassifierReviewImage = {
  imageId: string;
  originalFilename: string;
  uploadOrder: number;
  thumbnailUrl: string;
  position: number;
  isDuplicate: boolean;
  isRejected: boolean;
  duplicateOfImageId: string | null;
  membershipSource: "engine" | "exact_duplicate" | "singleton" | "manual_review";
  membershipConfidence: number | null;
};

export type SellerClassifierReviewGroup = {
  groupId: string;
  status: "proposed" | "approved";
  confidence: number | null;
  coverImageId: string | null;
  suggestedCategorySlug: string | null;
  approvedCategorySlug: string | null;
  categorySuggestionStatus: "pending" | "ready" | "unavailable" | null;
  approvedCategorySource: "machine_suggestion" | "reviewer_selection" | "reviewer_cleared" | null;
  warnings: string[];
  images: SellerClassifierReviewImage[];
};

export type SellerClassifierReviewSnapshot = {
  workflowId: string;
  stage: SellerClassifierReviewStage;
  pipelineVersion: string | null;
  groups: SellerClassifierReviewGroup[];
};

export type SellerClassifierCategory = {
  slug: string;
  name: string;
  parentSlug: string | null;
  selectableLeaf: boolean;
};

const identifier = z.string().uuid();
const identifierArray = z.array(identifier).min(1).max(100).superRefine(uniqueIdentifiers);
const categorySlug = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const workflowSchema = z.object({ workflowId: identifier }).strict();
const groupSchema = z.object({ workflowId: identifier, groupId: identifier }).strict();
const groupImageSchema = z
  .object({
    workflowId: identifier,
    groupId: identifier,
    imageId: identifier,
  })
  .strict();

const createGroupSchema = z
  .object({
    workflowId: identifier,
    imageIds: identifierArray,
  })
  .strict();

const mergeGroupsSchema = z
  .object({
    workflowId: identifier,
    targetGroupId: identifier,
    sourceGroupIds: identifierArray,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.sourceGroupIds.includes(input.targetGroupId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceGroupIds"],
        message: "The target group cannot also be a source group.",
      });
    }
  });

const splitGroupSchema = z
  .object({
    workflowId: identifier,
    groupId: identifier,
    imageIds: identifierArray,
  })
  .strict();

const moveImageSchema = z
  .object({
    workflowId: identifier,
    targetGroupId: identifier,
    imageId: identifier,
  })
  .strict();

const duplicateSchema = z
  .object({
    workflowId: identifier,
    groupId: identifier,
    imageId: identifier,
    duplicateOfImageId: identifier.nullable(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.duplicateOfImageId === input.imageId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["duplicateOfImageId"],
        message: "An image cannot be its own duplicate target.",
      });
    }
  });

const coverSchema = groupImageSchema;

const categorySchema = z
  .object({
    workflowId: identifier,
    groupId: identifier,
    categorySlug: categorySlug.nullable(),
  })
  .strict();

export type CreateSellerClassifierGroupInput = z.infer<typeof createGroupSchema>;
export type MergeSellerClassifierGroupsInput = z.infer<typeof mergeGroupsSchema>;
export type SplitSellerClassifierGroupInput = z.infer<typeof splitGroupSchema>;
export type MoveSellerClassifierImageInput = z.infer<typeof moveImageSchema>;
export type SetSellerClassifierDuplicateInput = z.infer<typeof duplicateSchema>;
export type SelectSellerClassifierCoverInput = z.infer<typeof coverSchema>;
export type SelectSellerClassifierCategoryInput = z.infer<typeof categorySchema>;
export type SellerClassifierGroupImageInput = z.infer<typeof groupImageSchema>;
export type SellerClassifierGroupInput = z.infer<typeof groupSchema>;

export function parseSellerClassifierReviewInput(input: unknown): { workflowId: string } {
  return parse(workflowSchema, input);
}

export function parseCreateSellerClassifierGroupInput(
  input: unknown,
): CreateSellerClassifierGroupInput {
  return parse(createGroupSchema, input);
}

export function parseMergeSellerClassifierGroupsInput(
  input: unknown,
): MergeSellerClassifierGroupsInput {
  return parse(mergeGroupsSchema, input);
}

export function parseSplitSellerClassifierGroupInput(
  input: unknown,
): SplitSellerClassifierGroupInput {
  return parse(splitGroupSchema, input);
}

export function parseMoveSellerClassifierImageInput(
  input: unknown,
): MoveSellerClassifierImageInput {
  return parse(moveImageSchema, input);
}

export function parseSetSellerClassifierDuplicateInput(
  input: unknown,
): SetSellerClassifierDuplicateInput {
  return parse(duplicateSchema, input);
}

export function parseSelectSellerClassifierCoverInput(
  input: unknown,
): SelectSellerClassifierCoverInput {
  return parse(coverSchema, input);
}

export function parseSelectSellerClassifierCategoryInput(
  input: unknown,
): SelectSellerClassifierCategoryInput {
  return parse(categorySchema, input);
}

export function parseSellerClassifierGroupImageInput(
  input: unknown,
): SellerClassifierGroupImageInput {
  return parse(groupImageSchema, input);
}

export function parseSellerClassifierGroupInput(input: unknown): SellerClassifierGroupInput {
  return parse(groupSchema, input);
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw invalidReview();
  return result.data;
}

function uniqueIdentifiers(values: string[], context: z.RefinementCtx): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Identifiers must be unique.",
    });
  }
}

export function invalidReview(
  message = "The classifier review request is invalid.",
): SellerClassifierBatchError {
  return new SellerClassifierBatchError(400, "seller_classifier_review_invalid", message);
}
