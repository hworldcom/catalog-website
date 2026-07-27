import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { NotFound } from "@/components/layout/not-found";
import { PageError } from "@/components/layout/page-error";
import { productQueryOptions } from "@/features/marketplace/queries";
import { ProductDetailScreen } from "@/features/marketplace/screens/product-detail-screen";

export const Route = createFileRoute("/p/$productId")({
  loader: async ({ params, context }) => {
    if (!isUuid(params.productId)) throw notFound();
    const data = await context.queryClient.ensureQueryData(productQueryOptions(params.productId));
    if (!data.product) throw notFound();
  },
  component: ProductDetailRoute,
  errorComponent: PageError,
  notFoundComponent: () => (
    <NotFound title="Product not found" message="This product isn't available." />
  ),
  head: () => ({
    meta: [
      { title: "Product — Bazoria" },
      { name: "description", content: "Wholesale product details on Bazoria." },
    ],
  }),
});

function ProductDetailRoute() {
  const { productId } = Route.useParams();
  return <ProductDetailScreen productId={productId} />;
}

function isUuid(v: string) {
  return z.string().uuid().safeParse(v).success;
}
