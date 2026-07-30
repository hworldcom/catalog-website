import { describe, expect, it } from "vitest";

import {
  parseCreateDelegatedClassifierBatchInput,
  parseDelegatedRegisterUploadsInput,
  parseDelegatedUploadSellerSearchRequest,
} from "./delegated-classifier-upload.types";

describe("delegated classifier upload input", () => {
  it("normalizes seller search and applies its default bound", () => {
    expect(parseDelegatedUploadSellerSearchRequest({ query: "  Shirt Shop  " })).toEqual({
      query: "Shirt Shop",
      limit: 20,
    });
  });

  it.each([
    { query: "a".repeat(101) },
    { query: "", limit: 0 },
    { query: "", limit: 51 },
    { query: "", limit: 1.5 },
    { query: "", cursor: "unsupported" },
  ])("rejects malformed seller search %#", (input) => {
    expect(() => parseDelegatedUploadSellerSearchRequest(input)).toThrowError(
      expect.objectContaining({
        statusCode: 400,
        code: "delegated_upload_invalid",
      }),
    );
  });

  it("requires seller and request identifiers for creation", () => {
    expect(
      parseCreateDelegatedClassifierBatchInput({
        sellerId: uuid(1),
        requestId: uuid(2),
      }),
    ).toEqual({
      sellerId: uuid(1),
      requestId: uuid(2),
    });
    expect(() =>
      parseCreateDelegatedClassifierBatchInput({
        sellerId: "not-a-uuid",
        requestId: uuid(2),
      }),
    ).toThrowError(expect.objectContaining({ code: "delegated_upload_invalid" }));
  });

  it("maps malformed shared upload input to the delegated input outcome", () => {
    expect(() =>
      parseDelegatedRegisterUploadsInput({
        workflowId: uuid(1),
        files: [],
      }),
    ).toThrowError(expect.objectContaining({ code: "delegated_upload_invalid" }));
  });
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
