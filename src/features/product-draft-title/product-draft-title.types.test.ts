import { describe, expect, it } from "vitest";

import {
  normalizeProductDraftTitle,
  parseGetProductDraftTitleInput,
  parseUpdateProductDraftTitleInput,
} from "./product-draft-title.types";

const productDraftId = "00000000-0000-4000-8000-000000000001";

describe("ProductDraft title contract", () => {
  it("normalizes surrounding and internal whitespace", () => {
    expect(normalizeProductDraftTitle("  Black \n\t trousers  ")).toBe("Black trousers");
    expect(normalizeProductDraftTitle(" \n ")).toBe("");
  });

  it("accepts up to 50 Unicode characters and rejects longer titles", () => {
    expect(normalizeProductDraftTitle("x")).toBe("x");
    expect(normalizeProductDraftTitle("😀".repeat(50))).toBe("😀".repeat(50));
    expect(() => normalizeProductDraftTitle("😀".repeat(51))).toThrowError(
      expect.objectContaining({
        statusCode: 400,
        code: "product_draft_title_invalid",
      }),
    );
  });

  it("parses strict get and update requests", () => {
    expect(parseGetProductDraftTitleInput({ productDraftId })).toEqual({ productDraftId });
    expect(parseUpdateProductDraftTitleInput({ productDraftId, title: "" })).toEqual({
      productDraftId,
      title: "",
    });
  });

  it("rejects malformed identifiers and unknown request fields", () => {
    for (const input of [
      {},
      { productDraftId: "bad" },
      { productDraftId, title: "Title", extra: true },
    ]) {
      const parse =
        "title" in input
          ? () => parseUpdateProductDraftTitleInput(input)
          : () => parseGetProductDraftTitleInput(input);
      expect(parse).toThrowError(
        expect.objectContaining({
          statusCode: 400,
          code: "product_draft_title_invalid",
        }),
      );
    }
  });
});
