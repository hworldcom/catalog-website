import { z } from "zod";

import {
  hasProductAudienceValidationIssue,
  productAudienceInvalid,
  productAudienceSetSchema,
  type ProductAudience,
} from "@/features/product-audience/product-audience.types";
import {
  normalizeProductDraftDescriptionPatch,
  type ProductDraftDescriptionPatch,
} from "@/features/product-draft-descriptions/product-draft-descriptions.types";
import {
  productDraftFactsPatchSchema,
  type ProductDraftFactsPatch,
} from "@/features/product-draft-facts/product-draft-facts.types";
import type { ProductDraftTitleSource } from "@/features/product-draft-title/product-draft-title.types";
import type { SellerProductDraftGallery } from "@/features/seller/product-draft-image-gallery.types";
import type { SellerProductPublicationSnapshot } from "@/features/seller/seller-product-publication.types";

const uuidSchema = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const stockSchema = z.enum(["in_stock", "low_stock", "out_of_stock", "made_to_order"]);
const moderationRevisionSchema = z.number().int().positive();

export const delegatedProductFieldsSchema = z
  .object({
    audiences: productAudienceSetSchema,
    title: z.string(),
    categoryId: uuidSchema.nullable(),
    minimumOrderQuantity: z.number().int().min(0).nullable(),
    packSize: z.string().trim().max(80).nullable(),
    price: z.number().nonnegative().nullable(),
    currency: z.string().trim().min(3).max(6),
    stock: stockSchema,
    trending: z.boolean(),
  })
  .strict();

const scopeSchema = z
  .object({
    workflowId: uuidSchema,
    productDraftId: uuidSchema,
  })
  .strict();

const workflowSchema = z.object({ workflowId: uuidSchema }).strict();

const saveSchema = scopeSchema
  .extend({ expectedModerationRevision: moderationRevisionSchema })
  .extend(delegatedProductFieldsSchema.shape)
  .strict();
const publishSchema = saveSchema.extend({ requestId: uuidSchema }).strict();
const retrySchema = scopeSchema.extend({ requestId: uuidSchema }).strict();
const updateFactsSchema = scopeSchema
  .extend({
    expectedModerationRevision: moderationRevisionSchema,
    patch: productDraftFactsPatchSchema,
  })
  .strict();
const updateDescriptionsSchema = scopeSchema
  .extend({
    expectedModerationRevision: moderationRevisionSchema,
    descriptions: z
      .object({
        pl: z.string().nullable().optional(),
        en: z.string().nullable().optional(),
        de: z.string().nullable().optional(),
        vi: z.string().nullable().optional(),
      })
      .strict()
      .refine((value) => Object.keys(value).length > 0),
  })
  .strict();

export type DelegatedProductFields = z.infer<typeof delegatedProductFieldsSchema>;
export type DelegatedProductScope = z.infer<typeof scopeSchema>;
export type DelegatedProductSaveInput = z.infer<typeof saveSchema>;
export type DelegatedProductPublishInput = z.infer<typeof publishSchema>;
export type DelegatedProductRetryInput = z.infer<typeof retrySchema>;
export type DelegatedProductFactsUpdateInput = DelegatedProductScope & {
  expectedModerationRevision: number;
  patch: ProductDraftFactsPatch;
};
export type DelegatedProductDescriptionsUpdateInput = DelegatedProductScope & {
  expectedModerationRevision: number;
  descriptions: ProductDraftDescriptionPatch;
};

export type DelegatedProductCategory = {
  id: string;
  slug: string;
  name: string;
};

export type DelegatedProductDraftSnapshot = {
  workflowId: string;
  productDraftId: string;
  seller: {
    id: string;
    name: string;
    slug: string;
    storefrontPublished: boolean;
  };
  source: {
    classifierOrganizationId: string;
    classifierBatchId: string;
    classifierGroupId: string;
  };
  product: {
    moderationRevision: number;
    audiences: ProductAudience[];
    status: "draft" | "published" | "archived";
    title: string;
    titleSource: ProductDraftTitleSource;
    categoryId: string | null;
    minimumOrderQuantity: number | null;
    packSize: string | null;
    price: number | null;
    currency: string;
    stock: "in_stock" | "low_stock" | "out_of_stock" | "made_to_order";
    trending: boolean;
    coverImageId: string | null;
    imagePublicationMode: "durable";
    editable: boolean;
  };
  gallery: SellerProductDraftGallery;
};

export type DelegatedProductPublicationSnapshot = SellerProductPublicationSnapshot;

export class DelegatedProductDraftError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 409 | 500,
    public readonly code:
      | "delegated_product_draft_invalid"
      | "delegated_product_draft_not_found"
      | "delegated_product_draft_not_editable"
      | "delegated_product_draft_unavailable",
    message: string,
  ) {
    super(message);
    this.name = "DelegatedProductDraftError";
  }
}

export function parseDelegatedProductScope(input: unknown): DelegatedProductScope {
  return parse(scopeSchema, input);
}

export function parseDelegatedProductWorkflow(input: unknown): { workflowId: string } {
  return parse(workflowSchema, input);
}

export function parseDelegatedProductSave(input: unknown): DelegatedProductSaveInput {
  return parse(saveSchema, input);
}

export function parseDelegatedProductPublish(input: unknown): DelegatedProductPublishInput {
  return parse(publishSchema, input);
}

export function parseDelegatedProductRetry(input: unknown): DelegatedProductRetryInput {
  return parse(retrySchema, input);
}

export function parseDelegatedProductFactsUpdate(input: unknown): DelegatedProductFactsUpdateInput {
  return parse(updateFactsSchema, input);
}

export function parseDelegatedProductDescriptionsUpdate(
  input: unknown,
): DelegatedProductDescriptionsUpdateInput {
  const parsed = parse(updateDescriptionsSchema, input);
  return {
    ...parsed,
    descriptions: normalizeProductDraftDescriptionPatch(parsed.descriptions),
  };
}

export function delegatedProductDraftInvalid(): DelegatedProductDraftError {
  return new DelegatedProductDraftError(
    400,
    "delegated_product_draft_invalid",
    "The delegated ProductDraft request is invalid.",
  );
}

export function delegatedProductDraftNotFound(): DelegatedProductDraftError {
  return new DelegatedProductDraftError(
    404,
    "delegated_product_draft_not_found",
    "The delegated ProductDraft was not found.",
  );
}

export function delegatedProductDraftNotEditable(): DelegatedProductDraftError {
  return new DelegatedProductDraftError(
    409,
    "delegated_product_draft_not_editable",
    "The delegated ProductDraft can no longer be edited.",
  );
}

export function delegatedProductDraftUnavailable(): DelegatedProductDraftError {
  return new DelegatedProductDraftError(
    500,
    "delegated_product_draft_unavailable",
    "The delegated ProductDraft is temporarily unavailable.",
  );
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  if (hasProductAudienceValidationIssue(result.error)) throw productAudienceInvalid();
  throw delegatedProductDraftInvalid();
}
