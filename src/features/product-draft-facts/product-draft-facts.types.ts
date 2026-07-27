import { z } from "zod";

export const PRODUCT_DRAFT_FACT_FIELDS = ["colors", "materialComposition"] as const;

export type ProductDraftFactField = (typeof PRODUCT_DRAFT_FACT_FIELDS)[number];
export type ProductDraftFactSource = "human" | "model" | null;
export type ProductStatus = "draft" | "published" | "archived";

const factFieldSchema = z.enum(PRODUCT_DRAFT_FACT_FIELDS);
const factValueSchema = z.string().trim().min(1).max(120);
const scalarFactSchema = factValueSchema.nullable();
const listFactSchema = z.array(factValueSchema).max(10);

const uncertainFieldsSchema = z
  .array(factFieldSchema)
  .max(PRODUCT_DRAFT_FACT_FIELDS.length)
  .superRefine((fields, context) => {
    if (new Set(fields).size !== fields.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Uncertain fields must not contain duplicates.",
      });
    }
  });

export const productDraftFactsDocumentSchema = z
  .object({
    schemaVersion: z.literal(2),
    colors: listFactSchema,
    materialComposition: scalarFactSchema,
    uncertainFields: uncertainFieldsSchema,
    fieldSources: z
      .object({
        colors: z.enum(["human", "model"]).nullable(),
        materialComposition: z.enum(["human", "model"]).nullable(),
      })
      .strict(),
  })
  .strict();

export const productDraftFactsPatchSchema = z
  .object({
    colors: listFactSchema.optional(),
    materialComposition: scalarFactSchema.optional(),
    uncertainFields: uncertainFieldsSchema.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one ProductDraft facts field is required.",
  });

const getProductDraftFactsInputSchema = z
  .object({
    productDraftId: z.string().uuid(),
  })
  .strict();

const updateProductDraftFactsInputSchema = z
  .object({
    productDraftId: z.string().uuid(),
    patch: productDraftFactsPatchSchema,
  })
  .strict();

export type ProductDraftFacts = z.infer<typeof productDraftFactsDocumentSchema>;
export type ProductDraftFactsPatch = z.infer<typeof productDraftFactsPatchSchema>;
export type GetProductDraftFactsInput = z.infer<typeof getProductDraftFactsInputSchema>;
export type UpdateProductDraftFactsInput = z.infer<typeof updateProductDraftFactsInputSchema>;

export type ProductDraftFactsSnapshot = {
  productDraftId: string;
  facts: ProductDraftFacts;
  factsRevision: number;
  updatedAt: string;
  productStatus: ProductStatus;
  editable: boolean;
};

export type ProductDraftFactsErrorStatus = 400 | 404 | 409 | 500;

export class ProductDraftFactsError extends Error {
  constructor(
    public readonly statusCode: ProductDraftFactsErrorStatus,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProductDraftFactsError";
  }
}

export function parseGetProductDraftFactsInput(input: unknown): GetProductDraftFactsInput {
  return parseRequest(getProductDraftFactsInputSchema, input);
}

export function parseUpdateProductDraftFactsInput(input: unknown): UpdateProductDraftFactsInput {
  return parseRequest(updateProductDraftFactsInputSchema, input);
}

function parseRequest<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  throw new ProductDraftFactsError(
    400,
    "product_draft_facts_invalid",
    "The ProductDraft facts request is invalid.",
  );
}
