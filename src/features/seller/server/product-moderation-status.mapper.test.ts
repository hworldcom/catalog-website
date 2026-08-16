import { describe, expect, it } from "vitest";

import type { ProductActivationDisplayState } from "../product-moderation-status.types";
import { mapProductModerationStatus } from "./product-moderation-status.mapper";
import type { ProductModerationStatusRecord } from "./product-moderation-status.repository";

describe("mapProductModerationStatus", () => {
  it.each([
    ["activation", "pending", "pending", "waiting_for_dispatch"],
    ["activation", "pending", "failed", "dispatch_failed"],
    ["activation", "pending", "dispatched", "publishing"],
    ["activation", "running", "dispatched", "publishing"],
    ["activation", "failed", "dispatched", "activation_failed"],
    ["pre_switch_cleanup", "pending", "pending", "abandonment_cleanup"],
    ["pre_switch_cleanup", "running", "dispatched", "abandonment_cleanup"],
    ["pre_switch_cleanup", "cleanup_required", "dispatched", "abandonment_cleanup_required"],
    ["post_switch_cleanup", "pending", "pending", "public_cleanup"],
    ["post_switch_cleanup", "running", "dispatched", "public_cleanup"],
    ["post_switch_cleanup", "cleanup_required", "dispatched", "public_cleanup_required"],
    ["post_switch_cleanup", "completed", "dispatched", "completed"],
    ["pre_switch_cleanup", "abandoned", "dispatched", "abandoned"],
  ] as const)(
    "maps %s/%s/%s to %s",
    (phase, status, dispatchStatus, displayState: ProductActivationDisplayState) => {
      const mapped = mapProductModerationStatus(
        approved({
          activation_phase: phase,
          activation_status: status,
          activation_dispatch_status: dispatchStatus,
          activation_dispatch_error_code:
            dispatchStatus === "failed" ? "product_activation_dispatch_failed" : null,
        }),
      );

      expect(mapped.activation?.displayState).toBe(displayState);
    },
  );

  it("maps the review and backend-derived actions without changing them", () => {
    const mapped = mapProductModerationStatus(
      record({
        review_submission_id: uuid(2),
        review_kind: "update",
        review_revision: 7,
        review_status: "changes_requested",
        review_submitted_at: "2026-08-16T10:00:00.000Z",
        review_decided_at: "2026-08-16T11:00:00.000Z",
        review_seller_visible_reason: "Add a clearer cover.",
        has_working_copy: true,
        can_edit: true,
        can_submit: true,
      }),
    );

    expect(mapped).toMatchObject({
      productId: uuid(1),
      publicState: "draft",
      actionRevision: 3,
      hasWorkingCopy: true,
      review: {
        submissionId: uuid(2),
        kind: "update",
        revision: 7,
        status: "changes_requested",
        sellerVisibleReason: "Add a clearer cover.",
      },
      actions: { canEdit: true, canSubmit: true },
    });
  });

  it("rejects approved reviews without an activation and impossible raw combinations", () => {
    expect(() =>
      mapProductModerationStatus(
        record({
          review_submission_id: uuid(2),
          review_kind: "initial_publication",
          review_revision: 3,
          review_status: "approved",
          review_submitted_at: "2026-08-16T10:00:00.000Z",
        }),
      ),
    ).toThrow(/no matching activation run/);

    expect(() =>
      mapProductModerationStatus(
        approved({ activation_phase: "activation", activation_status: "cleanup_required" }),
      ),
    ).toThrow(/inconsistent/);
  });
});

function approved(overrides: Partial<ProductModerationStatusRecord> = {}) {
  return record({
    review_submission_id: uuid(2),
    review_kind: "initial_publication",
    review_revision: 3,
    review_status: "approved",
    review_submitted_at: "2026-08-16T10:00:00.000Z",
    review_decided_at: "2026-08-16T10:01:00.000Z",
    activation_run_id: uuid(3),
    activation_phase: "activation",
    activation_status: "pending",
    activation_dispatch_status: "pending",
    activation_dispatch_generation: 1,
    ...overrides,
  });
}

function record(
  overrides: Partial<ProductModerationStatusRecord> = {},
): ProductModerationStatusRecord {
  return {
    id: uuid(1),
    status: "draft",
    moderation_revision: 3,
    has_working_copy: false,
    review_submission_id: null,
    review_kind: null,
    review_revision: null,
    review_status: null,
    review_submitted_at: null,
    review_decided_at: null,
    review_seller_visible_reason: null,
    activation_run_id: null,
    activation_phase: null,
    activation_status: null,
    activation_dispatch_status: null,
    activation_dispatch_generation: null,
    activation_dispatch_error_code: null,
    activation_error_code: null,
    can_edit: false,
    can_submit: false,
    can_withdraw: false,
    can_abandon_failed_activation: false,
    can_retry_abandonment_cleanup: false,
    can_archive: false,
    can_restore: false,
    ...overrides,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
