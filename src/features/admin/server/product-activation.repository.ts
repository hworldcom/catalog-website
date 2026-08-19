import { z } from "zod";

import {
  type ProductActivationClaimResult,
  type ProductActivationCleanupFinalizationResult,
  type ProductActivationCleanupItemResult,
  ProductActivationError,
  type ProductActivationErrorCode,
  productActivationDispatchResultSchema,
  type ProductActivationDispatchResult,
  type ProductActivationFailureResult,
  type ProductActivationFinalizationResult,
  type ProductActivationItemWriteResult,
  productActivationRecoveryResultSchema,
  type ProductActivationRecoveryResult,
  type ProductActivationWorkerErrorCode,
  productActivationDispatchPayloadSchema,
  type ProductActivationDispatchPayload,
  type ProductModerationDecision,
  productModerationDecisionResultSchema,
  type ProductModerationDecisionResult,
} from "./product-activation.types";

type RpcParameters = Record<string, unknown>;

export interface ProductActivationAdministrator {
  rpc: (
    operation: string,
    parameters: RpcParameters,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
}

export interface ProductActivationRepository {
  decide(input: {
    submissionId: string;
    expectedRevision: number;
    decision: ProductModerationDecision;
    reason: string | null;
    decisionRequestId: string;
    administratorUserId: string;
  }): Promise<ProductModerationDecisionResult>;
  recordDispatchResult(input: {
    runId: string;
    dispatchGeneration: number;
    result: "dispatched" | "failed";
  }): Promise<ProductActivationDispatchResult>;
  retryDispatch(input: {
    runId: string;
    expectedDispatchGeneration: number;
    requestId: string;
    actorUserId: string;
  }): Promise<ProductActivationDispatchResult>;
  retryActivation(input: {
    runId: string;
    expectedDispatchGeneration: number;
    requestId: string;
    administratorUserId: string;
  }): Promise<ProductActivationRecoveryResult>;
  requestAbandonment(input: {
    runId: string;
    expectedDispatchGeneration: number;
    requestId: string;
    sellerId: string;
  }): Promise<ProductActivationRecoveryResult>;
  retryCleanup(input: {
    runId: string;
    expectedDispatchGeneration: number;
    requestId: string;
    actorUserId: string;
  }): Promise<ProductActivationRecoveryResult>;
  retryAdministratorPostSwitchCleanup(input: {
    runId: string;
    expectedDispatchGeneration: number;
    requestId: string;
    administratorUserId: string;
  }): Promise<ProductActivationRecoveryResult>;
  claimRun(
    payload: ProductActivationDispatchPayload,
    claimTimeoutSeconds: number,
  ): Promise<ProductActivationClaimResult>;
  continueCleanup(input: {
    runId: string;
    dispatchGeneration: number;
    attemptToken: string;
    claimTimeoutSeconds: number;
  }): Promise<ProductActivationClaimResult>;
  recordObjectCreated(input: {
    runId: string;
    dispatchGeneration: number;
    attemptToken: string;
    productDraftImageId: string;
    sourceSha256: string;
    publicSizeBytes: number;
    publicSha256: string;
    publicEtag: string | null;
    publicUrl: string;
  }): Promise<ProductActivationItemWriteResult>;
  verifyItem(input: {
    runId: string;
    dispatchGeneration: number;
    attemptToken: string;
    productDraftImageId: string;
    verifiedSizeBytes: number;
    verifiedSha256: string;
    verifiedEtag: string | null;
  }): Promise<ProductActivationItemWriteResult>;
  failAttempt(input: {
    runId: string;
    dispatchGeneration: number;
    attemptToken: string;
    productDraftImageId: string;
    errorCode: ProductActivationWorkerErrorCode;
  }): Promise<ProductActivationFailureResult>;
  failWorkerStart(
    payload: ProductActivationDispatchPayload,
  ): Promise<ProductActivationFailureResult>;
  finalize(input: {
    runId: string;
    dispatchGeneration: number;
    attemptToken: string;
  }): Promise<ProductActivationFinalizationResult>;
  recordCleanupItemResult(input: {
    runId: string;
    dispatchGeneration: number;
    attemptToken: string;
    destinationKey: string;
    result: "completed" | "failed";
    errorCode:
      | "product_activation_cleanup_destination_conflict"
      | "product_activation_cleanup_failed"
      | null;
  }): Promise<ProductActivationCleanupItemResult>;
  finalizeCleanup(input: {
    runId: string;
    dispatchGeneration: number;
    attemptToken: string;
  }): Promise<ProductActivationCleanupFinalizationResult>;
  listRecoverableDispatches(
    claimTimeoutSeconds: number,
    limit: number,
  ): Promise<ProductActivationDispatchPayload[]>;
}

const decisionRowSchema = z.object({
  result: z.enum(["decided", "replay"]),
  submission_id: z.string().uuid(),
  product_id: z.string().uuid(),
  seller_id: z.string().uuid(),
  review_status: z.enum(["changes_requested", "approved", "rejected"]),
  revision: z.number().int().positive(),
  activation_run_id: z.string().uuid().nullable(),
  dispatch_generation: z.number().int().positive().nullable(),
  dispatch_required: z.boolean(),
});

const dispatchRowSchema = z.object({
  result: z.enum(["recorded", "replay", "stale", "retried"]),
  run_id: z.string().uuid(),
  dispatch_generation: z.number().int().positive(),
  dispatch_status: z.enum(["pending", "dispatched", "failed"]),
  dispatch_required: z.boolean(),
});

const recoveryRowSchema = z.object({
  result: z.enum(["recorded", "replay"]),
  run_id: z.string().uuid(),
  product_id: z.string().uuid(),
  seller_id: z.string().uuid(),
  phase: z.enum(["activation", "pre_switch_cleanup", "post_switch_cleanup"]),
  status: z.enum(["pending", "abandoned"]),
  dispatch_generation: z.number().int().positive(),
  dispatch_status: z.enum(["pending", "dispatched", "failed"]),
  dispatch_required: z.boolean(),
});

const activationItemSchema = z.object({
  productDraftImageId: z.string().uuid(),
  sourceBucket: z.literal("product-draft-images"),
  sourceObjectKey: z.string().min(1),
  destinationKey: z.string().min(1),
  sourcePosition: z.number().int().nonnegative(),
  publicationOrder: z.number().int().nonnegative(),
  isCover: z.boolean(),
  expectedSourceSizeBytes: z.number().int().positive(),
  expectedContentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sourceSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  publicSizeBytes: z.number().int().positive().nullable(),
  publicSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  publicEtag: z.string().nullable(),
  publicUrl: z.string().url().nullable(),
  objectCreatedByAttemptToken: z.string().uuid().nullable(),
});

const activationClaimSchema = z.discriminatedUnion("result", [
  z.object({ result: z.enum(["owned", "stale", "not_found"]) }),
  z.object({
    result: z.literal("claimed"),
    runId: z.string().uuid(),
    submissionId: z.string().uuid(),
    productId: z.string().uuid(),
    sellerId: z.string().uuid(),
    dispatchGeneration: z.number().int().positive(),
    attemptCount: z.number().int().positive(),
    attemptToken: z.string().uuid(),
    snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
    expectedSubmissionRevision: z.number().int().positive(),
    snapshot: z.record(z.unknown()),
    items: z.array(activationItemSchema),
  }),
]);

const cleanupItemSchema = z.object({
  destinationKey: z.string().min(1),
  cleanupKind: z.enum(["uncommitted_activation", "superseded_public"]),
  expectedSizeBytes: z.number().int().positive(),
  expectedSha256: z.string().regex(/^[0-9a-f]{64}$/),
  expectedEtag: z.string().nullable(),
});

const cleanupClaimSchema = z.discriminatedUnion("result", [
  z.object({ result: z.enum(["owned", "stale", "not_found"]) }),
  z.object({
    result: z.literal("claimed"),
    phase: z.enum(["pre_switch_cleanup", "post_switch_cleanup"]),
    runId: z.string().uuid(),
    submissionId: z.string().uuid(),
    productId: z.string().uuid(),
    sellerId: z.string().uuid(),
    dispatchGeneration: z.number().int().positive(),
    attemptCount: z.number().int().positive(),
    attemptToken: z.string().uuid(),
    cleanupItems: z.array(cleanupItemSchema),
  }),
]);

const itemWriteResultSchema = z.enum(["recorded", "verified", "replay", "stale", "conflict"]);
const failureResultSchema = z.enum(["failed_retryable", "failed_non_retryable", "replay", "stale"]);
const finalizationResultSchema = z.enum([
  "completed",
  "cleanup_pending",
  "stale",
  "not_found",
  "not_allowed",
]);
const cleanupItemResultSchema = z.enum(["completed", "failed", "replay", "stale"]);
const cleanupFinalizationResultSchema = z.enum([
  "completed",
  "abandoned",
  "cleanup_required",
  "stale",
  "not_found",
  "not_allowed",
]);
const recoverableDispatchRowSchema = z.object({
  run_id: z.string().uuid(),
  dispatch_generation: z.number().int().positive(),
});

export class SupabaseProductActivationRepository implements ProductActivationRepository {
  constructor(private readonly administrator: ProductActivationAdministrator) {}

