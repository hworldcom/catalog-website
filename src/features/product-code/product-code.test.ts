import { describe, expect, it } from "vitest";

import { productCodeCopy } from "./product-code.copy";
import {
  PRODUCT_CODE_PATTERN,
  StoredProductCodeError,
  parseStoredProductCode,
} from "./product-code";

describe("stored product codes", () => {
  it.each(["KES-F-TSH-23456789", "SELLER10-FASH-TRSR-ABCDEFGH", "A01-F-JKT-ZYXWVUTS"])(
    "accepts the canonical code %s",
    (code) => {
      expect(PRODUCT_CODE_PATTERN.test(code)).toBe(true);
      expect(parseStoredProductCode(code)).toBe(code);
    },
  );

  it.each([
    null,
    undefined,
    "",
    " KES-F-TSH-23456789",
    "kes-F-TSH-23456789",
    "KE-F-TSH-23456789",
    "KES-F-TSH-12345678",
    "KES-F-TSH-ABCDEFGI",
  ])("rejects the noncanonical stored value %s", (value) => {
    expect(() => parseStoredProductCode(value)).toThrow(StoredProductCodeError);
  });

  it("defines the required label in every supported language", () => {
    expect(productCodeCopy.label).toEqual({
      EN: "Product code",
      PL: "Kod produktu",
      DE: "Produktcode",
      VI: "Mã sản phẩm",
    });
  });
});
