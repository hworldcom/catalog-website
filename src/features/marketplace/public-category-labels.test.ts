import { describe, expect, it } from "vitest";

import { getPublicCategoryLabel } from "./public-category-labels";

describe("public category labels", () => {
  it("presents the internal Fashion root as Clothing", () => {
    expect(getPublicCategoryLabel("fashion", "Fashion & Apparel", "EN")).toBe("Clothing");
    expect(getPublicCategoryLabel("fashion", "Fashion & Apparel", "DE")).toBe("Bekleidung");
  });

  it("uses one localized mapping for supported garment leaves", () => {
    expect(getPublicCategoryLabel("trousers", "Trousers", "PL")).toBe("Spodnie");
    expect(getPublicCategoryLabel("tracksuit-sets", "Tracksuit sets", "VI")).toBe("Bộ đồ thể thao");
  });

  it("falls back to the canonical database name for an unmapped slug", () => {
    expect(getPublicCategoryLabel("future-category", "Future category", "DE")).toBe(
      "Future category",
    );
  });
});
