import { z } from "zod";

import type { Json } from "@/lib/supabase/types";

import {
  ADMINISTRATOR_MODERATION_ACTIVATION_STATUSES,
  ADMINISTRATOR_MODERATION_REVIEW_STATUSES,
  ADMINISTRATOR_MODERATION_SUBMISSION_TYPES,
} from "../administrator-moderation.types";
import type { AdministratorModerationCursor } from "../administrator-moderation.cursor";
import type { AdministratorModerationFilters } from "../administrator-moderation.types";
import {
  AdministratorModerationRepositoryError,
  type AdministratorModerationRepository,
} from "./administrator-moderation.repository";

type RpcResult = {
  data: unknown;
  error: { message: string } | null;
};

export type AdministratorModerationDatabase = {
  rpc(operation: string, parameters: Record<string, unknown>): PromiseLike<RpcResult>;
};

const activationPhaseSchema = z.enum(["activation", "pre_switch_cleanup", "post_switch_cleanup"]);
const activationDispatchStatusSchema = z.enum(["pending", "dispatched", "failed"]);
const sellerAssetDurableStatusSchema = z.enum([
  "pending",
  "available",
  "deleting",
  "failed",
  "deleted",
]);

const queueRowSchema = z
  .object({
    submission_type: z.enum(ADMINISTRATOR_MODERATION_SUBMISSION_TYPES),
    submission_id: z.string().uuid(),
    seller_id: z.string().uuid(),
    seller_name: z.string(),
    revision: z.number().int().positive(),
    submitted_at: z.string(),
    review_status: z.enum(ADMINISTRATOR_MODERATION_REVIEW_STATUSES),
    seller_visible_reason: z.string().nullable(),
    seller_preview_kind: z.enum(["seller_logo", "seller_cover"]).nullable(),
    seller_preview_asset_id: z.string().uuid().nullable(),
    seller_preview_durable_status: sellerAssetDurableStatusSchema.nullable(),
    seller_preview_error_code: z.string().nullable(),
    product_id: z.string().uuid().nullable(),
    product_snapshot_schema_version: z.number().int().nullable(),
    product_snapshot_json: z.custom<Json>().nullable(),
    product_cover_image_id: z.string().uuid().nullable(),
    activation_run_id: z.string().uuid().nullable(),
    activation_phase: activationPhaseSchema.nullable(),
    activation_status: z.enum(ADMINISTRATOR_MODERATION_ACTIVATION_STATUSES).nullable(),
    activation_dispatch_status: activationDispatchStatusSchema.nullable(),
    activation_dispatch_generation: z.number().int().positive().nullable(),
    activation_dispatch_error_code: z.string().nullable(),
    activation_error_code: z.string().nullable(),
  })
  .strict();

const sellerAssetSchema = z
  .object({
    assetId: z.string().uuid(),
    kind: z.enum(["logo", "cover"]),
    durableStatus: sellerAssetDurableStatusSchema,
    errorCode: z.string().nullable(),
  })
  .strict();

const referenceSchema = z
  .object({
    submissionId: z.string().uuid(),
    revision: z.number().int().positive(),
  })
  .strict();

const sellerRevisionSchema = z
  .object({
    snapshot: z.custom<Json>(),
    logoAsset: sellerAssetSchema.nullable(),
    coverAsset: sellerAssetSchema.nullable(),
  })
  .strict();

const sellerDetailSchema = z
  .object({
    submissionId: z.string().uuid(),
    sellerId: z.string().uuid(),
    sellerName: z.string(),
    revision: z.number().int().positive(),
    submittedAt: z.string(),
    reviewStatus: z.enum(ADMINISTRATOR_MODERATION_REVIEW_STATUSES),
    sellerVisibleReason: z.string().nullable(),
    administratorUserId: z.string().uuid().nullable(),
    decisionRequestId: z.string().uuid().nullable(),
    decidedAt: z.string().nullable(),
    proposed: sellerRevisionSchema,
    comparisonBaseline: sellerRevisionSchema
      .extend({
        submissionId: z.string().uuid(),
        revision: z.number().int().positive(),
      })
      .nullable(),
    currentApprovedReference: referenceSchema.nullable(),
    canDecide: z.boolean(),
  })
  .strict();

