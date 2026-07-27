import { z } from "zod";

import {
  invalidSellerProductListRequest,
  SELLER_PRODUCT_LIST_MAX_LIMIT,
  type SellerProductListRequest,
} from "./seller-product-list.types";

const CURSOR_VERSION = 1;

const cursorSchema = z
  .object({
    version: z.literal(CURSOR_VERSION),
    createdAt: z.string().datetime({ offset: true }),
    productId: z.string().uuid(),
    limit: z.number().int().min(1).max(SELLER_PRODUCT_LIST_MAX_LIMIT),
  })
  .strict();

export type SellerProductListCursor = z.infer<typeof cursorSchema>;

export function encodeSellerProductListCursor(
  cursor: Omit<SellerProductListCursor, "version">,
): string {
  return Buffer.from(JSON.stringify({ version: CURSOR_VERSION, ...cursor }), "utf8").toString(
    "base64url",
  );
}

export function decodeSellerProductListCursor(
  value: string,
  request: Pick<SellerProductListRequest, "limit">,
): SellerProductListCursor {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalidSellerProductListRequest();

  let parsedValue: unknown;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== value) {
      throw invalidSellerProductListRequest();
    }
    parsedValue = JSON.parse(decoded);
  } catch {
    throw invalidSellerProductListRequest();
  }

  const parsed = cursorSchema.safeParse(parsedValue);
  if (!parsed.success || parsed.data.limit !== request.limit) {
    throw invalidSellerProductListRequest();
  }
  return parsed.data;
}
