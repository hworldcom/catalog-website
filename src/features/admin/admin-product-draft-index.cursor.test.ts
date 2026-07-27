import { describe, expect, it } from "vitest";

import { parseAdminProductDraftIndexRequest } from "./admin-product-draft-index.types";
import {
  decodeAdminProductDraftIndexCursor,
  encodeAdminProductDraftIndexCursor,
} from "./admin-product-draft-index.cursor";

describe("administrator ProductDraft index request and cursor", () => {
  it("normalizes an omitted request to the documented defaults", () => {
    expect(parseAdminProductDraftIndexRequest(undefined)).toEqual({
      limit: 25,
      cursor: null,
      status: null,
      sellerId: null,
    });
  });

  it("rejects malformed filters, limits, identifiers, and unknown fields", () => {
    const invalid = [
      { limit: 0 },
      { limit: 101 },
      { limit: 1.5 },
      { status: "unknown" },
      { sellerId: "not-a-uuid" },
      { cursor: "" },
      { limit: 25, unexpected: true },
    ];

    for (const input of invalid) {
      expect(() => parseAdminProductDraftIndexRequest(input)).toThrowError(
        expect.objectContaining({
          statusCode: 400,
          code: "admin_product_drafts_invalid",
        }),
      );
    }
  });

  it("round-trips a versioned cursor only with its original limit and filters", () => {
    const request = {
      limit: 50,
      status: "draft" as const,
      sellerId: uuid(7),
    };
    const cursor = encodeAdminProductDraftIndexCursor({
      createdAt: "2026-07-24T12:00:00.000Z",
      productDraftId: uuid(8),
      ...request,
    });

    expect(decodeAdminProductDraftIndexCursor(cursor, request)).toEqual({
      version: 1,
      createdAt: "2026-07-24T12:00:00.000Z",
      productDraftId: uuid(8),
      ...request,
    });

    for (const mismatch of [
      { ...request, limit: 25 },
      { ...request, status: "published" as const },
      { ...request, sellerId: uuid(9) },
    ]) {
      expect(() => decodeAdminProductDraftIndexCursor(cursor, mismatch)).toThrowError(
        expect.objectContaining({ code: "admin_product_drafts_invalid" }),
      );
    }
  });

  it("rejects malformed, padded, and unsupported-version cursors", () => {
    const request = { limit: 25, status: null, sellerId: null };
    const unsupported = Buffer.from(
      JSON.stringify({
        version: 2,
        createdAt: "2026-07-24T12:00:00.000Z",
        productDraftId: uuid(1),
        ...request,
      }),
    ).toString("base64url");

    for (const cursor of ["not+base64url", `${unsupported}=`, unsupported]) {
      expect(() => decodeAdminProductDraftIndexCursor(cursor, request)).toThrowError(
        expect.objectContaining({ code: "admin_product_drafts_invalid" }),
      );
    }
  });
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
