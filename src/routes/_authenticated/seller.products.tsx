import { zodValidator } from "@tanstack/zod-adapter";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { ProductsScreen } from "@/features/seller/screens/products-screen";
import {
  SELLER_PRODUCT_LIST_DEFAULT_LIMIT,
  type SellerProductListRequest,
} from "@/features/seller/seller-product-list.types";

const searchSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(SELLER_PRODUCT_LIST_DEFAULT_LIMIT),
  cursor: z.string().min(1).optional(),
});

export const Route = createFileRoute("/_authenticated/seller/products")({
  validateSearch: zodValidator(searchSchema),
  component: SellerProductsRoute,
});

function SellerProductsRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const request: SellerProductListRequest = {
    limit: search.limit,
    cursor: search.cursor ?? null,
  };

  return (
    <ProductsScreen
      request={request}
      onRequestChange={(nextRequest) =>
        void navigate({
          search: (previous) => ({
            ...previous,
            limit: nextRequest.limit,
            cursor: nextRequest.cursor ?? undefined,
          }),
        })
      }
    />
  );
}
