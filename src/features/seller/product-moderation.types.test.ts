import { describe, expect, it } from "vitest";

import { productModerationError, productModerationErrorCode } from "./product-moderation.types";

describe("ProductModeration error decoding", () => {
  it("recognizes structured, message-only, and nested transported errors", () => {
    const structured = productModerationError("product_moderation_description_outdated");

    expect(productModerationErrorCode(structured)).toBe("product_moderation_description_outdated");
    expect(productModerationErrorCode(new Error(structured.message))).toBe(
      "product_moderation_description_outdated",
    );
    expect(
      productModerationErrorCode(new Error("wrapper", { cause: new Error(structured.message) })),
    ).toBe("product_moderation_description_outdated");
  });

  it("rejects unrelated errors", () => {
    expect(productModerationErrorCode(new Error("unknown"))).toBeNull();
    expect(productModerationErrorCode(null)).toBeNull();
  });
});
