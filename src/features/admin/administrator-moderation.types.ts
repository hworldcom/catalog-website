import { z } from "zod";

import type {
  ProductActivationStatusSnapshot,
  ProductModerationReviewStatus,
} from "@/features/seller/product-moderation-status.types";
import type { ProductModerationSnapshot } from "@/features/seller/product-moderation-snapshot.types";

export type AdministratorModerationJson =
  | string
  | number
  | boolean
  | null
  | { [key: string]: AdministratorModerationJson }
  | AdministratorModerationJson[];

export type AdministratorProductModerationSnapshot = Omit<
  ProductModerationSnapshot,
  "facts" | "productCodeInput"
> & {
  productCodeInput: AdministratorModerationJson | null;
  facts: {
    factsRevision: number;
    facts: AdministratorModerationJson;
  } | null;
};

export const ADMINISTRATOR_MODERATION_DEFAULT_LIMIT = 25;
export const ADMINISTRATOR_MODERATION_MAX_LIMIT = 100;
export const ADMINISTRATOR_MODERATION_SUBMISSION_TYPES = [
  "new_seller",
  "seller_update",
  "initial_product",
  "product_update",
] as const;
export const ADMINISTRATOR_MODERATION_REVIEW_STATUSES = [
  "pending",
  "changes_requested",
  "approved",
  "rejected",
  "withdrawn",
] as const;
export const ADMINISTRATOR_MODERATION_ACTIVATION_STATUSES = [
  "pending",
  "running",
  "failed",
  "cleanup_required",
  "completed",
  "abandoned",
] as const;

export type AdministratorModerationSubmissionType =
  (typeof ADMINISTRATOR_MODERATION_SUBMISSION_TYPES)[number];
export type AdministratorModerationActivationStatus =
  (typeof ADMINISTRATOR_MODERATION_ACTIVATION_STATUSES)[number];

export type AdministratorModerationFilters = {
  submissionType: AdministratorModerationSubmissionType | null;
  reviewStatus: ProductModerationReviewStatus;
  activationStatus: AdministratorModerationActivationStatus | null;
  sellerId: string | null;
  limit: number;
};

export type AdministratorModerationRequest = AdministratorModerationFilters & {
  cursor: string | null;
};

export type AdministratorModerationIdentifier = {
  submissionId: string;
};

export type AdministratorModerationDecisionValue = "approve" | "request_changes" | "reject";

export type AdministratorSellerModerationDecisionRequest = {
  sellerId: string;
  submissionId: string;
  expectedRevision: number;
  decision: AdministratorModerationDecisionValue;
  reason: string | null;
  requestId: string;
};

export type AdministratorProductModerationDecisionRequest = Omit<
  AdministratorSellerModerationDecisionRequest,
  "sellerId"
>;

export type AdministratorProductActivationRecoveryRequest = {
  submissionId: string;
  runId: string;
  expectedDispatchGeneration: number;
  requestId: string;
};

export type AdministratorModerationPreview = {
  kind: "seller_logo" | "seller_cover" | "product_cover" | "none";
  deliveryStatus: "available" | "pending" | "failed" | "missing" | "unavailable";
  deliveryErrorCode: string | null;
  url: string | null;
  expiresAt: string | null;
};

type AdministratorModerationQueueItemCommon = {
  submissionType: AdministratorModerationSubmissionType;
  submissionId: string;
  seller: { sellerId: string; name: string };
  revision: number;
  submittedAt: string;
  reviewStatus: ProductModerationReviewStatus;
  sellerVisibleReason: string | null;
  preview: AdministratorModerationPreview;
};

export type AdministratorSellerModerationQueueItem = AdministratorModerationQueueItemCommon & {
  submissionType: "new_seller" | "seller_update";
  product: null;
  activation: null;
};

export type AdministratorProductModerationQueueItem = AdministratorModerationQueueItemCommon & {
  submissionType: "initial_product" | "product_update";
  product: { productId: string; title: string; productCode: string | null };
  activation: ProductActivationStatusSnapshot | null;
};

export type AdministratorModerationQueueItem =
  AdministratorSellerModerationQueueItem | AdministratorProductModerationQueueItem;

export type AdministratorModerationPage = {
  items: AdministratorModerationQueueItem[];
  nextCursor: string | null;
  normalizedFilters: AdministratorModerationFilters;
};

