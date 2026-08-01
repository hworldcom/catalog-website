import { describe, expect, it } from "vitest";

import {
  parseDelegatedClassifierImportSearch,
  parseDelegatedClassifierReviewSearch,
} from "./delegated-classifier-review-import.navigation";

describe("delegated classifier continuation navigation", () => {
  it("accepts supported language and stale-review notice values", () => {
    expect(
      parseDelegatedClassifierReviewSearch({
        lang: "DE",
        notice: "groups-not-approved",
      }),
    ).toEqual({
      lang: "DE",
      notice: "groups-not-approved",
    });
    expect(parseDelegatedClassifierImportSearch({ lang: "VI" })).toEqual({ lang: "VI" });
  });

  it("rejects unknown search parameters and languages", () => {
    expect(() => parseDelegatedClassifierReviewSearch({ lang: "FR" })).toThrow();
    expect(() => parseDelegatedClassifierImportSearch({ sellerId: "hidden" })).toThrow();
  });
});