const submittedImageSchema = z
  .object({
    productDraftImageId: z.string().uuid(),
    position: z.number().int().nonnegative(),
    isCover: z.boolean(),
  })
  .strict();

const productRevisionSchema = z
  .object({
    snapshotSchemaVersion: z.number().int(),
    snapshot: z.custom<Json>(),
    images: z.array(submittedImageSchema),
  })
  .strict();

const activationSchema = z
  .object({
    runId: z.string().uuid(),
    phase: activationPhaseSchema,
    status: z.enum(ADMINISTRATOR_MODERATION_ACTIVATION_STATUSES),
    dispatchStatus: activationDispatchStatusSchema,
    dispatchGeneration: z.number().int().positive(),
    dispatchErrorCode: z.string().nullable(),
    errorCode: z.string().nullable(),
  })
  .strict();

const productDetailSchema = z
  .object({
    submissionId: z.string().uuid(),
    productId: z.string().uuid(),
    sellerId: z.string().uuid(),
    sellerName: z.string(),
    revision: z.number().int().positive(),
    submissionKind: z.enum(["initial_publication", "update"]),
    submittedAt: z.string(),
    reviewStatus: z.enum(ADMINISTRATOR_MODERATION_REVIEW_STATUSES),
    sellerVisibleReason: z.string().nullable(),
    administratorUserId: z.string().uuid().nullable(),
    decisionRequestId: z.string().uuid().nullable(),
    decidedAt: z.string().nullable(),
    proposed: productRevisionSchema,
    comparisonBaseline: productRevisionSchema
      .extend({
        submissionId: z.string().uuid(),
        revision: z.number().int().positive(),
      })
      .nullable(),
    currentApprovedReference: referenceSchema.nullable(),
    activation: activationSchema.nullable(),
    canDecide: z.boolean(),
    canRetryDispatch: z.boolean(),
    canRetryActivation: z.boolean(),
    canRetryPostSwitchCleanup: z.boolean(),
  })
  .strict();

export class SupabaseAdministratorModerationRepository implements AdministratorModerationRepository {
  constructor(private readonly database: AdministratorModerationDatabase) {}

  async list(filters: AdministratorModerationFilters, after: AdministratorModerationCursor | null) {
    const response = await this.database.rpc("list_administrator_moderation_requests", {
      p_submission_type: filters.submissionType,
      p_review_status: filters.reviewStatus,
      p_activation_status: filters.activationStatus,
      p_seller_id: filters.sellerId,
      p_limit: filters.limit,
      p_after_submitted_at: after?.submittedAt ?? null,
      p_after_submission_type: after?.submissionType ?? null,
      p_after_submission_id: after?.submissionId ?? null,
    });
    if (response.error) throw databaseError("list", response.error.message);

    const parsed = z.array(queueRowSchema).safeParse(response.data as Json);
    if (!parsed.success) throw invalidResponse("list");
    return parsed.data;
  }

  async getSeller(submissionId: string) {
    const response = await this.database.rpc("read_administrator_seller_moderation_request", {
      p_submission_id: submissionId,
    });
    if (response.error) throw databaseError("seller detail", response.error.message);
    if (response.data === null) return null;

    const parsed = sellerDetailSchema.safeParse(response.data as Json);
    if (!parsed.success) throw invalidResponse("seller detail");
    return parsed.data;
  }

  async getProduct(submissionId: string) {
    const response = await this.database.rpc("read_administrator_product_moderation_request", {
      p_submission_id: submissionId,
    });
    if (response.error) throw databaseError("product detail", response.error.message);
    if (response.data === null) return null;

    const parsed = productDetailSchema.safeParse(response.data as Json);
    if (!parsed.success) throw invalidResponse("product detail");
    return parsed.data;
  }
}

function databaseError(operation: string, message: string): AdministratorModerationRepositoryError {
  return new AdministratorModerationRepositoryError(
    `Administrator moderation ${operation} failed: ${message}`,
  );
}

function invalidResponse(operation: string): AdministratorModerationRepositoryError {
  return new AdministratorModerationRepositoryError(
    `Administrator moderation ${operation} returned an invalid response.`,
  );
}
