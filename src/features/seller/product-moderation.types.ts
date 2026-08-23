import { z } from "zod";

import type { Json } from "@/lib/supabase/types";

export const productModerationReviewStatusSchema = z.enum([
  "pending",
  "changes_requested",
  "approved",
  "rejected",
  "withdrawn",
]);

export const initialProductModerationStateSchema = z.object({
  productId: z.string().uuid(),
  sellerId: z.string().uuid(),
  moderationRevision: z.number().int().positive(),
  productStatus: z.enum(["draft", "published", "archived"]),
  sellerApproved: z.boolean(),
  activeSubmission: z
    .object({
      id: z.string().uuid(),
      status: productModerationReviewStatusSchema,
      revision: z.number().int().positive(),
      submittedAt: z.string(),
      snapshot: z.custom<Json>(),
    })
    .nullable(),
});

export const productModerationSubmissionSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  sellerId: z.string().uuid(),
  submissionKind: z.enum(["initial_publication", "update"]),
  revision: z.number().int().positive(),
  snapshotSchemaVersion: z.literal(1),
  snapshot: z.custom<Json>(),
  reviewStatus: productModerationReviewStatusSchema,
  sellerRequestId: z.string().uuid(),
  submittedByUserId: z.string().uuid(),
  submittedAt: z.string(),
  sellerVisibleReason: z.string().nullable(),
  decidedAt: z.string().nullable(),
});

export const productModerationEditStartSchema = z.object({
  productId: z.string().uuid(),
  moderationRevision: z.number().int().positive(),
  editSource: z.enum(["initial_draft", "working_copy"]),
});

export type InitialProductModerationState = z.infer<typeof initialProductModerationStateSchema>;
export type ProductModerationSubmission = z.infer<typeof productModerationSubmissionSchema>;
export type ProductModerationEditStart = z.infer<typeof productModerationEditStartSchema>;

export type ProductModerationErrorCode =
  | "product_moderation_edit_invalid"
  | "product_moderation_submission_invalid"
  | "product_moderation_seller_approval_required"
  | "product_moderation_product_not_editable"
  | "product_moderation_submission_conflict"
  | "product_moderation_submission_stale"
  | "product_moderation_images_not_ready"
  | "product_moderation_audience_required"
  | "product_moderation_description_outdated"
  | "product_moderation_working_revision_conflict"
  | "product_moderation_activation_active"
  | "product_moderation_not_found"
  | "product_moderation_unavailable";

export class ProductModerationError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 409 | 503,
    public readonly code: ProductModerationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProductModerationError";
  }
}

const productModerationErrorDetails: Record<
  ProductModerationErrorCode,
  { status: 400 | 404 | 409 | 503; message: string }
> = {
  product_moderation_edit_invalid: {
    status: 400,
    message: "The product edit request is invalid.",
  },
  product_moderation_submission_invalid: {
    status: 400,
    message: "The product submission is invalid.",
  },
  product_moderation_seller_approval_required: {
    status: 409,
    message: "The seller must be approved before submitting products.",
  },
  product_moderation_product_not_editable: {
    status: 409,
    message: "This product cannot be edited from its current state.",
  },
  product_moderation_submission_conflict: {
    status: 409,
    message: "This product already has an active submission.",
  },
  product_moderation_submission_stale: {
    status: 409,
    message: "This product submission is no longer current.",
  },
  product_moderation_images_not_ready: {
    status: 409,
    message: "All product images and the selected cover must be ready.",
  },
  product_moderation_audience_required: {
    status: 409,
    message: "Select at least one product audience.",
  },
  product_moderation_description_outdated: {
    status: 409,
    message: "Regenerate, edit, or clear descriptions based on older product facts.",
  },
  product_moderation_working_revision_conflict: {
    status: 409,
    message: "The product changed. Refresh it before continuing.",
  },
  product_moderation_activation_active: {
    status: 409,
    message: "Product activation is already in progress.",
  },
  product_moderation_not_found: {
    status: 404,
    message: "The product was not found.",
  },
  product_moderation_unavailable: {
    status: 503,
    message: "Product moderation is temporarily unavailable.",
  },
};

export function productModerationError(code: ProductModerationErrorCode): ProductModerationError {
  const detail = productModerationErrorDetails[code];
  return new ProductModerationError(detail.status, code, detail.message);
}

export function productModerationErrorCode(error: unknown): ProductModerationErrorCode | null {
  if (!error || typeof error !== "object") return null;

  if ("code" in error && isProductModerationErrorCode(error.code)) return error.code;

  const message = "message" in error && typeof error.message === "string" ? error.message : null;
  if (message) {
    if (isProductModerationErrorCode(message)) return message;
    for (const code of Object.keys(productModerationErrorDetails) as ProductModerationErrorCode[]) {
      if (productModerationErrorDetails[code].message === message) return code;
    }
  }

  return "cause" in error ? productModerationErrorCode(error.cause) : null;
}

function isProductModerationErrorCode(value: unknown): value is ProductModerationErrorCode {
  return typeof value === "string" && value in productModerationErrorDetails;
}
