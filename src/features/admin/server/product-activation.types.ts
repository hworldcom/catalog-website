import { z } from "zod";

export const productModerationDecisionSchema = z.enum(["approve", "request_changes", "reject"]);

export const productActivationDispatchPayloadSchema = z.object({
  runId: z.string().uuid(),
  dispatchGeneration: z.number().int().positive(),
});

export const productModerationDecisionResultSchema = z.object({
  result: z.enum(["decided", "replay"]),
  submissionId: z.string().uuid(),
  productId: z.string().uuid(),
  sellerId: z.string().uuid(),
  reviewStatus: z.enum(["changes_requested", "approved", "rejected"]),
  revision: z.number().int().positive(),
  activationRunId: z.string().uuid().nullable(),
  dispatchGeneration: z.number().int().positive().nullable(),
  dispatchRequired: z.boolean(),
});

export const productActivationDispatchResultSchema = z.object({
  result: z.enum(["recorded", "replay", "stale", "retried"]),
  runId: z.string().uuid(),
  dispatchGeneration: z.number().int().positive(),
  dispatchStatus: z.enum(["pending", "dispatched", "failed"]),
  dispatchRequired: z.boolean(),
});

export const productActivationRecoveryResultSchema = z.object({
  result: z.enum(["recorded", "replay"]),
  runId: z.string().uuid(),
  productId: z.string().uuid(),
  sellerId: z.string().uuid(),
  phase: z.enum(["activation", "pre_switch_cleanup", "post_switch_cleanup"]),
  status: z.enum(["pending", "abandoned"]),
  dispatchGeneration: z.number().int().positive(),
  dispatchStatus: z.enum(["pending", "dispatched", "failed"]),
  dispatchRequired: z.boolean(),
});

export type ProductModerationDecision = z.infer<typeof productModerationDecisionSchema>;
export type ProductActivationDispatchPayload = z.infer<
  typeof productActivationDispatchPayloadSchema
>;
export type ProductModerationDecisionResult = z.infer<typeof productModerationDecisionResultSchema>;
export type ProductActivationDispatchResult = z.infer<typeof productActivationDispatchResultSchema>;
export type ProductActivationRecoveryResult = z.infer<typeof productActivationRecoveryResultSchema>;

export type ProductActivationPhase = "activation" | "pre_switch_cleanup" | "post_switch_cleanup";

export type ProductActivationImageContentType = "image/jpeg" | "image/png" | "image/webp";

export type ProductActivationItem = {
  productDraftImageId: string;
  sourceBucket: "product-draft-images";
  sourceObjectKey: string;
  destinationKey: string;
  sourcePosition: number;
  publicationOrder: number;
  isCover: boolean;
  expectedSourceSizeBytes: number;
  expectedContentType: ProductActivationImageContentType;
  sourceSha256: string | null;
  publicSizeBytes: number | null;
  publicSha256: string | null;
  publicEtag: string | null;
  publicUrl: string | null;
  objectCreatedByAttemptToken: string | null;
};

export type ClaimedProductActivation = {
  result: "claimed";
  phase: "activation";
  runId: string;
  submissionId: string;
  productId: string;
  sellerId: string;
  dispatchGeneration: number;
  attemptCount: number;
  attemptToken: string;
  snapshotHash: string;
  expectedSubmissionRevision: number;
  snapshot: Record<string, unknown>;
  items: ProductActivationItem[];
};

export type ProductActivationCleanupItem = {
  destinationKey: string;
  cleanupKind: "uncommitted_activation" | "superseded_public";
  expectedSizeBytes: number;
  expectedSha256: string;
  expectedEtag: string | null;
};

export type ClaimedProductActivationCleanup = {
  result: "claimed";
  phase: "pre_switch_cleanup" | "post_switch_cleanup";
  runId: string;
  submissionId: string;
  productId: string;
  sellerId: string;
  dispatchGeneration: number;
  attemptCount: number;
  attemptToken: string;
  cleanupItems: ProductActivationCleanupItem[];
};

export type ProductActivationClaimResult =
  | ClaimedProductActivation
  | ClaimedProductActivationCleanup
  | { result: "owned" }
  | { result: "stale" }
  | { result: "not_found" };

export type ProductActivationItemWriteResult =
  "recorded" | "verified" | "replay" | "stale" | "conflict";

export type ProductActivationFailureResult =
  "failed_retryable" | "failed_non_retryable" | "replay" | "stale";

export type ProductActivationFinalizationResult =
  "completed" | "cleanup_pending" | "stale" | "not_found" | "not_allowed";

export type ProductActivationCleanupItemResult = "completed" | "failed" | "replay" | "stale";

export type ProductActivationCleanupFinalizationResult =
  "completed" | "abandoned" | "cleanup_required" | "stale" | "not_found" | "not_allowed";

export type ProductActivationWorkerErrorCode =
  | "product_publication_source_unavailable"
  | "product_publication_source_changed"
  | "product_publication_destination_conflict"
  | "product_publication_transfer_failed"
  | "product_publication_verification_failed"
  | "product_publication_finalization_failed"
  | "product_moderation_submission_stale";

export type ProductActivationCleanupWorkerErrorCode =
  "product_activation_cleanup_destination_conflict" | "product_activation_cleanup_failed";

export type ProductActivationWorkerResult =
  | { status: "idle" | "already_owned" | "stale" }
  | {
      status:
        | "completed"
        | "abandoned"
        | "cleanup_pending"
        | "cleanup_required"
        | "failed"
        | "claim_lost";
      runId: string;
      dispatchGeneration: number;
      attemptCount?: number;
      errorCode?: ProductActivationWorkerErrorCode | ProductActivationCleanupWorkerErrorCode;
    };

export class ProductActivationClaimLostError extends Error {
  constructor() {
    super("The product activation attempt no longer owns its claim.");
    this.name = "ProductActivationClaimLostError";
  }
}

export class ProductActivationWorkerError extends Error {
  constructor(
    public readonly code: ProductActivationWorkerErrorCode,
    public readonly productDraftImageId?: string,
  ) {
    super(code);
    this.name = "ProductActivationWorkerError";
  }
}

export type ProductActivationErrorCode =
  | "product_moderation_decision_invalid"
  | "product_moderation_decision_conflict"
  | "product_moderation_revision_conflict"
  | "product_moderation_submission_stale"
  | "product_moderation_seller_approval_required"
  | "product_moderation_images_not_ready"
  | "product_activation_dispatch_invalid"
  | "product_activation_dispatch_not_allowed"
  | "product_moderation_activation_not_retryable"
  | "product_moderation_abandonment_not_allowed"
  | "product_moderation_cleanup_required"
  | "product_moderation_not_found"
  | "product_moderation_activation_unavailable";

export class ProductActivationError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 409 | 503,
    public readonly code: ProductActivationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProductActivationError";
  }
}
