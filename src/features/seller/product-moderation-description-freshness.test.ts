import { describe, expect, it } from "vitest";

import type { ProductModerationSnapshot } from "./product-moderation-snapshot.types";
import { productModerationDescriptionWarnings } from "./product-moderation-description-freshness";

describe("productModerationDescriptionWarnings", () => {
  it("returns every description based on a different facts revision", () => {
    const current = snapshot();
    current.facts = { factsRevision: 2, facts: {} };
    current.descriptions = [description("en", 1), description("de", 2), description("pl", null)];

    expect(productModerationDescriptionWarnings(current)).toEqual([
      { language: "en", descriptionFactsRevision: 1, currentFactsRevision: 2 },
      { language: "pl", descriptionFactsRevision: null, currentFactsRevision: 2 },
    ]);
  });

  it("does not warn when both the facts and legacy description revision are absent", () => {
    const current = snapshot();
    current.descriptions = [description("en", null)];

    expect(productModerationDescriptionWarnings(current)).toEqual([]);
  });
});

function description(
  language: "pl" | "en" | "de" | "vi",
  factsRevision: number | null,
): ProductModerationSnapshot["descriptions"][number] {
  return {
    language,
    descriptionText: `${language} description`,
    source: "human",
    factsRevision,
    provider: null,
    model: null,
    pipelineVersion: null,
    generatedAt: null,
  };
}

function snapshot(): ProductModerationSnapshot {
  return {
    schemaVersion: 1,
    productId: uuid(1),
    sellerId: uuid(2),
    productCode: "Q-F-SHT-ABC12345",
    productCodeInput: null,
    title: "Product",
    titleSource: "human",
    categoryId: uuid(3),
    audiences: ["women"],
    descriptions: [],
    facts: null,
    minimumOrder: null,
    packSize: null,
    price: null,
    currency: "EUR",
    stock: "in_stock",
    imageIds: [uuid(4)],
    coverImageId: uuid(4),
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
