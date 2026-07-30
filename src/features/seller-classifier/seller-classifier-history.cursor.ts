import { z } from "zod";

import { invalidSellerClassifierHistoryRequest } from "./seller-classifier-history.types";

const CURSOR_VERSION = 1;

const cursorSchema = z
  .object({
    version: z.literal(CURSOR_VERSION),
    createdAt: z.string().datetime({ offset: true }),
    workflowId: z.string().uuid(),
  })
  .strict();

export type SellerClassifierHistoryCursor = z.infer<typeof cursorSchema>;

export function encodeSellerClassifierHistoryCursor(
  cursor: Omit<SellerClassifierHistoryCursor, "version">,
): string {
  return Buffer.from(JSON.stringify({ version: CURSOR_VERSION, ...cursor }), "utf8").toString(
    "base64url",
  );
}

export function decodeSellerClassifierHistoryCursor(value: string): SellerClassifierHistoryCursor {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalidSellerClassifierHistoryRequest();

  let parsedValue: unknown;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== value) {
      throw invalidSellerClassifierHistoryRequest();
    }
    parsedValue = JSON.parse(decoded);
  } catch {
    throw invalidSellerClassifierHistoryRequest();
  }

  const parsed = cursorSchema.safeParse(parsedValue);
  if (!parsed.success) throw invalidSellerClassifierHistoryRequest();
  return parsed.data;
}