  async decide(input: {
    submissionId: string;
    expectedRevision: number;
    decision: ProductModerationDecision;
    reason: string | null;
    decisionRequestId: string;
    administratorUserId: string;
  }): Promise<ProductModerationDecisionResult> {
    const row = await this.runSingleRow(
      "decide_product_moderation_submission",
      {
        p_submission_id: input.submissionId,
        p_expected_revision: input.expectedRevision,
        p_decision: input.decision,
        p_reason: input.reason,
        p_decision_request_id: input.decisionRequestId,
        p_administrator_user_id: input.administratorUserId,
      },
      decisionRowSchema,
    );
    return productModerationDecisionResultSchema.parse({
      result: row.result,
      submissionId: row.submission_id,
      productId: row.product_id,
      sellerId: row.seller_id,
      reviewStatus: row.review_status,
      revision: row.revision,
      activationRunId: row.activation_run_id,
      dispatchGeneration: row.dispatch_generation,
      dispatchRequired: row.dispatch_required,
    });
  }

  async recordDispatchResult(input: {
    runId: string;
    dispatchGeneration: number;
    result: "dispatched" | "failed";
  }): Promise<ProductActivationDispatchResult> {
    return mapDispatchRow(
      await this.runSingleRow(
        "record_product_activation_dispatch_result",
        {
          p_run_id: input.runId,
          p_dispatch_generation: input.dispatchGeneration,
          p_result: input.result,
        },
        dispatchRowSchema,
      ),
    );
  }

