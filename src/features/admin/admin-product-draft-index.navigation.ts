import type { Lang } from "@/lib/i18n";

import {
  ADMIN_PRODUCT_DRAFT_INDEX_ALL_STATUS,
  type AdminProductDraftIndexRequest,
} from "./admin-product-draft-index.types";

export function buildAdminProductDraftReviewHref(
  productDraftId: string,
  request: AdminProductDraftIndexRequest,
  lang?: Lang,
): string {
  const search = new URLSearchParams({ returnLimit: String(request.limit) });
  search.set("returnStatus", request.status ?? ADMIN_PRODUCT_DRAFT_INDEX_ALL_STATUS);
  if (request.sellerId) search.set("returnSellerId", request.sellerId);
  if (request.cursor) search.set("returnCursor", request.cursor);
  if (lang) search.set("lang", lang);
  return `/admin/product-drafts/${encodeURIComponent(productDraftId)}?${search}`;
}
