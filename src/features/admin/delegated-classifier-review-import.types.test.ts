import { describe, expect, it } from "vitest";

import {
  parseDelegatedApproveBatchInput,
  parseDelegatedApproveGroupInput,
} from "./delegated-classifier-review-import.types";

describe("delegated classifier continuation input", () => {
  it("validates and normalizes audited identifiers", () => {
    expect(
      parseDelegatedApproveGroupInput({
        workflowId: workflowId.toUpperCase(),
        groupId: groupId.toUpperCase(),
        requestId: requestId.toUpperCase(),
      }),
    ).toEqual({ workflowId, groupId, requestId });
  });

  it("rejects malformed or additional audited fields", () => {
    expect(() =>
      parseDelegatedApproveBatchInput({
        workflowId: "not-a-uuid",
        requestId,
      }),
    ).toThrow(expect.objectContaining({ code: "delegated_review_invalid" }));
    expect(() =>
      parseDelegatedApproveBatchInput({
        workflowId,
        requestId,
        sellerId: uuid(99),
      }),
    ).toThrow(expect.objectContaining({ code: "delegated_review_invalid" }));
  });
});

const workflowId = uuid(1);
const groupId = uuid(2);
const requestId = uuid(3);

function uuid(value: number): string {
  return `a0000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
