import { describe, expect, it } from "vitest";

import {
  buildProductDraftFactsPatch,
  factsToFormValues,
  parseFactsListInput,
} from "./product-draft-facts.form";
import type { ProductDraftFactField, ProductDraftFacts } from "./product-draft-facts.types";

const facts: ProductDraftFacts = {
  schemaVersion: 2,
  colors: ["black", "red"],
  materialComposition: "60% cotton, 40% polyester",
  uncertainFields: ["materialComposition"],
  fieldSources: {
    colors: "human",
    materialComposition: "model",
  },
};

describe("ProductDraft facts form helpers", () => {
  it("converts facts into scalar and newline-separated controls", () => {
    expect(factsToFormValues(facts)).toEqual({
      colors: "black\nred",
      materialComposition: "60% cotton, 40% polyester",
    });
  });

  it("trims list lines, ignores blanks, and preserves order", () => {
    expect(parseFactsListInput(" red \n\n black\r\n  white  ")).toEqual(["red", "black", "white"]);
  });

  it("builds a normalized patch from changed touched fields only", () => {
    const form = factsToFormValues(facts);
    form.colors = " black \n\n blue ";
    form.materialComposition = "  cotton ";

    expect(
      buildProductDraftFactsPatch(
        form,
        facts,
        new Set<ProductDraftFactField>(["colors", "materialComposition"]),
      ),
    ).toEqual({
      colors: ["black", "blue"],
      materialComposition: "cotton",
    });
  });

  it("uses null and empty arrays for explicit clears", () => {
    const form = factsToFormValues(facts);
    form.materialComposition = "  ";
    form.colors = "\n";

    expect(
      buildProductDraftFactsPatch(
        form,
        facts,
        new Set<ProductDraftFactField>(["colors", "materialComposition"]),
      ),
    ).toEqual({
      colors: [],
      materialComposition: null,
    });
  });

  it("returns no patch when a touched control is reverted semantically", () => {
    const form = factsToFormValues(facts);
    form.colors = " black \n red \n";

    expect(
      buildProductDraftFactsPatch(form, facts, new Set<ProductDraftFactField>(["colors"])),
    ).toBeNull();
  });
});