export const sellerSubmissionSnapshotSchema = z
  .object({
    sellerId: z.string().uuid(),
    revision: z.number().int().positive(),
    submissionKind: z.enum(["initial", "update"]),
    name: z.string().min(2).max(120),
    slug: z
      .string()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    city: z.string().max(80).nullable(),
    country: z.string().max(80).nullable(),
    whatsapp: z.string().max(40).nullable(),
    email: z
      .string()
      .max(255)
      .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
      .nullable(),
    about: z.string().max(4000).nullable(),
    logoAssetId: z.string().uuid().nullable(),
    coverAssetId: z.string().uuid().nullable(),
    establishedYear: z.number().int().min(1800).max(2100).nullable(),
  })
  .strict();

export type SellerSubmissionSnapshot = z.infer<typeof sellerSubmissionSnapshotSchema>;

export type AdministratorModerationDecision = {
  administratorUserId: string;
  decisionRequestId: string;
  decidedAt: string;
  sellerVisibleReason: string | null;
};

export type AdministratorSellerAssetDelivery = {
  assetId: string;
  kind: "logo" | "cover";
  deliveryStatus: "available" | "pending" | "failed" | "missing" | "unavailable";
  deliveryErrorCode: string | null;
  url: string | null;
};

export type AdministratorSellerModerationDetail = {
  kind: "seller";
  request: AdministratorSellerModerationQueueItem;
  decision: AdministratorModerationDecision | null;
  proposed: {
    snapshot: SellerSubmissionSnapshot;
    assets: {
      logo: AdministratorSellerAssetDelivery | null;
      cover: AdministratorSellerAssetDelivery | null;
    };
  };
  comparisonBaseline: {
    submissionId: string;
    revision: number;
    snapshot: SellerSubmissionSnapshot;
    assets: {
      logo: AdministratorSellerAssetDelivery | null;
      cover: AdministratorSellerAssetDelivery | null;
    };
  } | null;
  currentApprovedReference: { submissionId: string; revision: number } | null;
  changedFields: string[];
  actions: { canDecide: boolean };
};

export type AdministratorProductSubmissionImageDelivery = {
  productDraftImageId: string;
  position: number;
  isCover: boolean;
  deliveryStatus: "available" | "pending" | "failed" | "deleting" | "missing" | "unavailable";
  deliveryErrorCode: string | null;
  url: string | null;
  expiresAt: string | null;
};

export type AdministratorProductModerationRevision = {
  submissionId?: string;
  revision?: number;
  snapshotSchemaVersion: 1;
  snapshot: AdministratorProductModerationSnapshot;
  images: AdministratorProductSubmissionImageDelivery[];
};

export type AdministratorProductModerationDetail = {
  kind: "product";
  request: AdministratorProductModerationQueueItem;
  decision: AdministratorModerationDecision | null;
  proposed: Omit<AdministratorProductModerationRevision, "submissionId" | "revision">;
  comparisonBaseline: AdministratorProductModerationRevision | null;
  currentApprovedReference: { submissionId: string; revision: number } | null;
  changedFields: string[];
  actions: {
    canDecide: boolean;
    canRetryDispatch: boolean;
    canRetryActivation: boolean;
    canRetryPostSwitchCleanup: boolean;
  };
};

export type AdministratorModerationErrorCode =
  "moderation_request_invalid" | "moderation_submission_not_found" | "moderation_unavailable";

export type AdministratorSellerModerationActionErrorCode =
  | "seller_approval_submission_invalid"
  | "seller_approval_submission_conflict"
  | "seller_profile_revision_conflict"
  | "seller_profile_slug_conflict"
  | "seller_approval_required"
  | "seller_approval_not_found"
  | "seller_profile_image_not_ready";

export class AdministratorModerationError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 503,
    public readonly code: AdministratorModerationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdministratorModerationError";
  }
}

export class AdministratorSellerModerationActionError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 409,
    public readonly code: AdministratorSellerModerationActionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdministratorSellerModerationActionError";
  }
}

