import { describe, expect, it } from "vitest";

import {
  normalizeProductDraftDescription,
  normalizeProductDraftDescriptionPatch,
  parseUpdateProductDraftDescriptionsInput,
} from "./product-draft-descriptions.types";

describe("ProductDraft description request types", () => {
  it("normalizes line endings and surrounding whitespace while preserving internal lines", () => {
    expect(normalizeProductDraftDescription(" \r\n First line\r\nSecond line \t")).toBe(
      "First line\nSecond line",
    );
    expect(normalizeProductDraftDescription(" \t ")).toBeNull();
  });

  it("preserves only submitted language keys", () => {
    const patch = normalizeProductDraftDescriptionPatch({
      en: " English description ",
      vi: " ",
    });

    expect(patch).toEqual({ en: "English description", vi: null });
    expect(patch).not.toHaveProperty("pl");
  });

  it("rejects empty or unsupported-language patches", () => {
    expectInvalidPatch({
      productDraftId: "00000000-0000-4000-8000-000000000001",
      descriptions: {},
    });

    expectInvalidPatch({
      productDraftId: "00000000-0000-4000-8000-000000000001",
      descriptions: { fr: "French" },
    });
  });
});

function expectInvalidPatch(input: unknown): void {
  try {
    parseUpdateProductDraftDescriptionsInput(input);
  } catch (error) {
    expect(error).toMatchObject({
      statusCode: 400,
      code: "product_draft_description_invalid",
    });
    return;
  }

  throw new Error("Expected ProductDraft description input to be rejected.");
}
