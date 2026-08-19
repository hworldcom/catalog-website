import { describe, expect, it } from "vitest";

import {
  administratorModerationDefaultRequest,
  administratorModerationSearchForRequest,
  buildAdministratorModerationDetailHref,
  parseAdministratorModerationRouteSearch,
} from "./administrator-moderation.navigation";

describe("administrator moderation navigation", () => {
  it("normalizes the initial route to pending requests with the default limit", () => {
    expect(parseAdministratorModerationRouteSearch({ lang: "de" })).toEqual({
      valid: true,
      lang: "DE",
      request: administratorModerationDefaultRequest(),
    });
  });

  it("parses a complete valid filter state without changing the opaque cursor", () => {
    expect(
      parseAdministratorModerationRouteSearch({
        submissionType: "product_update",
        reviewStatus: "approved",
        activationStatus: "failed",
        sellerId: uuid(1),
        limit: "50",
        cursor: "opaque-cursor",
        lang: "PL",
      }),
    ).toEqual({
      valid: true,
      lang: "PL",
      request: {
        submissionType: "product_update",
        reviewStatus: "approved",
        activationStatus: "failed",
        sellerId: uuid(1),
        limit: 50,
        cursor: "opaque-cursor",
      },
    });
  });

  it.each([
    { submissionType: "seller_update", activationStatus: "failed" },
    { reviewStatus: "pending", activationStatus: "running" },
    { reviewStatus: "not-real" },
    { sellerId: "not-a-uuid" },
    { limit: "0" },
    { limit: "25.5" },
    { cursor: "" },
  ])("returns the stable invalid state for malformed search %j", (search) => {
    expect(parseAdministratorModerationRouteSearch({ ...search, lang: "EN" })).toEqual({
      valid: false,
      lang: "EN",
    });
  });

  it("serializes optional queue filters as absent values", () => {
    expect(
      administratorModerationSearchForRequest(administratorModerationDefaultRequest()),
    ).toEqual({
      submissionType: undefined,
      reviewStatus: "pending",
      activationStatus: undefined,
      sellerId: undefined,
      limit: 25,
      cursor: undefined,
    });
  });

  it("builds a detail URL with the complete validated return state", () => {
    const href = buildAdministratorModerationDetailHref(
      "product_update",
      uuid(2),
      {
        submissionType: "product_update",
        reviewStatus: "approved",
        activationStatus: "cleanup_required",
        sellerId: uuid(1),
        limit: 50,
        cursor: "opaque+/cursor",
      },
      "DE",
    );
    const url = new URL(href, "https://bazoria.test");

    expect(url.pathname).toBe(`/admin/moderation/product_update/${uuid(2)}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      returnReviewStatus: "approved",
      returnLimit: "50",
      lang: "DE",
      returnSubmissionType: "product_update",
      returnActivationStatus: "cleanup_required",
      returnSellerId: uuid(1),
      returnCursor: "opaque+/cursor",
    });
  });

  it("omits absent optional return filters", () => {
    const url = new URL(
      buildAdministratorModerationDetailHref(
        "new_seller",
        uuid(2),
        administratorModerationDefaultRequest(),
        "EN",
      ),
      "https://bazoria.test",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      returnReviewStatus: "pending",
      returnLimit: "25",
      lang: "EN",
    });
  });
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
