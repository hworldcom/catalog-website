import { describe, expect, it } from "vitest";

import { formatPriceValue, MAX_PRODUCT_PRICE } from "./product-price";

describe("formatPriceValue", () => {
  it.each([
    [12, "USD", "USD 12.00"],
    ["7.5", "EUR", "EUR 7.50"],
    [0, "PLN", "PLN 0.00"],
    ["0", "VND", "VND 0.00"],
    [MAX_PRODUCT_PRICE, "ABCDEF", "ABCDEF 9999999999.99"],
  ] as const)("formats %s %s using fixed public semantics", (price, currency, expected) => {
    expect(formatPriceValue(price, currency)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    MAX_PRODUCT_PRICE + 0.01,
    "",
    " ",
    " 1",
    "1 ",
    ".5",
    "1.",
    "+1",
    "-1",
    "1e2",
    "0x10",
    "not-a-price",
  ])("rejects invalid price input: %s", (price) => {
    expect(formatPriceValue(price, "USD")).toBeNull();
  });

  it.each([null, undefined, "", "US", "DOLLARS", "usd", " USD", "USD ", "US$"])(
    "rejects invalid currency input: %s",
    (currency) => {
      expect(formatPriceValue(12, currency)).toBeNull();
    },
  );
});
