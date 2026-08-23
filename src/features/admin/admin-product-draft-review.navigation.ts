import { z } from "zod";

import {
  ADMIN_PRODUCT_DRAFT_INDEX_DEFAULT_LIMIT,
  ADMIN_PRODUCT_DRAFT_INDEX_ALL_STATUS,
  ADMIN_PRODUCT_DRAFT_INDEX_STATUS_FILTERS,
  invalidAdminProductDraftIndexRequest,
  type AdminProductDraftStatusFilter,
} from "./admin-product-draft-index.types";
import { decodeAdminProductDraftIndexCursor } from "./admin-product-draft-index.cursor";
import { publicAudienceSchema, type PublicAudience } from "@/features/marketplace/public-audience";

export type AdminProductDraftReviewSearch = {
  lang?: string;
  audience?: PublicAudience;
  returnLimit?: number;
  returnStatus?: AdminProductDraftStatusFilter;
  returnSellerId?: string;
  returnCursor?: string;
};

const searchSchema = z
  .object({
    lang: z.string().optional(),
    audience: publicAudienceSchema.optional(),
    returnLimit: z.coerce.number().int().min(1).max(100).optional(),
    returnStatus: z.enum(ADMIN_PRODUCT_DRAFT_INDEX_STATUS_FILTERS).optional(),
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
      status:
        search.returnStatus === ADMIN_PRODUCT_DRAFT_INDEX_ALL_STATUS
          ? null
          : (search.returnStatus ?? null),
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
  if (search.audience) query.set("audience", search.audience);
  return `/admin/product-drafts?${query}`;
}
