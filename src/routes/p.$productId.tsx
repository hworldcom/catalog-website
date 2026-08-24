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
import {
  bazoriaSocialDescription,
  buildProductSocialPreview,
  buildSocialMeta,
} from "@/features/marketplace/social-sharing";
import { normalizeLanguage, pick } from "@/lib/i18n";

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
    return data;
  },
  component: ProductDetailRoute,
  errorComponent: PageError,
  notFoundComponent: () => (
    <NotFound title="Product not found" message="This product isn't available." />
  ),
  head: ({ loaderData, match }) => {
    const product = loaderData?.product;
    const seller = loaderData?.seller;
    if (!product || !seller) {
      return {
        meta: [
          { title: "Product — Bazoria" },
          {
            name: "description",
            content: pick(bazoriaSocialDescription, match.loaderDeps.language),
          },
        ],
      };
    }

    const preview = buildProductSocialPreview({
      origin: loaderData.publicSiteOrigin,
      productId: product.id,
      productTitle: product.title,
      productDescription: loaderData.description?.text ?? null,
      price: product.price,
      currency: product.currency,
      supplierName: seller.name,
      coverImageUrl: product.cover_image_url,
      galleryImageUrls: loaderData.images.map((image) => image.url),
      language: match.loaderDeps.language,
      audience: match.loaderDeps.audience,
    });
    return { meta: buildSocialMeta(preview) };
  },
});

function ProductDetailRoute() {
  const { productId } = Route.useParams();
  const { language, audience } = Route.useLoaderDeps();
  return <ProductDetailScreen productId={productId} language={language} audience={audience} />;
}

function isUuid(v: string) {
  return z.string().uuid().safeParse(v).success;
}
