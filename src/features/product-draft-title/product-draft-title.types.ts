import { z } from "zod";

export const PRODUCT_DRAFT_TITLE_MAX_LENGTH = 50;

export type ProductDraftTitleSource = "human" | "model" | null;
export type ProductDraftTitleStatus = "draft" | "published" | "archived";

export type ProductDraftTitleSnapshot = {
  productDraftId: string;
  moderationRevision: number;
  title: string;
  titleSource: ProductDraftTitleSource;
  productStatus: ProductDraftTitleStatus;
  editable: boolean;
};

export type GetProductDraftTitleInput = {
  productDraftId: string;
};

export type UpdateProductDraftTitleInput = {
  productDraftId: string;
  expectedModerationRevision: number;
  title: string;
};

export type ProductDraftTitleErrorStatus = 400 | 404 | 409 | 500 | 503;

export class ProductDraftTitleError extends Error {
  constructor(
    public readonly statusCode: ProductDraftTitleErrorStatus,
    public readonly code:
      | "product_draft_title_invalid"
      | "product_draft_title_required"
      | "product_draft_not_found"
      | "product_draft_title_not_editable"
      | "product_category_required"
      | "product_audience_invalid"
      | "product_audience_product_not_found"
      | "product_audience_moderation_required"
      | "product_publication_audience_required"
      | "product_publication_category_required"
      | "product_category_not_supported"
      | "product_code_company_unconfigured"
      | "product_code_category_unconfigured"
      | "product_code_allocation_failed"
      | "product_code_immutable"
      | "product_moderation_submission_conflict"
      | "product_moderation_working_revision_conflict"
      | "product_draft_title_unavailable",
    message: string,
  ) {
    super(message);
    this.name = "ProductDraftTitleError";
  }
}

const getRequestSchema = z
  .object({
    productDraftId: z.string().uuid(),
  })
  .strict();

const updateRequestSchema = z
  .object({
    productDraftId: z.string().uuid(),
    expectedModerationRevision: z.number().int().positive(),
    title: z.string(),
  })
  .strict();

export function parseGetProductDraftTitleInput(input: unknown): GetProductDraftTitleInput {
  return parseRequest(getRequestSchema, input);
}

export function parseUpdateProductDraftTitleInput(input: unknown): UpdateProductDraftTitleInput {
  return parseRequest(updateRequestSchema, input);
}

export function normalizeProductDraftTitle(input: string): string {
  const normalized = input.trim().replace(/\s+/gu, " ");
  if (Array.from(normalized).length > PRODUCT_DRAFT_TITLE_MAX_LENGTH) {
    throw invalidProductDraftTitle();
  }
  return normalized;
}

export function parseStoredProductDraftTitleSource(value: string | null): ProductDraftTitleSource {
  if (value === null || value === "human" || value === "model") return value;
  throw new Error("Stored ProductDraft title source is invalid.");
}

export function invalidProductDraftTitle(): ProductDraftTitleError {
  return new ProductDraftTitleError(
    400,
    "product_draft_title_invalid",
    "The ProductDraft title is invalid.",
  );
}

export function requiredProductDraftTitle(): ProductDraftTitleError {
  return new ProductDraftTitleError(
    409,
    "product_draft_title_required",
    "A ProductDraft title is required before publication.",
  );
}

function parseRequest<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw invalidProductDraftTitle();
}
