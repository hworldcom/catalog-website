import { describe, expect, it } from "vitest";

import {
  normalizeProductDescriptionGenerationOutput,
  parseGenerateMyProductDraftDescriptionsInput,
  ProductDescriptionGenerationError,
  ProductDescriptionGenerationOutputError,
} from "./product-draft-description-generation.types";

describe("product description generation types", () => {
  it("accepts only a strict ProductDraft identifier request", () => {
    expect(
      parseGenerateMyProductDraftDescriptionsInput({
        productDraftId: "00000000-0000-4000-8000-000000000001",
        expectedModerationRevision: 4,
      }),
    ).toEqual({
      productDraftId: "00000000-0000-4000-8000-000000000001",
      expectedModerationRevision: 4,
    });

    expect(() =>
      parseGenerateMyProductDraftDescriptionsInput({
        productDraftId: "bad",
        sellerId: "00000000-0000-4000-8000-000000000002",
      }),
    ).toThrow(ProductDescriptionGenerationError);
  });

  it("normalizes all descriptions and a valid title proposal", () => {
    expect(
      normalizeProductDescriptionGenerationOutput(
        {
          imageAssessment: {
            usable: true,
            observedDetails: ["Blue short-sleeve top"],
          },
          descriptions: {
            pl: "  Polski opis.  ",
            en: " English description. ",
            de: " Deutsche Beschreibung. ",
            vi: " Mo ta tieng Viet. ",
          },
          titleProposal: "  Cotton   T-shirt ",
        },
        true,
      ),
    ).toEqual({
      descriptions: {
        pl: "Polski opis.",
        en: "English description.",
        de: "Deutsche Beschreibung.",
        vi: "Mo ta tieng Viet.",
      },
      titleProposal: "Cotton T-shirt",
    });
  });

  it("rejects multiline output and a proposal when the title was not blank", () => {
    expect(() =>
      normalizeProductDescriptionGenerationOutput(
        {
          descriptions: {
            pl: "Polski opis.",
            en: "First paragraph.\nSecond paragraph.",
            de: "Deutsche Beschreibung.",
            vi: "Mo ta tieng Viet.",
          },
          titleProposal: null,
        },
        false,
      ),
    ).toThrow(ProductDescriptionGenerationOutputError);

    expect(() =>
      normalizeProductDescriptionGenerationOutput(validOutput("Unexpected title"), false),
    ).toThrow(ProductDescriptionGenerationOutputError);
  });

  it("rejects inconsistent usable and unusable image assessments", () => {
    expect(() =>
      normalizeProductDescriptionGenerationOutput(
        {
          imageAssessment: { usable: false, observedDetails: [] },
          descriptions: validOutput(null).descriptions,
          titleProposal: null,
        },
        true,
      ),
    ).toThrow(ProductDescriptionGenerationOutputError);

    expect(() =>
      normalizeProductDescriptionGenerationOutput(
        {
          ...validOutput(null),
          imageAssessment: { usable: true, observedDetails: [] },
        },
        true,
      ),
    ).toThrow(ProductDescriptionGenerationOutputError);
  });

  it("enforces 300-character descriptions and treats unusable optional titles as absent", () => {
    expect(() =>
      normalizeProductDescriptionGenerationOutput(
        {
          ...validOutput("x".repeat(50)),
          descriptions: {
            ...validOutput(null).descriptions,
            en: "😀".repeat(301),
          },
        },
        true,
      ),
    ).toThrow(ProductDescriptionGenerationOutputError);

    for (const proposal of [null, "   ", "😀".repeat(51)]) {
      expect(
        normalizeProductDescriptionGenerationOutput(validOutput(proposal), true).titleProposal,
      ).toBeNull();
    }
  });
});

function validOutput(titleProposal: string | null) {
  return {
    imageAssessment: {
      usable: true,
      observedDetails: ["Blue short-sleeve top"],
    },
    descriptions: {
      pl: "Polski opis.",
      en: "English description.",
      de: "Deutsche Beschreibung.",
      vi: "Mo ta tieng Viet.",
    },
    titleProposal,
  };
}
