import { z } from "zod";

import {
  PRODUCT_DRAFT_DESCRIPTION_LANGUAGES,
  PRODUCT_DRAFT_DESCRIPTION_MAX_LENGTH,
} from "@/features/product-draft-descriptions/product-draft-descriptions.types";
import { PRODUCT_DRAFT_TITLE_MAX_LENGTH } from "@/features/product-draft-title/product-draft-title.types";

export const PRODUCT_DESCRIPTION_PIPELINE_VERSION = "product-description-v2";
export const PRODUCT_DESCRIPTION_PROVIDER_TIMEOUT_MS = 45_000;
export const PRODUCT_DESCRIPTION_OPERATION_TIMEOUT_MS = 60_000;
export const PRODUCT_DESCRIPTION_CLAIM_EXPIRY_SECONDS = 180;
export const PRODUCT_DESCRIPTION_MAX_OUTPUT_TOKENS = 6_000;
export const GENERATED_DESCRIPTION_MAX_LENGTH = PRODUCT_DRAFT_DESCRIPTION_MAX_LENGTH;
export const GENERATED_VISUAL_DETAIL_MAX_LENGTH = 120;

const descriptionsSchema = z
  .object({
    pl: z.string(),
    en: z.string(),
    de: z.string(),
    vi: z.string(),
  })
  .strict();

const imageAssessmentSchema = z
  .object({
    usable: z.boolean(),
    observedDetails: z.array(z.string()).max(8),
  })
  .strict();

export const productDescriptionGenerationOutputSchema = z
  .object({
    imageAssessment: imageAssessmentSchema,
    descriptions: descriptionsSchema.nullable(),
    titleProposal: z.string().nullable(),
  })
  .strict();

export const productDescriptionGenerationWithoutTitleOutputSchema = z
  .object({
    imageAssessment: imageAssessmentSchema,
    descriptions: descriptionsSchema.nullable(),
    titleProposal: z.null(),
  })
  .strict();

const generationInputSchema = z
  .object({
    productDraftId: z.string().uuid(),
  })
  .strict();

export type ProductDescriptionGenerationOutput = z.infer<
  typeof productDescriptionGenerationOutputSchema
>;

export type GenerateMyProductDraftDescriptionsInput = z.infer<typeof generationInputSchema>;

export type NormalizedProductDescriptionGenerationOutput = {
  descriptions: Record<(typeof PRODUCT_DRAFT_DESCRIPTION_LANGUAGES)[number], string>;
  titleProposal: string | null;
};

export type ProductDescriptionGenerationErrorStatus = 400 | 404 | 409 | 422 | 500 | 502 | 503 | 504;

export type ProductDescriptionGenerationErrorCode =
  | "product_description_generation_invalid"
  | "product_draft_not_found"
  | "product_description_generation_not_editable"
  | "product_description_generation_category_missing"
  | "product_description_generation_cover_missing"
  | "product_description_generation_cover_not_ready"
  | "product_description_generation_cover_unsupported"
  | "product_description_generation_cover_unavailable"
  | "product_description_generation_image_not_usable"
  | "product_description_generation_no_writable_targets"
  | "product_description_generation_in_progress"
  | "product_description_generation_input_changed"
  | "product_description_generation_attempt_superseded"
  | "product_draft_facts_missing"
  | "product_description_generation_configuration_invalid"
  | "product_description_generation_provider_failed"
  | "product_description_generation_provider_timeout"
  | "product_description_generation_output_invalid"
  | "product_description_generation_unavailable";

export class ProductDescriptionGenerationError extends Error {
  constructor(
    public readonly statusCode: ProductDescriptionGenerationErrorStatus,
    public readonly code: ProductDescriptionGenerationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProductDescriptionGenerationError";
  }
}

export class ProductDescriptionGenerationOutputError extends Error {
  constructor() {
    super("The description generation provider returned invalid output.");
    this.name = "ProductDescriptionGenerationOutputError";
  }
}

export class ProductDescriptionGenerationImageNotUsableError extends Error {
  constructor() {
    super("The selected cover image cannot support a product-specific description.");
    this.name = "ProductDescriptionGenerationImageNotUsableError";
  }
}

export function parseGenerateMyProductDraftDescriptionsInput(
  input: unknown,
): GenerateMyProductDraftDescriptionsInput {
  const result = generationInputSchema.safeParse(input);
  if (result.success) return result.data;
  throw generationError(
    400,
    "product_description_generation_invalid",
    "The ProductDraft description generation request is invalid.",
  );
}

export function normalizeProductDescriptionGenerationOutput(
  value: unknown,
  titleProposalAllowed: boolean,
): NormalizedProductDescriptionGenerationOutput {
  const parsed = productDescriptionGenerationOutputSchema.safeParse(value);
  if (!parsed.success) throw new ProductDescriptionGenerationOutputError();

  if (!parsed.data.imageAssessment.usable) {
    if (
      parsed.data.imageAssessment.observedDetails.length !== 0 ||
      parsed.data.descriptions !== null ||
      parsed.data.titleProposal !== null
    ) {
      throw new ProductDescriptionGenerationOutputError();
    }
    throw new ProductDescriptionGenerationImageNotUsableError();
  }

  if (
    parsed.data.descriptions === null ||
    parsed.data.imageAssessment.observedDetails.length === 0
  ) {
    throw new ProductDescriptionGenerationOutputError();
  }
  for (const detail of parsed.data.imageAssessment.observedDetails) {
    const normalized = detail.trim().replace(/\s+/gu, " ");
    if (
      !normalized ||
      normalized !== detail ||
      Array.from(normalized).length > GENERATED_VISUAL_DETAIL_MAX_LENGTH
    ) {
      throw new ProductDescriptionGenerationOutputError();
    }
  }

  const descriptions = Object.fromEntries(
    PRODUCT_DRAFT_DESCRIPTION_LANGUAGES.map((language) => [
      language,
      normalizeGeneratedDescription(parsed.data.descriptions[language]),
    ]),
  ) as NormalizedProductDescriptionGenerationOutput["descriptions"];

  if (!titleProposalAllowed && parsed.data.titleProposal !== null) {
    throw new ProductDescriptionGenerationOutputError();
  }

  return {
    descriptions,
    titleProposal: titleProposalAllowed
      ? normalizeGeneratedTitleProposal(parsed.data.titleProposal)
      : null,
  };
}

export function generationError(
  statusCode: ProductDescriptionGenerationErrorStatus,
  code: ProductDescriptionGenerationErrorCode,
  message: string,
): ProductDescriptionGenerationError {
  return new ProductDescriptionGenerationError(statusCode, code, message);
}

function normalizeGeneratedDescription(value: string): string {
  if (value.includes("\n") || value.includes("\r")) {
    throw new ProductDescriptionGenerationOutputError();
  }
  const normalized = value.trim();
  if (!normalized || Array.from(normalized).length > GENERATED_DESCRIPTION_MAX_LENGTH) {
    throw new ProductDescriptionGenerationOutputError();
  }
  return normalized;
}

function normalizeGeneratedTitleProposal(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (!normalized || Array.from(normalized).length > PRODUCT_DRAFT_TITLE_MAX_LENGTH) return null;
  return normalized;
}
