import { describe, expect, it } from "vitest";

import {
  decodeSellerProductListCursor,
  encodeSellerProductListCursor,
} from "./seller-product-list.cursor";

describe("seller product list cursor", () => {
  it("round-trips the versioned boundary and binds it to the request limit", () => {
    const encoded = encodeSellerProductListCursor({
      createdAt: "2026-07-27T10:00:00.000Z",
      productId: uuid(1),
      limit: 25,
      status: "active",
    });

    expect(decodeSellerProductListCursor(encoded, { limit: 25, status: "active" })).toEqual({
      version: 2,
      createdAt: "2026-07-27T10:00:00.000Z",
      productId: uuid(1),
      limit: 25,
      status: "active",
    });
    expect(() =>
      decodeSellerProductListCursor(encoded, { limit: 50, status: "active" }),
    ).toThrowError(expect.objectContaining({ code: "seller_product_list_invalid" }));
    expect(() =>
      decodeSellerProductListCursor(encoded, { limit: 25, status: "archived" }),
    ).toThrowError(expect.objectContaining({ code: "seller_product_list_invalid" }));
  });

  it.each(["not base64", "e30=", "eyJ2ZXJzaW9uIjoyfQ"])(
    "rejects malformed or noncanonical cursor %s",
    (value) => {
      expect(() =>
        decodeSellerProductListCursor(value, { limit: 25, status: "active" }),
      ).toThrowError(expect.objectContaining({ code: "seller_product_list_invalid" }));
    },
  );
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
