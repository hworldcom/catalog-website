import { describe, expect, it } from "vitest";

import {
  parseSellerClassifierHistoryRequest,
  SELLER_CLASSIFIER_HISTORY_DEFAULT_LIMIT,
} from "./seller-classifier-history.types";

describe("seller classifier history request", () => {
  it("applies the default page size", () => {
    expect(parseSellerClassifierHistoryRequest({})).toEqual({
      cursor: null,
      limit: SELLER_CLASSIFIER_HISTORY_DEFAULT_LIMIT,
    });
  });

  it.each([{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { cursor: "" }, { sellerId: uuid(1) }])(
    "rejects unsupported request input %#",
    (input) => {
      expect(() => parseSellerClassifierHistoryRequest(input)).toThrowError(
        expect.objectContaining({
          statusCode: 400,
          code: "seller_classifier_history_invalid",
        }),
      );
    },
  );
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
