import { describe, expect, it } from "vitest";

import {
  readPublicProductDescription,
  toDatabaseDescriptionLanguage,
} from "./public-product-description";

describe("public product description mapping", () => {
  it.each([
    ["EN", "en"],
    ["PL", "pl"],
    ["DE", "de"],
    ["VI", "vi"],
  ] as const)("maps %s to the database language %s", (language, databaseLanguage) => {
    expect(toDatabaseDescriptionLanguage(language)).toBe(databaseLanguage);
  });

  it.each([
    ["en", "EN"],
    ["pl", "PL"],
    ["de", "DE"],
    ["vi", "VI"],
  ] as const)("maps the database language %s to %s", (databaseLanguage, resolvedLanguage) => {
    expect(
      readPublicProductDescription({
        description_text: "Description",
        resolved_language: databaseLanguage,
      }),
    ).toEqual({ text: "Description", resolvedLanguage });
  });

  it("keeps an absent description nullable", () => {
    expect(readPublicProductDescription(null)).toBeNull();
  });

  it("rejects an unsupported language returned by the database", () => {
    expect(() =>
      readPublicProductDescription({
        description_text: "Description",
        resolved_language: "fr",
      }),
    ).toThrow("unsupported language");
  });
});
