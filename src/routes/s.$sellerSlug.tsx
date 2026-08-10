import { createFileRoute, notFound } from "@tanstack/react-router";

import { NotFound } from "@/components/layout/not-found";
import { PageError } from "@/components/layout/page-error";
import { audienceNavigationQueryOptions, sellerQueryOptions } from "@/features/marketplace/queries";
import { SellerStorefrontScreen } from "@/features/marketplace/screens/seller-storefront-screen";
import { normalizePublicAudience } from "@/features/marketplace/public-audience";

export const Route = createFileRoute("/s/$sellerSlug")({
  loaderDeps: ({ search }) => ({ audience: normalizePublicAudience(search.audience) }),
  loader: async ({ params, context, deps }) => {
    const [data] = await Promise.all([
      context.queryClient.ensureQueryData(sellerQueryOptions(params.sellerSlug, deps.audience)),
      context.queryClient.ensureQueryData(audienceNavigationQueryOptions(deps.audience)),
    ]);
    if (!data.seller) throw notFound();
    return data;
  },
  component: SellerStorefrontRoute,
  errorComponent: PageError,
  notFoundComponent: () => (
    <NotFound title="Storefront not found" message="We couldn't find that supplier." />
  ),
  head: ({ loaderData, params }) => {
    const sellerName = loaderData?.seller?.name ?? prettify(params.sellerSlug);
    const description = buildDescription(sellerName, loaderData?.seller?.about);
    const coverImage = loaderData?.seller?.cover_image_url;

    return {
      meta: [
        { title: `${sellerName} — Wholesale Storefront on Bazoria` },
        { name: "description", content: description },
        { property: "og:title", content: `${sellerName} — Wholesale Storefront on Bazoria` },
        { property: "og:description", content: description },
        ...(coverImage ? [{ property: "og:image", content: coverImage }] : []),
      ],
    };
  },
});

function SellerStorefrontRoute() {
  const { sellerSlug } = Route.useParams();
  const { audience } = Route.useLoaderDeps();
  return <SellerStorefrontScreen sellerSlug={sellerSlug} audience={audience} />;
}

function prettify(slug: string) {
  return slug
    .split("-")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

function buildDescription(sellerName: string, about: string | null | undefined) {
  const description = about?.trim();
  if (description) return description.slice(0, 160);
  return `Browse the wholesale catalog and contact ${sellerName} directly on Bazoria.`;
}
