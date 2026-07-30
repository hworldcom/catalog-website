import { describe, expect, it } from "vitest";

import {
  decodeSellerClassifierHistoryCursor,
  encodeSellerClassifierHistoryCursor,
} from "./seller-classifier-history.cursor";

describe("seller classifier history cursor", () => {
  it("round-trips a versioned tuple boundary", () => {
    const encoded = encodeSellerClassifierHistoryCursor({
      createdAt: "2026-07-29T10:00:00.000Z",
      workflowId: uuid(1),
    });

    expect(decodeSellerClassifierHistoryCursor(encoded)).toEqual({
      version: 1,
      createdAt: "2026-07-29T10:00:00.000Z",
      workflowId: uuid(1),
    });
  });

  it.each([
    "not base64",
    "e30=",
    encode({ version: 2, createdAt: "2026-07-29T10:00:00.000Z", workflowId: uuid(1) }),
    encode({ version: 1, createdAt: "not-a-date", workflowId: uuid(1) }),
    encode({
      version: 1,
      createdAt: "2026-07-29T10:00:00.000Z",
      workflowId: "not-a-uuid",
    }),
  ])("rejects malformed cursor %s", (value) => {
    expect(() => decodeSellerClassifierHistoryCursor(value)).toThrowError(
      expect.objectContaining({ code: "seller_classifier_history_invalid" }),
    );
  });
});

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
