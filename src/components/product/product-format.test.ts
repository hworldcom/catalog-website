import { describe, expect, it } from "vitest";

import { formatPrice, getStockLabel } from "./product-format";

describe("formatPrice", () => {
  it("formats numeric prices with two decimals", () => {
    expect(formatPrice(12, "USD")).toBe("USD 12.00");
    expect(formatPrice("7.5", "EUR")).toBe("EUR 7.50");
  });

  it("falls back to quote copy for missing or invalid prices", () => {
    expect(formatPrice(null, "USD")).toBe("Ask for quote");
    expect(formatPrice("not-a-price", "USD")).toBe("Ask for quote");
  });
});

describe("getStockLabel", () => {
  it("maps product stock values to user-facing labels", () => {
    expect(getStockLabel("in_stock")).toBe("In stock");
    expect(getStockLabel("low_stock")).toBe("Low stock");
    expect(getStockLabel("out_of_stock")).toBe("Out of stock");
    expect(getStockLabel("made_to_order")).toBe("Made to order");
  });
});