  async retryDispatch(input: {
    runId: string;
    expectedDispatchGeneration: number;
    requestId: string;
    actorUserId: string;
  }): Promise<ProductActivationDispatchResult> {
    return mapDispatchRow(
      await this.runSingleRow(
        "retry_product_activation_dispatch",
        {
          p_run_id: input.runId,
          p_expected_dispatch_generation: input.expectedDispatchGeneration,
          p_request_id: input.requestId,
          p_actor_user_id: input.actorUserId,
        },
        dispatchRowSchema,
      ),
    );
  }

  async retryActivation(input: {
    runId: string;
    expectedDispatchGeneration: number;
    requestId: string;
    administratorUserId: string;
  }): Promise<ProductActivationRecoveryResult> {
    return mapRecoveryRow(
      await this.runSingleRow(
        "retry_product_activation_run",
        {
          p_run_id: input.runId,
          p_expected_dispatch_generation: input.expectedDispatchGeneration,
          p_request_id: input.requestId,
          p_administrator_user_id: input.administratorUserId,
        },
        recoveryRowSchema,
      ),
    );
  }

  async requestAbandonment(input: {
    runId: string;
    expectedDispatchGeneration: number;
    requestId: string;
    sellerId: string;
  }): Promise<ProductActivationRecoveryResult> {
    return mapRecoveryRow(
      await this.runSingleRow(
        "request_product_activation_abandonment",
        {
          p_run_id: input.runId,
          p_expected_dispatch_generation: input.expectedDispatchGeneration,
          p_request_id: input.requestId,
          p_seller_id: input.sellerId,
        },
        recoveryRowSchema,
      ),
    );
  }

