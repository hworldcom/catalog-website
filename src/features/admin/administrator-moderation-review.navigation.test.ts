import { describe, expect, it } from "vitest";

import { parseAdministratorModerationReviewRoute } from "./administrator-moderation-review.navigation";

describe("administrator moderation review navigation", () => {
  it("parses a product route and preserves a complete valid queue return state", () => {
    const state = parseAdministratorModerationReviewRoute(
      { submissionType: "product_update", submissionId: uuid(1) },
      {
        returnSubmissionType: "product_update",
        returnReviewStatus: "approved",
        returnActivationStatus: "failed",
        returnSellerId: uuid(2),
        returnLimit: "50",
        returnCursor: "opaque+/cursor",
        lang: "de",
      },
    );

    expect(state).toMatchObject({
      valid: true,
      family: "product",
      lang: "DE",
      returnStateValid: true,
      returnRequest: {
        submissionType: "product_update",
        reviewStatus: "approved",
        activationStatus: "failed",
        sellerId: uuid(2),
        limit: 50,
        cursor: "opaque+/cursor",
      },
    });
    if (!state.valid) throw new Error("Expected valid state.");
    const back = new URL(state.backHref, "https://bazoria.test");
    expect(Object.fromEntries(back.searchParams)).toEqual({
      reviewStatus: "approved",
      limit: "50",
      lang: "DE",
      submissionType: "product_update",
      activationStatus: "failed",
      sellerId: uuid(2),
      cursor: "opaque+/cursor",
    });
  });

  it("falls back to pending when any return parameter is malformed or incompatible", () => {
    const state = parseAdministratorModerationReviewRoute(
      { submissionType: "seller_update", submissionId: uuid(1) },
      {
        returnSubmissionType: "seller_update",
        returnReviewStatus: "pending",
        returnActivationStatus: "failed",
        returnLimit: "25",
        lang: "PL",
      },
    );

    expect(state).toMatchObject({ valid: true, returnStateValid: false });
    if (!state.valid) throw new Error("Expected valid route.");
    expect(state.backHref).toBe("/admin/moderation?reviewStatus=pending&limit=25&lang=PL");
  });

  it.each([
    { submissionType: "unknown", submissionId: uuid(1) },
    { submissionType: "new_seller", submissionId: "not-a-uuid" },
  ])("rejects malformed route identifiers without trusting them", (params) => {
    expect(parseAdministratorModerationReviewRoute(params, { lang: "VI" })).toEqual({
      valid: false,
      lang: "VI",
      backHref: "/admin/moderation?reviewStatus=pending&limit=25&lang=VI",
    });
  });

  it("uses pending defaults when return state is absent", () => {
    expect(
      parseAdministratorModerationReviewRoute(
        { submissionType: "new_seller", submissionId: uuid(1) },
        { lang: "EN" },
      ),
    ).toMatchObject({
      valid: true,
      family: "seller",
      returnStateValid: true,
      backHref: "/admin/moderation?reviewStatus=pending&limit=25&lang=EN",
    });
  });
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
