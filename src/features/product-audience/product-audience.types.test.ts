import { describe, expect, it } from "vitest";

import {
  hasProductAudienceValidationIssue,
  parseStoredProductAudiences,
  productAudienceInvalid,
  productAudienceSetSchema,
} from "./product-audience.types";

describe("product audience contract", () => {
  it("deduplicates and stores audiences in canonical order", () => {
    expect(productAudienceSetSchema.parse(["kids", "women", "kids", "men"])).toEqual([
      "women",
      "men",
      "kids",
    ]);
  });

  it("accepts an empty draft set and rejects unsupported stored values", () => {
    expect(productAudienceSetSchema.parse([])).toEqual([]);
    expect(() => parseStoredProductAudiences(["unisex"])).toThrow();
  });

  it("recognizes audience validation issues and exposes the stable error", () => {
    const parsed = productAudienceSetSchema.safeParse(["unisex"]);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    parsed.error.issues[0]!.path.unshift("audiences");
    expect(hasProductAudienceValidationIssue(parsed.error)).toBe(true);
    expect(productAudienceInvalid()).toMatchObject({
      statusCode: 400,
      code: "product_audience_invalid",
    });
  });
});