const requestSchema = z
  .object({
    submissionType: z.enum(ADMINISTRATOR_MODERATION_SUBMISSION_TYPES).nullable().optional(),
    reviewStatus: z.enum(ADMINISTRATOR_MODERATION_REVIEW_STATUSES).nullable().optional(),
    activationStatus: z.enum(ADMINISTRATOR_MODERATION_ACTIVATION_STATUSES).nullable().optional(),
    sellerId: z.string().uuid().nullable().optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(ADMINISTRATOR_MODERATION_MAX_LIMIT)
      .default(ADMINISTRATOR_MODERATION_DEFAULT_LIMIT),
    cursor: z.string().min(1).nullable().optional(),
  })
  .strict();

const identifierSchema = z.object({ submissionId: z.string().uuid() }).strict();

const decisionFieldsSchema = z.object({
  submissionId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  decision: z.enum(["approve", "request_changes", "reject"]),
  reason: z.string().nullable(),
  requestId: z.string().uuid(),
});

const sellerDecisionSchema = decisionFieldsSchema.extend({ sellerId: z.string().uuid() }).strict();

const productDecisionSchema = decisionFieldsSchema.strict();

const recoverySchema = z
  .object({
    submissionId: z.string().uuid(),
    runId: z.string().uuid(),
    expectedDispatchGeneration: z.number().int().positive(),
    requestId: z.string().uuid(),
  })
  .strict();

export function parseAdministratorModerationRequest(
  input: unknown,
): AdministratorModerationRequest {
  const parsed = requestSchema.safeParse(input ?? {});
  if (!parsed.success) throw invalidAdministratorModerationRequest();

  const submissionType = parsed.data.submissionType ?? null;
  const activationStatus = parsed.data.activationStatus ?? null;
  const explicitReviewStatus = parsed.data.reviewStatus ?? null;
  const reviewStatus = explicitReviewStatus ?? (activationStatus ? "approved" : "pending");

  if (
    activationStatus &&
    (reviewStatus !== "approved" ||
      submissionType === "new_seller" ||
      submissionType === "seller_update")
  ) {
    throw invalidAdministratorModerationRequest();
  }

  return {
    submissionType,
    reviewStatus,
    activationStatus,
    sellerId: parsed.data.sellerId ?? null,
    limit: parsed.data.limit,
    cursor: parsed.data.cursor ?? null,
  };
}

export function parseAdministratorModerationIdentifier(
  input: unknown,
): AdministratorModerationIdentifier {
  const parsed = identifierSchema.safeParse(input);
  if (!parsed.success) throw invalidAdministratorModerationRequest();
  return parsed.data;
}

export function parseAdministratorSellerModerationDecision(
  input: unknown,
): AdministratorSellerModerationDecisionRequest {
  return parseDecision(sellerDecisionSchema, input);
}

export function parseAdministratorProductModerationDecision(
  input: unknown,
): AdministratorProductModerationDecisionRequest {
  return parseDecision(productDecisionSchema, input);
}

export function parseAdministratorProductActivationRecovery(
  input: unknown,
): AdministratorProductActivationRecoveryRequest {
  const parsed = recoverySchema.safeParse(input);
  if (!parsed.success) throw invalidAdministratorModerationRequest();
  return parsed.data;
}

function parseDecision<T extends AdministratorProductModerationDecisionRequest>(
  schema: z.ZodType<T>,
  input: unknown,
): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw invalidAdministratorModerationRequest();

  const reason = normalizeAdministratorModerationReason(parsed.data.reason);
  if (
    (parsed.data.decision === "approve" && reason !== null) ||
    (parsed.data.decision !== "approve" && (reason === null || reason.length > 1000))
  ) {
    throw invalidAdministratorModerationRequest();
  }
  return { ...parsed.data, reason };
}

function normalizeAdministratorModerationReason(reason: string | null): string | null {
  const normalized = reason?.trim().replace(/\s+/g, " ") ?? "";
  return normalized || null;
}

export function invalidAdministratorModerationRequest(): AdministratorModerationError {
  return new AdministratorModerationError(
    400,
    "moderation_request_invalid",
    "The moderation request is invalid.",
  );
}

export function administratorModerationSubmissionNotFound(): AdministratorModerationError {
  return new AdministratorModerationError(
    404,
    "moderation_submission_not_found",
    "The moderation submission was not found.",
  );
}

export function administratorModerationUnavailable(): AdministratorModerationError {
  return new AdministratorModerationError(
    503,
    "moderation_unavailable",
    "Administrator moderation is temporarily unavailable.",
  );
}
