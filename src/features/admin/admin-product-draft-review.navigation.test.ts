import { describe, expect, it } from "vitest";

import {
  buildAdminProductDraftBackHref,
  parseAdminProductDraftReviewSearch,
} from "./admin-product-draft-review.navigation";
import { encodeAdminProductDraftIndexCursor } from "./admin-product-draft-index.cursor";

describe("administrator ProductDraft review navigation", () => {
  it("accepts a direct review and returns to the default index while retaining language", () => {
    const search = parseAdminProductDraftReviewSearch({ lang: "DE" });

    expect(search).toEqual({ lang: "DE" });
    expect(buildAdminProductDraftBackHref(search)).toBe("/admin/product-drafts?limit=25&lang=DE");
  });

  it("reconstructs the exact validated index state", () => {
    const cursor = encodeAdminProductDraftIndexCursor({
      createdAt: "2026-07-24T12:00:00.000Z",
      productDraftId: uuid(9),
      limit: 50,
      status: "draft",
      sellerId: uuid(10),
    });
    const search = parseAdminProductDraftReviewSearch({
      lang: "PL",
      returnLimit: "50",
      returnStatus: "draft",
      returnSellerId: uuid(10),
      returnCursor: cursor,
    });

    expect(buildAdminProductDraftBackHref(search)).toBe(
      `/admin/product-drafts?limit=50&status=draft&sellerId=${uuid(10)}&cursor=${cursor}&lang=PL`,
    );
  });

  it("rejects unsupported values, incomplete context, and cursor/filter mismatches", () => {
    const cursor = encodeAdminProductDraftIndexCursor({
      createdAt: "2026-07-24T12:00:00.000Z",
      productDraftId: uuid(9),
      limit: 25,
      status: null,
      sellerId: null,
    });
    const invalid = [
      { returnLimit: 0 },
      { returnStatus: "draft" },
      { returnSellerId: uuid(1) },
      { returnCursor: cursor },
      { returnLimit: 50, returnCursor: cursor },
      { returnLimit: 25, unsupported: true },
    ];

    for (const input of invalid) {
      expect(() => parseAdminProductDraftReviewSearch(input)).toThrowError(
        expect.objectContaining({
          statusCode: 400,
          code: "admin_product_drafts_invalid",
        }),
      );
    }
  });
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
