import { z } from "zod";

export const productModerationDescriptionSnapshotSchema = z
  .object({
    language: z.enum(["pl", "en", "de", "vi"]),
    descriptionText: z.string(),
    source: z.enum(["human", "model"]),
    factsRevision: z.number().int().positive().nullable(),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    pipelineVersion: z.string().nullable(),
    generatedAt: z.string().nullable(),
    updatedAt: z.string().nullable().optional(),
  })
  .strict();

export const productModerationSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    productId: z.string().uuid(),
    sellerId: z.string().uuid(),
    productCode: z.string().nullable(),
    productCodeInput: z.unknown().nullable(),
    title: z.string(),
    titleSource: z.enum(["human", "model"]).nullable(),
    categoryId: z.string().uuid().nullable(),
    audiences: z.array(z.enum(["women", "men", "kids"])),
    descriptions: z.array(productModerationDescriptionSnapshotSchema),
    facts: z
      .object({
        factsRevision: z.number().int().positive(),
        facts: z.unknown(),
      })
      .strict()
      .nullable(),
    minimumOrder: z.number().int().nullable(),
    packSize: z.string().nullable(),
    price: z.number().nullable(),
    currency: z.string(),
    stock: z.enum(["in_stock", "low_stock", "out_of_stock", "made_to_order"]),
    imageIds: z.array(z.string().uuid()),
    coverImageId: z.string().uuid().nullable(),
  })
  .strict();

export type ProductModerationSnapshot = z.infer<typeof productModerationSnapshotSchema>;
