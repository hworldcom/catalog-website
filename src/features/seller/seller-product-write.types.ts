import { z } from "zod";

import { hasValidSellerProductDescriptionLength } from "./product-description-validation";

export const sellerProductIdSchema = z.string().uuid();

const sellerProductFieldsSchema = z
  .object({
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

export const sellerProductSaveSchema = sellerProductFieldsSchema
  .extend({
    id: sellerProductIdSchema.optional(),
    publish: z.boolean().default(false),
  })
  .superRefine((product, context) => {
    if (!product.id && product.title === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["title"],
        message: "A title value is required when creating a product.",
      });
    }
  });

export const sellerProductPublicationSchema = sellerProductFieldsSchema.extend({
  id: sellerProductIdSchema,
});

export type SellerProductPublicationInput = z.infer<typeof sellerProductPublicationSchema>;
