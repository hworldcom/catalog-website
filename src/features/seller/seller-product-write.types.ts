import { z } from "zod";

import {
  hasProductAudienceValidationIssue,
  productAudienceInvalid,
  productAudienceSetSchema,
} from "@/features/product-audience/product-audience.types";

import { hasValidSellerProductDescriptionLength } from "./product-description-validation";

export const sellerProductIdSchema = z.string().uuid();

const sellerProductFieldsSchema = z
  .object({
    audiences: productAudienceSetSchema.optional(),
    title: z.string().optional(),
    description: z
      .string()
      .trim()
      .nullable()
      .optional()
      .refine(hasValidSellerProductDescriptionLength, {
        message: "Description must contain at most 300 characters.",
      }),
    category_id: z.string().uuid().nullable().optional(),
    moq: z.number().int().min(0).nullable().optional(),
    pack_size: z.string().trim().max(80).nullable().optional(),
    price: z.number().nonnegative().nullable().optional(),
    currency: z.string().trim().min(3).max(6).default("USD"),
    stock: z.enum(["in_stock", "low_stock", "out_of_stock", "made_to_order"]),
    cover_image_url: z.string().trim().url().max(1000).nullable().optional().or(z.literal("")),
    trending: z.boolean().default(false),
  })
  .strict();

export const sellerProductSaveSchema = sellerProductFieldsSchema.extend({
  id: sellerProductIdSchema.optional(),
  publish: z.boolean().default(false),
});

export const sellerProductPublicationSchema = sellerProductFieldsSchema.extend({
  audiences: productAudienceSetSchema,
  id: sellerProductIdSchema,
});

export type SellerProductPublicationInput = z.infer<typeof sellerProductPublicationSchema>;

export function parseSellerProductSave(input: unknown): z.infer<typeof sellerProductSaveSchema> {
  const result = sellerProductSaveSchema.safeParse(input);
  if (result.success) return result.data;
  if (hasProductAudienceValidationIssue(result.error)) throw productAudienceInvalid();
  throw result.error;
}