  async retryCleanup(input: {
    runId: string;
    expectedDispatchGeneration: number;
    requestId: string;
    actorUserId: string;
  }): Promise<ProductActivationRecoveryResult> {
    return mapRecoveryRow(
      await this.runSingleRow(
        "retry_product_activation_cleanup",
        {
          p_run_id: input.runId,
          p_expected_dispatch_generation: input.expectedDispatchGeneration,
          p_request_id: input.requestId,
          p_actor_user_id: input.actorUserId,
        },
        recoveryRowSchema,
      ),
    );
  }

  async retryAdministratorPostSwitchCleanup(input: {
    runId: string;
    expectedDispatchGeneration: number;
    requestId: string;
    administratorUserId: string;
  }): Promise<ProductActivationRecoveryResult> {
    return mapRecoveryRow(
      await this.runSingleRow(
        "retry_administrator_product_activation_post_switch_cleanup",
        {
          p_run_id: input.runId,
          p_expected_dispatch_generation: input.expectedDispatchGeneration,
          p_request_id: input.requestId,
          p_administrator_user_id: input.administratorUserId,
        },
        recoveryRowSchema,
      ),
    );
  }

  async claimRun(
    payload: ProductActivationDispatchPayload,
    claimTimeoutSeconds: number,
  ): Promise<ProductActivationClaimResult> {
    productActivationDispatchPayloadSchema.parse(payload);
    const activation = await this.runJsonValue(
      "claim_product_activation_run",
      {
        p_run_id: payload.runId,
        p_dispatch_generation: payload.dispatchGeneration,
        p_claim_timeout_seconds: claimTimeoutSeconds,
      },
      activationClaimSchema,
    );
    if (activation.result === "claimed") {
      return { ...activation, phase: "activation" };
    }
    if (activation.result !== "stale") return activation;
    return this.claimCleanup(payload, claimTimeoutSeconds, null);
  }

  async continueCleanup(input: {
    runId: string;
    dispatchGeneration: number;
    attemptToken: string;
    claimTimeoutSeconds: number;
  }): Promise<ProductActivationClaimResult> {
    return this.claimCleanup(
      { runId: input.runId, dispatchGeneration: input.dispatchGeneration },
      input.claimTimeoutSeconds,
      input.attemptToken,
    );
  }

  async recordObjectCreated(input: {
    runId: string;
    dispatchGeneration: number;
    attemptToken: string;
    productDraftImageId: string;
    sourceSha256: string;
    publicSizeBytes: number;
    publicSha256: string;
    publicEtag: string | null;
    publicUrl: string;
  }): Promise<ProductActivationItemWriteResult> {
    return this.runJsonValue(
      "record_product_activation_object_created",
      {
        p_run_id: input.runId,
        p_dispatch_generation: input.dispatchGeneration,
        p_attempt_token: input.attemptToken,
        p_product_draft_image_id: input.productDraftImageId,
        p_source_sha256: input.sourceSha256,
        p_public_size_bytes: input.publicSizeBytes,
        p_public_sha256: input.publicSha256,
        p_public_etag: input.publicEtag,
        p_public_url: input.publicUrl,
      },
      itemWriteResultSchema,
    );
  }

  async verifyItem(input: {
    runId: string;
    dispatchGeneration: number;
    attemptToken: string;
    productDraftImageId: string;
    verifiedSizeBytes: number;
    verifiedSha256: string;
    verifiedEtag: string | null;
  }): Promise<ProductActivationItemWriteResult> {
    return this.runJsonValue(
      "verify_product_activation_item",
      {
        p_run_id: input.runId,
        p_dispatch_generation: input.dispatchGeneration,
        p_attempt_token: input.attemptToken,
        p_product_draft_image_id: input.productDraftImageId,
        p_verified_size_bytes: input.verifiedSizeBytes,
        p_verified_sha256: input.verifiedSha256,
        p_verified_etag: input.verifiedEtag,
      },
      itemWriteResultSchema,
    );
  }

