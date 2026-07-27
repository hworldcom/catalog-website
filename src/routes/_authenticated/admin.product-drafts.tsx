import { zodValidator } from "@tanstack/zod-adapter";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { AdminProductDraftIndexScreen } from "@/features/admin/screens/admin-product-draft-index-screen";
import {
  ADMIN_PRODUCT_DRAFT_INDEX_DEFAULT_LIMIT,
  ADMIN_PRODUCT_DRAFT_STATUSES,
  type AdminProductDraftIndexRequest,
} from "@/features/admin/admin-product-draft-index.types";

const searchSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(ADMIN_PRODUCT_DRAFT_INDEX_DEFAULT_LIMIT),
  cursor: z.string().min(1).optional(),
  status: z.enum(ADMIN_PRODUCT_DRAFT_STATUSES).optional(),
  sellerId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/admin/product-drafts")({
  head: () => ({ meta: [{ title: "ProductDrafts · Bazoria" }] }),
  validateSearch: zodValidator(searchSchema),
  component: AdminProductDraftIndexRoute,
});

function AdminProductDraftIndexRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const request: AdminProductDraftIndexRequest = {
    limit: search.limit,
    cursor: search.cursor ?? null,
    status: search.status ?? null,
    sellerId: search.sellerId ?? null,
  };

  return (
    <AdminProductDraftIndexScreen
      request={request}
      onRequestChange={(nextRequest) =>
        void navigate({
          search: (previous) => ({
            ...previous,
            limit: nextRequest.limit,
            cursor: nextRequest.cursor ?? undefined,
            status: nextRequest.status ?? undefined,
            sellerId: nextRequest.sellerId ?? undefined,
          }),
        })
      }
    />
  );
}
