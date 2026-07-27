import { z } from "zod";

import {
  ADMIN_PRODUCT_DRAFT_STATUSES,
  invalidAdminProductDraftIndexRequest,
  type AdminProductDraftIndexRequest,
} from "./admin-product-draft-index.types";

const CURSOR_VERSION = 1;

const cursorSchema = z
  .object({
    version: z.literal(CURSOR_VERSION),
    createdAt: z.string().datetime({ offset: true }),
    productDraftId: z.string().uuid(),
    limit: z.number().int().min(1).max(100),
    status: z.enum(ADMIN_PRODUCT_DRAFT_STATUSES).nullable(),
    sellerId: z.string().uuid().nullable(),
  })
  .strict();

export type AdminProductDraftIndexCursor = z.infer<typeof cursorSchema>;

export function encodeAdminProductDraftIndexCursor(
  cursor: Omit<AdminProductDraftIndexCursor, "version">,
): string {
  return Buffer.from(JSON.stringify({ version: CURSOR_VERSION, ...cursor }), "utf8").toString(
    "base64url",
  );
}

export function decodeAdminProductDraftIndexCursor(
  value: string,
  request: Pick<AdminProductDraftIndexRequest, "limit" | "status" | "sellerId">,
): AdminProductDraftIndexCursor {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalidAdminProductDraftIndexRequest();

  let parsedValue: unknown;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== value) {
      throw invalidAdminProductDraftIndexRequest();
    }
    parsedValue = JSON.parse(decoded);
  } catch {
    throw invalidAdminProductDraftIndexRequest();
  }

  const parsed = cursorSchema.safeParse(parsedValue);
  if (
    !parsed.success ||
    parsed.data.limit !== request.limit ||
    parsed.data.status !== request.status ||
    parsed.data.sellerId !== request.sellerId
  ) {
    throw invalidAdminProductDraftIndexRequest();
  }
  return parsed.data;
}