  async failAttempt(input: {
    runId: string;
    dispatchGeneration: number;
    attemptToken: string;
    productDraftImageId: string;
    errorCode: ProductActivationWorkerErrorCode;
  }): Promise<ProductActivationFailureResult> {
    return this.runJsonValue(
      "fail_product_activation_attempt",
      {
        p_run_id: input.runId,
        p_dispatch_generation: input.dispatchGeneration,
        p_attempt_token: input.attemptToken,
        p_product_draft_image_id: input.productDraftImageId,
        p_error_code: input.errorCode,
      },
      failureResultSchema,
    );
  }

  async failWorkerStart(
    payload: ProductActivationDispatchPayload,
  ): Promise<ProductActivationFailureResult> {
    return this.runJsonValue(
      "fail_product_activation_worker_start",
      {
        p_run_id: payload.runId,
        p_dispatch_generation: payload.dispatchGeneration,
        p_error_code: "product_activation_worker_start_failed",
      },
      failureResultSchema,
    );
  }

  async finalize(input: {
    runId: string;
    dispatchGeneration: number;
    attemptToken: string;
  }): Promise<ProductActivationFinalizationResult> {
    return this.runJsonValue(
      "finalize_product_activation",
      {
        p_run_id: input.runId,
        p_dispatch_generation: input.dispatchGeneration,
        p_attempt_token: input.attemptToken,
      },
      finalizationResultSchema,
    );
  }

  async recordCleanupItemResult(input: {
    runId: string;
    dispatchGeneration: number;
    attemptToken: string;
    destinationKey: string;
    result: "completed" | "failed";
    errorCode:
      | "product_activation_cleanup_destination_conflict"
      | "product_activation_cleanup_failed"
      | null;
  }): Promise<ProductActivationCleanupItemResult> {
    return this.runJsonValue(
      "record_product_activation_cleanup_item_result",
      {
        p_run_id: input.runId,
        p_dispatch_generation: input.dispatchGeneration,
        p_attempt_token: input.attemptToken,
        p_destination_key: input.destinationKey,
        p_result: input.result,
        p_error_code: input.errorCode,
      },
      cleanupItemResultSchema,
    );
  }

  async finalizeCleanup(input: {
    runId: string;
    dispatchGeneration: number;
    attemptToken: string;
  }): Promise<ProductActivationCleanupFinalizationResult> {
    return this.runJsonValue(
      "finalize_product_activation_cleanup",
      {
        p_run_id: input.runId,
        p_dispatch_generation: input.dispatchGeneration,
        p_attempt_token: input.attemptToken,
      },
      cleanupFinalizationResultSchema,
    );
  }

  async listRecoverableDispatches(
    claimTimeoutSeconds: number,
    limit: number,
  ): Promise<ProductActivationDispatchPayload[]> {
    const response = await this.administrator.rpc(
      "list_recoverable_product_activation_dispatches",
      { p_claim_timeout_seconds: claimTimeoutSeconds, p_limit: limit },
    );
    if (response.error) throw productActivationDatabaseError(response.error);
    const rows = z.array(recoverableDispatchRowSchema).safeParse(response.data);
    if (!rows.success) {
      console.error("[Product activation] Database response was invalid.", {
        operation: "list_recoverable_product_activation_dispatches",
      });
      throw productActivationError("product_moderation_activation_unavailable");
    }
    return rows.data.map((row) => ({
      runId: row.run_id,
      dispatchGeneration: row.dispatch_generation,
    }));
  }

  private claimCleanup(
    payload: ProductActivationDispatchPayload,
    claimTimeoutSeconds: number,
    continuingAttemptToken: string | null,
  ): Promise<ProductActivationClaimResult> {
    return this.runJsonValue(
      "claim_product_activation_cleanup",
      {
        p_run_id: payload.runId,
        p_dispatch_generation: payload.dispatchGeneration,
        p_claim_timeout_seconds: claimTimeoutSeconds,
        p_continuing_attempt_token: continuingAttemptToken,
      },
      cleanupClaimSchema,
    );
  }

  private async runSingleRow<T>(
    operation: string,
    parameters: RpcParameters,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const response = await this.administrator.rpc(operation, parameters);
    if (response.error) throw productActivationDatabaseError(response.error);
    const parsed = z.array(schema).safeParse(response.data);
    if (!parsed.success || parsed.data.length !== 1) {
      console.error("[Product activation] Database response was invalid.", { operation });
      throw productActivationError("product_moderation_activation_unavailable");
    }
    return parsed.data[0]!;
  }

