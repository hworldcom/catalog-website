import { describe, expect, it } from "vitest";

import { SellerClassifierBatchError } from "./seller-classifier-batch.types";
import { parseSellerClassifierComparisonInput } from "./seller-classifier-comparison.types";

describe("parseSellerClassifierComparisonInput", () => {
  it("accepts only an opaque workflow identifier", () => {
    expect(parseSellerClassifierComparisonInput({ workflowId })).toEqual({ workflowId });
  });

  it.each([{}, { workflowId: "not-a-uuid" }, { workflowId, classifierBatchId: uuid(2) }])(
    "maps malformed input to the non-disclosing not-found result",
    (input) => {
      try {
        parseSellerClassifierComparisonInput(input);
        throw new Error("Expected parsing to fail.");
      } catch (error) {
        expect(error).toBeInstanceOf(SellerClassifierBatchError);
        expect(error).toMatchObject({
          statusCode: 404,
          code: "seller_classifier_batch_not_found",
        });
      }
    },
  );
});

const workflowId = uuid(1);

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
