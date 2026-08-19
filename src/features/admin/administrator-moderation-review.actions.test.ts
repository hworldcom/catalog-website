import { describe, expect, it } from "vitest";

import {
  classifyAdministratorModerationActionError,
  normalizeAdministratorModerationReason,
} from "./administrator-moderation-review.actions";

describe("administrator moderation review actions", () => {
  it("normalizes seller-visible reasons before retaining an action payload", () => {
    expect(normalizeAdministratorModerationReason("  Needs   clearer\nphotos  ")).toBe(
      "Needs clearer photos",
    );
  });

  it.each([
    [undefined, "outcome_unknown"],
    ["moderation_unavailable", "outcome_unknown"],
    ["product_moderation_activation_unavailable", "outcome_unknown"],
    ["seller_profile_revision_conflict", "refresh_concurrent"],
    ["product_moderation_activation_not_retryable", "refresh_concurrent"],
    ["seller_profile_image_not_ready", "preserve_detail"],
    ["product_moderation_images_not_ready", "preserve_detail"],
    ["prototype_administrator_required", "administrator_required"],
    ["moderation_request_invalid", "invalid_request"],
    ["moderation_submission_not_found", "not_found"],
    ["seller_approval_submission_conflict", "refresh_concurrent"],
    ["seller_approval_not_found", "refresh_concurrent"],
    ["product_moderation_decision_conflict", "refresh_concurrent"],
    ["product_moderation_revision_conflict", "refresh_concurrent"],
    ["product_moderation_submission_stale", "refresh_concurrent"],
    ["product_moderation_not_found", "refresh_concurrent"],
    ["product_activation_dispatch_not_allowed", "refresh_concurrent"],
    ["product_moderation_cleanup_required", "refresh_concurrent"],
    ["seller_approval_submission_invalid", "preserve_detail"],
    ["seller_profile_slug_conflict", "preserve_detail"],
    ["seller_approval_required", "preserve_detail"],
    ["product_moderation_decision_invalid", "preserve_detail"],
    ["product_moderation_seller_approval_required", "preserve_detail"],
    ["product_activation_dispatch_invalid", "preserve_detail"],
    ["product_moderation_abandonment_not_allowed", "preserve_detail"],
  ])("maps error code %s to %s", (code, expected) => {
    const error = code ? Object.assign(new Error("safe"), { code }) : new TypeError("offline");
    expect(classifyAdministratorModerationActionError(error)).toBe(expected);
  });
});
