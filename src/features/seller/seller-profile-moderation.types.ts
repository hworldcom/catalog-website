import { z } from "zod";

const sellerProfileMediaPreviewSchema = z.object({
  assetId: z.string().uuid(),
  durableStatus: z.enum(["pending", "available", "deleting", "failed", "deleted"]),
  deliveryStatus: z.enum(["available", "pending", "failed", "missing", "unavailable"]),
  deliveryErrorCode: z.string().nullable(),
  url: z.string().nullable(),
});

const sellerProfileFieldsSchema = z.object({
  name: z.string(),
  slug: z.string(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  whatsapp: z.string().nullable(),
  email: z.string().nullable(),
  about: z.string().nullable(),
  establishedYear: z.number().int().nullable(),
  logo: sellerProfileMediaPreviewSchema.nullable(),
  cover: sellerProfileMediaPreviewSchema.nullable(),
});

export const sellerProfileModerationSnapshotSchema = z.object({
  sellerId: z.string().uuid(),
  companyCode: z.string(),
  companyCodeLockedAt: z.string().nullable(),
  primaryCategoryId: z.string().uuid().nullable(),
  storefrontEnabled: z.boolean(),
  approvalState: z.enum([
    "not_approved",
    "approved_storefront_disabled",
    "approved_storefront_enabled",
  ]),
  approvedProfile: sellerProfileFieldsSchema
    .extend({
      submissionId: z.string().uuid(),
      revision: z.number().int().positive(),
    })
    .nullable(),
  workingCopy: sellerProfileFieldsSchema.extend({
    revision: z.number().int().positive(),
  }),
  latestSubmission: z
    .object({
      id: z.string().uuid(),
      kind: z.enum(["initial", "update"]),
      revision: z.number().int().positive(),
      status: z.enum(["pending", "changes_requested", "approved", "rejected", "withdrawn"]),
      submittedAt: z.string(),
      decidedAt: z.string().nullable(),
      sellerVisibleReason: z.string().nullable(),
    })
    .nullable(),
  actions: z.object({
    canEdit: z.boolean(),
    canSubmit: z.boolean(),
    canWithdraw: z.boolean(),
    canEnableStorefront: z.boolean(),
    canDisableStorefront: z.boolean(),
  }),
});

export const sellerStorefrontPreferenceReceiptSchema = z.object({
  result: z.enum(["recorded", "replay"]),
  storefrontEnabled: z.boolean(),
});

export type SellerProfileMediaPreview = z.infer<typeof sellerProfileMediaPreviewSchema>;
export type SellerProfileFields = z.infer<typeof sellerProfileFieldsSchema>;
export type SellerProfileModerationSnapshot = z.infer<typeof sellerProfileModerationSnapshotSchema>;
export type SellerStorefrontPreferenceReceipt = z.infer<
  typeof sellerStorefrontPreferenceReceiptSchema
>;
