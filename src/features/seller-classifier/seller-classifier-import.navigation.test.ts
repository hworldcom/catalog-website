import { describe, expect, it } from "vitest";

import {
  parseSellerClassifierImportSearch,
  parseSellerClassifierReviewSearch,
  SELLER_CLASSIFIER_GROUPS_NOT_APPROVED_NOTICE,
} from "./seller-classifier-import.navigation";

describe("seller classifier import navigation", () => {
  it("accepts the supported stale-review notice and language", () => {
    expect(
      parseSellerClassifierReviewSearch({
        lang: "DE",
        notice: SELLER_CLASSIFIER_GROUPS_NOT_APPROVED_NOTICE,
      }),
    ).toEqual({
      lang: "DE",
      notice: "groups-not-approved",
    });
    expect(parseSellerClassifierImportSearch({ lang: "VI" })).toEqual({ lang: "VI" });
  });

  it("rejects unsupported search state", () => {
    expect(() =>
      parseSellerClassifierReviewSearch({ lang: "EN", notice: "internal-error" }),
    ).toThrow();
    expect(() => parseSellerClassifierImportSearch({ lang: "FR" })).toThrow();
    expect(() => parseSellerClassifierImportSearch({ lang: "EN", importId: "hidden" })).toThrow();
  });
});
