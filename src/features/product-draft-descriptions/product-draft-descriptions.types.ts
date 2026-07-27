import { z } from "zod";

export const PRODUCT_DRAFT_DESCRIPTION_LANGUAGES = ["pl", "en", "de", "vi"] as const;

export type ProductDraftDescriptionLanguage = (typeof PRODUCT_DRAFT_DESCRIPTION_LANGUAGES)[number];
export type ProductDraftDescriptionSource = "human" | "model" | null;
export type ProductDraftDescriptionStatus = "draft" | "published" | "archived";

const languageSchema = z.enum(PRODUCT_DRAFT_DESCRIPTION_LANGUAGES);
const descriptionValueSchema = z.string().nullable();
const productStatusSchema = z.enum(["draft", "published", "archived"]);
const descriptionEntrySchema = z
  .object({
    language: languageSchema,
    text: z.string().nullable(),
    source: z.enum(["human", "model"]).nullable(),
    factsRevision: z.number().int().nullable(),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    pipelineVersion: z.string().nullable(),
    generatedAt: z.string().datetime({ offset: true }).nullable(),
    updatedAt: z.string().datetime({ offset: true }).nullable(),
    outdated: z.boolean().nullable(),
  })
  .strict();

const databaseSnapshotSchema = z
  .object({
    productDraftId: z.string().uuid(),
    productStatus: productStatusSchema,
    categoryId: z.string().uuid().nullable(),
    currentFactsRevision: z.number().int().min(1),
    descriptions: z
      .array(descriptionEntrySchema)
      .length(PRODUCT_DRAFT_DESCRIPTION_LANGUAGES.length),
  })
  .strict();

const getProductDraftDescriptionsInputSchema = z
  .object({
    productDraftId: z.string().uuid(),
  })
  .strict();

const updateProductDraftDescriptionsInputSchema = z
  .object({
    productDraftId: z.string().uuid(),
    descriptions: z
      .object({
        pl: descriptionValueSchema.optional(),
        en: descriptionValueSchema.optional(),
        de: descriptionValueSchema.optional(),
        vi: descriptionValueSchema.optional(),
      })
      .strict()
      .refine((descriptions) => Object.keys(descriptions).length > 0, {
        message: "At least one description language is required.",
      }),
  })
  .strict();

export type ProductDraftDescriptionSnapshot = {
  productDraftId: string;
  productStatus: ProductDraftDescriptionStatus;
  currentFactsRevision: number;
  generationEligibility: {
    eligible: boolean;
    reason: "product_not_draft" | "category_missing" | null;
  };
  descriptions: ProductDraftDescriptionEntry[];
};

export type ProductDraftDescriptionEntry = {
  language: ProductDraftDescriptionLanguage;
  text: string | null;
  source: ProductDraftDescriptionSource;
  factsRevision: number | null;
  provider: string | null;
  model: string | null;
  pipelineVersion: string | null;
  generatedAt: string | null;
  updatedAt: string | null;
  outdated: boolean | null;
};

export type ProductDraftDescriptionPatch = Partial<
  Record<ProductDraftDescriptionLanguage, string | null>
>;

export type GetProductDraftDescriptionsInput = z.infer<
  typeof getProductDraftDescriptionsInputSchema
>;
export type UpdateProductDraftDescriptionsInput = z.infer<
  typeof updateProductDraftDescriptionsInputSchema
>;

export type ProductDraftDescriptionErrorStatus = 400 | 403 | 404 | 409 | 500;

export class ProductDraftDescriptionError extends Error {
  constructor(
    public readonly statusCode: ProductDraftDescriptionErrorStatus,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProductDraftDescriptionError";
  }
}

export function parseGetProductDraftDescriptionsInput(
  input: unknown,
): GetProductDraftDescriptionsInput {
  return parseRequest(getProductDraftDescriptionsInputSchema, input);
}

export function parseUpdateProductDraftDescriptionsInput(
  input: unknown,
): UpdateProductDraftDescriptionsInput {
  return parseRequest(updateProductDraftDescriptionsInputSchema, input);
}

export function normalizeProductDraftDescription(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return null;
  if (Array.from(normalized).length > 8000) {
    throw new ProductDraftDescriptionError(
      400,
      "product_draft_description_invalid",
      "A ProductDraft description must contain at most 8,000 characters.",
    );
  }
  return normalized;
}

export function normalizeProductDraftDescriptionPatch(
  patch: ProductDraftDescriptionPatch,
): ProductDraftDescriptionPatch {
  return Object.fromEntries(
    Object.entries(patch).map(([language, value]) => [
      languageSchema.parse(language),
      normalizeProductDraftDescription(value ?? null),
    ]),
  ) as ProductDraftDescriptionPatch;
}

export function parseProductDraftDescriptionDatabaseSnapshot(value: unknown): {
  productDraftId: string;
  productStatus: ProductDraftDescriptionStatus;
  categoryId: string | null;
  currentFactsRevision: number;
  descriptions: ProductDraftDescriptionEntry[];
} {
  const result = databaseSnapshotSchema.safeParse(value);
  if (!result.success) {
    throw new Error("ProductDraft description database operation returned an invalid snapshot.");
  }
  return result.data;
}

function parseRequest<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  throw new ProductDraftDescriptionError(
    400,
    "product_draft_description_invalid",
    "The ProductDraft description request is invalid.",
  );
}
