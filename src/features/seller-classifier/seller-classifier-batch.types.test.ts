import { describe, expect, it } from "vitest";

import {
  parseCreateSellerClassifierBatchInput,
  parseSellerClassifierWorkflowInput,
  SellerClassifierBatchError,
} from "./seller-classifier-batch.types";

describe("seller classifier batch request parsing", () => {
  it("accepts strict universally unique identifiers", () => {
    expect(parseCreateSellerClassifierBatchInput({ requestId: uuid(1) })).toEqual({
      requestId: uuid(1),
    });
    expect(parseSellerClassifierWorkflowInput({ workflowId: uuid(2) })).toEqual({
      workflowId: uuid(2),
    });
  });

  it.each([{}, { requestId: "invalid" }, { requestId: uuid(1), sellerId: uuid(2) }])(
    "rejects malformed or seller-controlled create input",
    (input) => {
      expect(() => parseCreateSellerClassifierBatchInput(input)).toThrow(
        SellerClassifierBatchError,
      );
    },
  );
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
