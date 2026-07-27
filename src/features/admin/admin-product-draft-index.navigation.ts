import type { Lang } from "@/lib/i18n";

import type { AdminProductDraftIndexRequest } from "./admin-product-draft-index.types";

export function buildAdminProductDraftReviewHref(
  productDraftId: string,
  request: AdminProductDraftIndexRequest,
  lang?: Lang,
): string {
  const search = new URLSearchParams({ returnLimit: String(request.limit) });
  if (request.status) search.set("returnStatus", request.status);
  if (request.sellerId) search.set("returnSellerId", request.sellerId);
  if (request.cursor) search.set("returnCursor", request.cursor);
  if (lang) search.set("lang", lang);
  return `/admin/product-drafts/${encodeURIComponent(productDraftId)}?${search}`;
}
