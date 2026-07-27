import { describe, expect, it } from "vitest";

import {
  SELLER_PRODUCT_DESCRIPTION_MAX_LENGTH,
  hasValidSellerProductDescriptionLength,
} from "./product-description-validation";

describe("seller ProductDraft description validation", () => {
  it("counts Unicode characters consistently with PostgreSQL", () => {
    expect(
      hasValidSellerProductDescriptionLength("😀".repeat(SELLER_PRODUCT_DESCRIPTION_MAX_LENGTH)),
    ).toBe(true);
    expect(
      hasValidSellerProductDescriptionLength(
        "😀".repeat(SELLER_PRODUCT_DESCRIPTION_MAX_LENGTH + 1),
      ),
    ).toBe(false);
  });

  it("accepts omitted and cleared descriptions", () => {
    expect(hasValidSellerProductDescriptionLength(undefined)).toBe(true);
    expect(hasValidSellerProductDescriptionLength(null)).toBe(true);
    expect(hasValidSellerProductDescriptionLength("")).toBe(true);
  });
});
