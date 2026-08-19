import type {
  AdministratorProductActivationRecoveryRequest,
  AdministratorProductModerationDecisionRequest,
  AdministratorSellerModerationDecisionRequest,
} from "./administrator-moderation.types";

export type AdministratorModerationReviewAction =
  | {
      kind: "seller_decision";
      payload: AdministratorSellerModerationDecisionRequest;
    }
  | {
      kind: "product_decision";
      payload: AdministratorProductModerationDecisionRequest;
    }
  | {
      kind: "retry_dispatch" | "retry_activation" | "retry_post_switch_cleanup";
      payload: AdministratorProductActivationRecoveryRequest;
    };

export type AdministratorModerationActionErrorDisposition =
  | "outcome_unknown"
  | "refresh_concurrent"
  | "preserve_detail"
  | "administrator_required"
  | "invalid_request"
  | "not_found";

const concurrentCodes = new Set([
  "seller_approval_submission_conflict",
  "seller_profile_revision_conflict",
  "seller_approval_not_found",
  "product_moderation_decision_conflict",
  "product_moderation_revision_conflict",
  "product_moderation_submission_stale",
  "product_moderation_not_found",
  "product_activation_dispatch_not_allowed",
  "product_moderation_activation_not_retryable",
  "product_moderation_cleanup_required",
]);

const preserveDetailCodes = new Set([
  "seller_approval_submission_invalid",
  "seller_profile_slug_conflict",
  "seller_approval_required",
  "seller_profile_image_not_ready",
  "product_moderation_decision_invalid",
  "product_moderation_seller_approval_required",
  "product_moderation_images_not_ready",
  "product_activation_dispatch_invalid",
  "product_moderation_abandonment_not_allowed",
]);

export function normalizeAdministratorModerationReason(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function administratorModerationActionErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

export function classifyAdministratorModerationActionError(
  error: unknown,
): AdministratorModerationActionErrorDisposition {
  const code = administratorModerationActionErrorCode(error);
  if (code === "prototype_administrator_required") return "administrator_required";
  if (code === "moderation_request_invalid") return "invalid_request";
  if (code === "moderation_submission_not_found") return "not_found";
  if (
    code === null ||
    code === "moderation_unavailable" ||
    code === "product_moderation_activation_unavailable"
  ) {
    return "outcome_unknown";
  }
  if (concurrentCodes.has(code)) return "refresh_concurrent";
  if (preserveDetailCodes.has(code)) return "preserve_detail";
  return "preserve_detail";
}
