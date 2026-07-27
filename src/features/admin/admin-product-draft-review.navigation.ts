import { z } from "zod";

import {
  ADMIN_PRODUCT_DRAFT_INDEX_DEFAULT_LIMIT,
  ADMIN_PRODUCT_DRAFT_STATUSES,
  invalidAdminProductDraftIndexRequest,
} from "./admin-product-draft-index.types";
import { decodeAdminProductDraftIndexCursor } from "./admin-product-draft-index.cursor";

export type AdminProductDraftReviewSearch = {
  lang?: string;
  returnLimit?: number;
  returnStatus?: (typeof ADMIN_PRODUCT_DRAFT_STATUSES)[number];
  returnSellerId?: string;
  returnCursor?: string;
};

const searchSchema = z
  .object({
    lang: z.string().optional(),
    returnLimit: z.coerce.number().int().min(1).max(100).optional(),
    returnStatus: z.enum(ADMIN_PRODUCT_DRAFT_STATUSES).optional(),
    returnSellerId: z.string().uuid().optional(),
    returnCursor: z.string().min(1).optional(),
  })
  .strict();

export function parseAdminProductDraftReviewSearch(input: unknown): AdminProductDraftReviewSearch {
  const parsed = searchSchema.safeParse(input ?? {});
  if (!parsed.success) throw invalidAdminProductDraftIndexRequest();

  const search = parsed.data;
  const hasReturnContext =
    search.returnStatus !== undefined ||
    search.returnSellerId !== undefined ||
    search.returnCursor !== undefined;
  if (hasReturnContext && search.returnLimit === undefined) {
    throw invalidAdminProductDraftIndexRequest();
  }

  if (search.returnCursor) {
    decodeAdminProductDraftIndexCursor(search.returnCursor, {
      limit: search.returnLimit!,
      status: search.returnStatus ?? null,
      sellerId: search.returnSellerId ?? null,
    });
  }
  return search;
}

export function buildAdminProductDraftBackHref(
  search: AdminProductDraftReviewSearch,
  currentLang?: string,
): string {
  const query = new URLSearchParams({
    limit: String(search.returnLimit ?? ADMIN_PRODUCT_DRAFT_INDEX_DEFAULT_LIMIT),
  });
  if (search.returnStatus) query.set("status", search.returnStatus);
  if (search.returnSellerId) query.set("sellerId", search.returnSellerId);
  if (search.returnCursor) query.set("cursor", search.returnCursor);
  const lang = currentLang ?? search.lang;
  if (lang) query.set("lang", lang);
  return `/admin/product-drafts?${query}`;
}
