import { describe, expect, it } from "vitest";

import { parseAdminProductDraftReviewRequest } from "./admin-product-draft-review.types";

describe("administrator ProductDraft review request", () => {
  it("accepts one strict ProductDraft identifier", () => {
    expect(parseAdminProductDraftReviewRequest({ productDraftId: uuid(1) })).toEqual({
      productDraftId: uuid(1),
    });
  });

  it("rejects malformed identifiers and unknown fields", () => {
    for (const input of [
      undefined,
      {},
      { productDraftId: "not-a-uuid" },
      { productDraftId: uuid(1), extra: true },
    ]) {
      expect(() => parseAdminProductDraftReviewRequest(input)).toThrowError(
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
