import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { NotFound } from "@/components/layout/not-found";
import { PageError } from "@/components/layout/page-error";
import {
  audienceNavigationQueryOptions,
  productQueryOptions,
} from "@/features/marketplace/queries";
import { ProductDetailScreen } from "@/features/marketplace/screens/product-detail-screen";
import { normalizePublicAudience } from "@/features/marketplace/public-audience";
import { normalizeLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/p/$productId")({
  loaderDeps: ({ search }) => ({
    language: normalizeLanguage(search.lang),
    audience: normalizePublicAudience(search.audience),
  }),
  loader: async ({ params, context, deps }) => {
    if (!isUuid(params.productId)) throw notFound();
    const [data] = await Promise.all([
      context.queryClient.ensureQueryData(
        productQueryOptions(params.productId, deps.language, deps.audience),
      ),
      context.queryClient.ensureQueryData(audienceNavigationQueryOptions(deps.audience)),
    ]);
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
  const { language, audience } = Route.useLoaderDeps();
  return <ProductDetailScreen productId={productId} language={language} audience={audience} />;
}

function isUuid(v: string) {
  return z.string().uuid().safeParse(v).success;
}