  private async runJsonValue<T>(
    operation: string,
    parameters: RpcParameters,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const response = await this.administrator.rpc(operation, parameters);
    if (response.error) throw productActivationDatabaseError(response.error);
    const parsed = schema.safeParse(response.data);
    if (!parsed.success) {
      console.error("[Product activation] Database response was invalid.", { operation });
      throw productActivationError("product_moderation_activation_unavailable");
    }
    return parsed.data;
  }
}

function mapDispatchRow(row: z.infer<typeof dispatchRowSchema>): ProductActivationDispatchResult {
  return productActivationDispatchResultSchema.parse({
    result: row.result,
    runId: row.run_id,
    dispatchGeneration: row.dispatch_generation,
    dispatchStatus: row.dispatch_status,
    dispatchRequired: row.dispatch_required,
  });
}

function mapRecoveryRow(row: z.infer<typeof recoveryRowSchema>): ProductActivationRecoveryResult {
  return productActivationRecoveryResultSchema.parse({
    result: row.result,
    runId: row.run_id,
    productId: row.product_id,
    sellerId: row.seller_id,
    phase: row.phase,
    status: row.status,
    dispatchGeneration: row.dispatch_generation,
    dispatchStatus: row.dispatch_status,
    dispatchRequired: row.dispatch_required,
  });
}

function productActivationDatabaseError(error: { message: string }): ProductActivationError {
  const code = productActivationCodes.find((candidate) => error.message.includes(candidate));
  if (code) return productActivationError(code);
  console.error("[Product activation] Database operation failed.", { message: error.message });
  return productActivationError("product_moderation_activation_unavailable");
}

const productActivationCodes: ProductActivationErrorCode[] = [
  "product_moderation_decision_invalid",
  "product_moderation_decision_conflict",
  "product_moderation_revision_conflict",
  "product_moderation_submission_stale",
  "product_moderation_seller_approval_required",
  "product_moderation_images_not_ready",
  "product_activation_dispatch_invalid",
  "product_activation_dispatch_not_allowed",
  "product_moderation_activation_not_retryable",
  "product_moderation_abandonment_not_allowed",
  "product_moderation_cleanup_required",
  "product_moderation_not_found",
];

function productActivationError(code: ProductActivationErrorCode): ProductActivationError {
  const details: Record<
    ProductActivationErrorCode,
    { status: 400 | 404 | 409 | 503; message: string }
  > = {
    product_moderation_decision_invalid: {
      status: 400,
      message: "The product moderation decision is invalid.",
    },
    product_moderation_decision_conflict: {
      status: 409,
      message: "This decision request conflicts with an earlier decision.",
    },
    product_moderation_revision_conflict: {
      status: 409,
      message: "The product revision changed before the decision was applied.",
    },
    product_moderation_submission_stale: {
      status: 409,
      message: "This product submission is no longer active.",
    },
    product_moderation_seller_approval_required: {
      status: 409,
      message: "The seller must remain approved before this product can be approved.",
    },
    product_moderation_images_not_ready: {
      status: 409,
      message: "The approved image manifest is no longer ready.",
    },
    product_activation_dispatch_invalid: {
      status: 400,
      message: "The activation dispatch request is invalid.",
    },
    product_activation_dispatch_not_allowed: {
      status: 409,
      message: "The activation cannot be dispatched from its current state.",
    },
    product_moderation_activation_not_retryable: {
      status: 409,
      message: "This activation failure cannot be retried against the approved revision.",
    },
    product_moderation_abandonment_not_allowed: {
      status: 409,
      message: "This activation run cannot be abandoned from its current state.",
    },
    product_moderation_cleanup_required: {
      status: 409,
      message: "Activation cleanup must be completed before this operation can continue.",
    },
    product_moderation_not_found: { status: 404, message: "The product was not found." },
    product_moderation_activation_unavailable: {
      status: 503,
      message: "Product activation is temporarily unavailable.",
    },
  };
  const detail = details[code];
  return new ProductActivationError(detail.status, code, detail.message);
}
