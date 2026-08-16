import { describe, expect, it } from "vitest";

import {
  parseDelegatedProductDescriptionsUpdate,
  parseDelegatedProductPublish,
} from "./delegated-product-publication.types";

describe("delegated ProductDraft publication types", () => {
  it("requires a complete strict publication body and preserves explicit nulls", () => {
    expect(
      parseDelegatedProductPublish({
        workflowId: uuid(1).toUpperCase(),
        productDraftId: uuid(2),
        expectedModerationRevision: 3,
        requestId: uuid(3),
        audiences: ["women", "men"],
        title: " Cotton shirt ",
        categoryId: null,
        minimumOrderQuantity: null,
        packSize: null,
        price: null,
        currency: " EUR ",
        stock: "in_stock",
        trending: false,
      }),
    ).toEqual({
      workflowId: uuid(1),
      productDraftId: uuid(2),
      expectedModerationRevision: 3,
      requestId: uuid(3),
      audiences: ["women", "men"],
      title: " Cotton shirt ",
      categoryId: null,
      minimumOrderQuantity: null,
      packSize: null,
      price: null,
      currency: "EUR",
      stock: "in_stock",
      trending: false,
    });

    expect(() =>
      parseDelegatedProductPublish({
        workflowId: uuid(1),
        productDraftId: uuid(2),
        expectedModerationRevision: 3,
        requestId: uuid(3),
        audiences: ["women"],
        title: "Cotton shirt",
        categoryId: null,
        currency: "EUR",
        stock: "in_stock",
        trending: false,
      }),
    ).toThrowError(expect.objectContaining({ code: "delegated_product_draft_invalid" }));
  });

  it("normalizes only explicitly patched description languages", () => {
    expect(
      parseDelegatedProductDescriptionsUpdate({
        workflowId: uuid(1),
        productDraftId: uuid(2),
        expectedModerationRevision: 3,
        descriptions: { en: "  A factual description. \r\n" },
      }),
    ).toEqual({
      workflowId: uuid(1),
      productDraftId: uuid(2),
      expectedModerationRevision: 3,
      descriptions: { en: "A factual description." },
    });
  });
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
