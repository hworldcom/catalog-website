import { describe, expect, it } from "vitest";

import {
  marketplaceHomeSearch,
  normalizePublicAudience,
  publicAudienceSchema,
} from "./public-audience";

describe("public audience", () => {
  it.each([
    ["all", "all"],
    ["women", "women"],
    [" MEN ", "men"],
    ["Kids", "kids"],
  ] as const)("normalizes %s to %s", (input, expected) => {
    expect(normalizePublicAudience(input)).toBe(expected);
    expect(publicAudienceSchema.parse(input)).toBe(expected);
  });

  it.each([undefined, null, "", "unisex", 42])("defaults unsupported input %j to all", (input) => {
    expect(normalizePublicAudience(input)).toBe("all");
    expect(publicAudienceSchema.parse(input)).toBe("all");
  });

  it("resets explicit marketplace-home navigation to all while preserving root search", () => {
    expect(marketplaceHomeSearch({ lang: "DE", audience: "kids" })).toEqual({
      lang: "DE",
      audience: "all",
    });
  });
});
