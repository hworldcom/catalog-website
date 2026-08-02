import { describe, expect, it } from "vitest";

import {
  deriveCompanyCodePreview,
  normalizeSubmittedCompanyCode,
  readSellerCompanyCodeError,
} from "./company-code";

describe("seller company codes", () => {
  it.each([
    ["Kesar Textiles", "KES"],
    ["Jaipur Handicrafts Co.", "JDO"],
    ["Aroma Naturals", "AAS"],
    ["  Késar—Textiles! ", "KES"],
    ["ABCD", "ABD"],
    ["A B", ""],
  ])("derives %s as %s", (name, expected) => {
    expect(deriveCompanyCodePreview(name)).toBe(expected);
  });

  it("returns no automatic preview for fewer than three normalized characters", () => {
    expect(deriveCompanyCodePreview("A!")).toBe("");
    expect(deriveCompanyCodePreview("---")).toBe("");
  });

  it("normalizes a submitted deliberate code without deriving a replacement", () => {
    expect(normalizeSubmittedCompanyCode("  jhc  ")).toBe("JHC");
  });

  it("extracts only known stable database errors", () => {
    expect(readSellerCompanyCodeError(new Error("duplicate: seller_company_code_taken"))).toBe(
      "seller_company_code_taken",
    );
    expect(readSellerCompanyCodeError(new Error("network unavailable"))).toBeNull();
  });
});
