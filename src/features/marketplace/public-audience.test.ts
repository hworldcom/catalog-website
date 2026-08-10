import { describe, expect, it } from "vitest";

import { normalizePublicAudience, publicAudienceSchema } from "./public-audience";

describe("public audience", () => {
  it.each([
    ["women", "women"],
    [" MEN ", "men"],
    ["Kids", "kids"],
  ] as const)("normalizes %s to %s", (input, expected) => {
    expect(normalizePublicAudience(input)).toBe(expected);
    expect(publicAudienceSchema.parse(input)).toBe(expected);
  });

  it.each([undefined, null, "", "unisex", 42])(
    "defaults unsupported input %j to women",
    (input) => {
      expect(normalizePublicAudience(input)).toBe("women");
      expect(publicAudienceSchema.parse(input)).toBe("women");
    },
  );
});
