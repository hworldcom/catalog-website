import { describe, expect, it } from "vitest";

import {
  ProductDraftFactsError,
  parseGetProductDraftFactsInput,
  parseUpdateProductDraftFactsInput,
  productDraftFactsDocumentSchema,
} from "./product-draft-facts.types";

const productDraftId = "00000000-0000-0000-0000-000000000001";

function updateInput(patch: unknown) {
  return { productDraftId, patch };
}

function expectInvalid(input: unknown) {
  expect(() => parseUpdateProductDraftFactsInput(input)).toThrowError(
    expect.objectContaining({
      name: "ProductDraftFactsError",
      statusCode: 400,
      code: "product_draft_facts_invalid",
    }),
  );
}

describe("ProductDraft facts validation", () => {
  it("accepts and trims a normalized partial patch", () => {
    expect(
      parseUpdateProductDraftFactsInput(
        updateInput({
          colors: [" black ", "red"],
          materialComposition: " 60% cotton, 40% polyester ",
          uncertainFields: ["materialComposition"],
        }),
      ),
    ).toEqual({
      productDraftId,
      patch: {
        colors: ["black", "red"],
        materialComposition: "60% cotton, 40% polyester",
        uncertainFields: ["materialComposition"],
      },
    });
  });

  it("accepts the canonical empty facts document", () => {
    expect(
      productDraftFactsDocumentSchema.parse({
        schemaVersion: 2,
        colors: [],
        materialComposition: null,
        uncertainFields: [],
        fieldSources: {
          colors: null,
          materialComposition: null,
        },
      }),
    ).toMatchObject({ schemaVersion: 2, colors: [], materialComposition: null });
  });

  it.each([
    ["an empty patch", updateInput({})],
    ["an unknown patch field", updateInput({ brand: "Bazoria" })],
    ["client-provided field sources", updateInput({ fieldSources: { colors: "human" } })],
    ["a removed product type", updateInput({ productType: "t-shirt" })],
    ["a removed pattern", updateInput({ pattern: "striped" })],
    ["a removed fit", updateInput({ fit: "regular" })],
    ["a removed visible-features list", updateInput({ visibleFeatures: ["zip"] })],
    ["the legacy material key", updateInput({ material: "cotton" })],
    ["a blank scalar", updateInput({ materialComposition: "   " })],
    ["a blank list item", updateInput({ colors: ["black", " "] })],
    ["an oversized scalar", updateInput({ materialComposition: "x".repeat(121) })],
    ["an oversized list item", updateInput({ colors: ["x".repeat(121)] })],
    ["an oversized list", updateInput({ colors: Array.from({ length: 11 }, () => "black") })],
    [
      "duplicate uncertain fields",
      updateInput({ uncertainFields: ["materialComposition", "materialComposition"] }),
    ],
    ["an unknown uncertain field", updateInput({ uncertainFields: ["brand"] })],
    ["an unknown top-level input field", { productDraftId, patch: { colors: [] }, revision: 1 }],
  ])("rejects %s", (_label, input) => {
    expectInvalid(input);
  });

  it("returns a stable invalid error for a malformed read request", () => {
    const error = (() => {
      try {
        parseGetProductDraftFactsInput({ productDraftId: "not-a-uuid" });
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(ProductDraftFactsError);
    expect(error).toMatchObject({
      statusCode: 400,
      code: "product_draft_facts_invalid",
    });
  });
});
