import type {
  ProductActivationDisplayState,
  ProductActivationStatusSnapshot,
  ProductModerationReview,
  ProductModerationStatusCommon,
} from "../product-moderation-status.types";
import type { ProductModerationStatusRecord } from "./product-moderation-status.repository";

export type ProductActivationStatusRecord = Pick<
  ProductModerationStatusRecord,
  | "activation_run_id"
  | "activation_phase"
  | "activation_status"
  | "activation_dispatch_status"
  | "activation_dispatch_generation"
  | "activation_dispatch_error_code"
  | "activation_error_code"
>;

export class ProductModerationStatusMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductModerationStatusMappingError";
  }
}

export function mapProductModerationStatus(
  record: ProductModerationStatusRecord,
): ProductModerationStatusCommon {
  const review = mapReview(record);
  const activation = mapProductActivationStatus(record);

  if (review?.status === "approved" && !activation) {
    throw invalidState("An approved review has no matching activation run.");
  }
  if (review?.status !== "approved" && activation) {
    throw invalidState("A non-approved review has an activation run.");
  }

  return {
    productId: record.id,
    publicState: record.status,
    actionRevision: record.moderation_revision,
    hasWorkingCopy: record.has_working_copy,
    review,
    activation,
    actions: {
      canEdit: record.can_edit,
      canSubmit: record.can_submit,
      canWithdraw: record.can_withdraw,
      canAbandonFailedActivation: record.can_abandon_failed_activation,
      canRetryAbandonmentCleanup: record.can_retry_abandonment_cleanup,
      canArchive: record.can_archive,
      canRestore: record.can_restore,
    },
  };
}

function mapReview(record: ProductModerationStatusRecord): ProductModerationReview | null {
  if (record.review_submission_id === null) {
    if (
      record.review_kind !== null ||
      record.review_revision !== null ||
      record.review_status !== null ||
      record.review_submitted_at !== null ||
      record.review_decided_at !== null ||
      record.review_seller_visible_reason !== null
    ) {
      throw invalidState("Review fields exist without a review identifier.");
    }
    return null;
  }
  if (
    record.review_kind === null ||
    record.review_revision === null ||
    record.review_status === null ||
    record.review_submitted_at === null
  ) {
    throw invalidState("A selected review is incomplete.");
  }
  return {
    submissionId: record.review_submission_id,
    kind: record.review_kind,
    revision: record.review_revision,
    status: record.review_status,
    submittedAt: record.review_submitted_at,
    decidedAt: record.review_decided_at,
    sellerVisibleReason: record.review_seller_visible_reason,
  };
}

export function mapProductActivationStatus(
  record: ProductActivationStatusRecord,
): ProductActivationStatusSnapshot | null {
  if (record.activation_run_id === null) {
    if (
      record.activation_phase !== null ||
      record.activation_status !== null ||
      record.activation_dispatch_status !== null ||
      record.activation_dispatch_generation !== null ||
      record.activation_dispatch_error_code !== null ||
      record.activation_error_code !== null
    ) {
      throw invalidState("Activation fields exist without a run identifier.");
    }
    return null;
  }
  if (
    record.activation_phase === null ||
    record.activation_status === null ||
    record.activation_dispatch_status === null ||
    record.activation_dispatch_generation === null
  ) {
    throw invalidState("A selected activation run is incomplete.");
  }
  return {
    runId: record.activation_run_id,
    phase: record.activation_phase,
    status: record.activation_status,
    dispatchStatus: record.activation_dispatch_status,
    dispatchGeneration: record.activation_dispatch_generation,
    dispatchErrorCode: record.activation_dispatch_error_code,
    errorCode: record.activation_error_code,
    displayState: activationDisplayState(record),
  };
}

function activationDisplayState(
  record: ProductActivationStatusRecord,
): ProductActivationDisplayState {
  if (record.activation_status === "completed") return "completed";
  if (record.activation_status === "abandoned") return "abandoned";
  if (record.activation_dispatch_status === "failed") return "dispatch_failed";

  if (record.activation_phase === "activation") {
    if (record.activation_status === "pending" && record.activation_dispatch_status === "pending") {
      return "waiting_for_dispatch";
    }
    if (
      (record.activation_status === "pending" || record.activation_status === "running") &&
      record.activation_dispatch_status === "dispatched"
    ) {
      return "publishing";
    }
    if (record.activation_status === "failed") return "activation_failed";
  }

  if (record.activation_phase === "pre_switch_cleanup") {
    if (record.activation_status === "pending" || record.activation_status === "running") {
      return "abandonment_cleanup";
    }
    if (record.activation_status === "cleanup_required") {
      return "abandonment_cleanup_required";
    }
  }

  if (record.activation_phase === "post_switch_cleanup") {
    if (record.activation_status === "pending" || record.activation_status === "running") {
      return "public_cleanup";
    }
    if (record.activation_status === "cleanup_required") return "public_cleanup_required";
  }

  throw invalidState("The activation phase, status, and dispatch state are inconsistent.");
}

function invalidState(message: string): ProductModerationStatusMappingError {
  return new ProductModerationStatusMappingError(message);
}
