import { describe, expect, it } from "vitest";

import { normalizeLanguage } from "./i18n";

describe("normalizeLanguage", () => {
  it.each([
    ["en", "EN"],
    ["PL", "PL"],
    ["De", "DE"],
    ["vi", "VI"],
  ] as const)("normalizes %s to %s", (input, expected) => {
    expect(normalizeLanguage(input)).toBe(expected);
  });

  it.each([undefined, null, "", "FR", 42])("falls back to English for %s", (input) => {
    expect(normalizeLanguage(input)).toBe("EN");
  });
});
