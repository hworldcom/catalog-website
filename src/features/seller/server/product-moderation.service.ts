import { z } from "zod";

import type { Json } from "@/lib/supabase/types";

import {
  initialProductModerationStateSchema,
  ProductModerationError,
  productModerationError,
  productModerationReviewStatusSchema,
  productModerationSubmissionSchema,
  type InitialProductModerationState,
  type ProductModerationErrorCode,
  type ProductModerationSubmission,
} from "../product-moderation.types";
import { getCurrentSellerId } from "./current-seller.service";

type RpcParameters = Record<string, unknown>;

export interface ProductModerationRequester {
  from: (relation: "sellers") => {
    select: (columns: "id") => {
      eq: (
        column: "owner_id",
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: { id: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

export interface ProductModerationAdministrator {
  rpc: (
    operation: string,
    parameters: RpcParameters,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
}

const stateRowSchema = z.object({
  product_id: z.string().uuid(),
  seller_id: z.string().uuid(),
  moderation_revision: z.number().int().positive(),
  product_status: z.enum(["draft", "published", "archived"]),
  seller_approved: z.boolean(),
  active_submission_id: z.string().uuid().nullable(),
  active_submission_status: z.string().nullable(),
  active_submission_revision: z.number().int().positive().nullable(),
  active_submission_submitted_at: z.string().nullable(),
  active_submission_snapshot: z.custom<Json>().nullable(),
});

const submissionRowSchema = z.object({
  id: z.string().uuid(),
  product_id: z.string().uuid(),
  seller_id: z.string().uuid(),
  submission_kind: z.enum(["initial_publication", "update"]),
  revision: z.number().int().positive(),
  snapshot_schema_version: z.literal(1),
  snapshot_json: z.custom<Json>(),
  review_status: z.enum(["pending", "changes_requested", "approved", "rejected", "withdrawn"]),
  seller_request_id: z.string().uuid(),
  submitted_by_user_id: z.string().uuid(),
  submitted_at: z.string(),
  seller_visible_reason: z.string().nullable(),
  decided_at: z.string().nullable(),
});

export class ProductModerationService {
  constructor(
    private readonly requester: ProductModerationRequester,
    private readonly administrator: ProductModerationAdministrator,
  ) {}

  async read(input: {
    userId: string;
    productDraftId: string;
  }): Promise<InitialProductModerationState> {
    const sellerId = await this.requireSeller(input.userId);
    const row = await this.runSingleRow(
      "read_product_moderation_state",
      { p_product_id: input.productDraftId, p_seller_id: sellerId },
      stateRowSchema,
      true,
    );
    const activeSubmission = row.active_submission_id
      ? {
          id: row.active_submission_id,
          status: parseActiveStatus(row.active_submission_status),
          revision: requireValue(row.active_submission_revision),
          submittedAt: requireValue(row.active_submission_submitted_at),
          snapshot: row.active_submission_snapshot,
        }
      : null;
    return initialProductModerationStateSchema.parse({
      productId: row.product_id,
      sellerId: row.seller_id,
      moderationRevision: row.moderation_revision,
      productStatus: row.product_status,
      sellerApproved: row.seller_approved,
      activeSubmission,
    });
  }

  async submit(input: {
    userId: string;
    productDraftId: string;
    expectedModerationRevision: number;
    requestId: string;
  }): Promise<ProductModerationSubmission> {
    const sellerId = await this.requireSeller(input.userId);
    return this.submitForSeller({ ...input, sellerId });
  }

  async submitForSeller(input: {
    userId: string;
    sellerId: string;
    productDraftId: string;
    expectedModerationRevision: number;
    requestId: string;
  }): Promise<ProductModerationSubmission> {
    const row = await this.runSingleRow(
      "submit_product_moderation",
      {
        p_product_id: input.productDraftId,
        p_seller_id: input.sellerId,
        p_expected_revision: input.expectedModerationRevision,
        p_seller_request_id: input.requestId,
        p_submitted_by_user_id: input.userId,
      },
      submissionRowSchema,
    );
    return submission(row);
  }

  async withdraw(input: {
    userId: string;
    productDraftId: string;
    submissionId: string;
    expectedModerationRevision: number;
    requestId: string;
  }): Promise<ProductModerationSubmission> {
    const sellerId = await this.requireSeller(input.userId);
    return this.withdrawForSeller({ ...input, sellerId });
  }

  async withdrawForSeller(input: {
    userId: string;
    sellerId: string;
    productDraftId: string;
    submissionId: string;
    expectedModerationRevision: number;
    requestId: string;
  }): Promise<ProductModerationSubmission> {
    const row = await this.runSingleRow(
      "withdraw_product_moderation",
      {
        p_product_id: input.productDraftId,
        p_seller_id: input.sellerId,
        p_submission_id: input.submissionId,
        p_expected_revision: input.expectedModerationRevision,
        p_request_id: input.requestId,
        p_actor_user_id: input.userId,
      },
      submissionRowSchema,
    );
    return submission(row);
  }

  private async requireSeller(userId: string): Promise<string> {
    const sellerId = await getCurrentSellerId({
      supabase: this.requester as never,
      userId,
    });
    if (!sellerId) throw productModerationError("product_moderation_not_found");
    return sellerId;
  }

  private async runSingleRow<T>(
    operation: string,
    parameters: RpcParameters,
    schema: z.ZodType<T>,
    notFoundWhenEmpty = false,
  ): Promise<T> {
    const response = await this.administrator.rpc(operation, parameters);
    if (response.error) throw productModerationDatabaseError(response.error);
    const parsed = z.array(schema).safeParse(response.data);
    if (!parsed.success || parsed.data.length !== 1) {
      if (notFoundWhenEmpty && parsed.success && parsed.data.length === 0) {
        throw productModerationError("product_moderation_not_found");
      }
      console.error("[Product moderation] Database response was invalid.", { operation });
      throw productModerationError("product_moderation_unavailable");
    }
    return parsed.data[0]!;
  }
}

function submission(row: z.infer<typeof submissionRowSchema>): ProductModerationSubmission {
  return productModerationSubmissionSchema.parse({
    id: row.id,
    productId: row.product_id,
    sellerId: row.seller_id,
    submissionKind: row.submission_kind,
    revision: row.revision,
    snapshotSchemaVersion: row.snapshot_schema_version,
    snapshot: row.snapshot_json,
    reviewStatus: row.review_status,
    sellerRequestId: row.seller_request_id,
    submittedByUserId: row.submitted_by_user_id,
    submittedAt: row.submitted_at,
    sellerVisibleReason: row.seller_visible_reason,
    decidedAt: row.decided_at,
  });
}

function parseActiveStatus(value: string | null) {
  return productModerationReviewStatusSchema.parse(value);
}

function requireValue<T>(value: T | null): T {
  if (value === null) throw productModerationError("product_moderation_unavailable");
  return value;
}

export function productModerationDatabaseError(error: { message: string }): ProductModerationError {
  const code = productModerationCodes.find((candidate) => error.message.includes(candidate));
  if (code) return productModerationError(code);
  console.error("[Product moderation] Database operation failed.", {
    message: error.message,
  });
  return productModerationError("product_moderation_unavailable");
}

const productModerationCodes: ProductModerationErrorCode[] = [
  "product_moderation_edit_invalid",
  "product_moderation_submission_invalid",
  "product_moderation_seller_approval_required",
  "product_moderation_product_not_editable",
  "product_moderation_submission_conflict",
  "product_moderation_submission_stale",
  "product_moderation_images_not_ready",
  "product_moderation_audience_required",
  "product_moderation_description_outdated",
  "product_moderation_working_revision_conflict",
  "product_moderation_activation_active",
  "product_moderation_not_found",
];
