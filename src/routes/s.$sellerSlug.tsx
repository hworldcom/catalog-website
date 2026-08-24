import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { NotFound } from "@/components/layout/not-found";
import { PageError } from "@/components/layout/page-error";
import { audienceNavigationQueryOptions, sellerQueryOptions } from "@/features/marketplace/queries";
import { SellerStorefrontScreen } from "@/features/marketplace/screens/seller-storefront-screen";
import { normalizePublicAudience } from "@/features/marketplace/public-audience";
import {
  bazoriaSocialDescription,
  buildSellerSocialPreview,
  buildSocialMeta,
} from "@/features/marketplace/social-sharing";
import { normalizeLanguage, pick } from "@/lib/i18n";

export const Route = createFileRoute("/s/$sellerSlug")({
  loaderDeps: ({ search }) => ({
    audience: normalizePublicAudience(search.audience),
    lang: normalizeLanguage(search.lang),
  }),
  loader: async ({ params, context, deps }) => {
    const [data] = await Promise.all([
      context.queryClient.ensureQueryData(sellerQueryOptions(params.sellerSlug, deps.audience)),
      context.queryClient.ensureQueryData(audienceNavigationQueryOptions(deps.audience)),
    ]);
    if (!data.seller) throw notFound();
    if (data.canonicalSlug && data.canonicalSlug !== params.sellerSlug) {
      throw redirect({
        to: "/s/$sellerSlug",
        params: { sellerSlug: data.canonicalSlug },
        search: { lang: deps.lang, audience: deps.audience },
        statusCode: 308,
      });
    }
    return data;
  },
  component: SellerStorefrontRoute,
  errorComponent: PageError,
  notFoundComponent: () => (
    <NotFound title="Storefront not found" message="We couldn't find that supplier." />
  ),
  head: ({ loaderData, match }) => {
    const seller = loaderData?.seller;
    if (!seller) {
      return {
        meta: [
          { title: "Storefront — Bazoria" },
          {
            name: "description",
            content: pick(bazoriaSocialDescription, match.loaderDeps.lang),
          },
        ],
      };
    }

    const preview = buildSellerSocialPreview({
      origin: loaderData.publicSiteOrigin,
      canonicalSlug: loaderData.canonicalSlug ?? seller.slug,
      sellerName: seller.name,
      sellerAbout: seller.about,
      sellerCity: seller.city,
      sellerCountry: seller.country,
      logoImageUrl: seller.logo_url,
      coverImageUrl: seller.cover_image_url,
      language: match.loaderDeps.lang,
      audience: match.loaderDeps.audience,
    });
    return { meta: buildSocialMeta(preview) };
  },
});

function SellerStorefrontRoute() {
  const { sellerSlug } = Route.useParams();
  const { audience } = Route.useLoaderDeps();
  return <SellerStorefrontScreen sellerSlug={sellerSlug} audience={audience} />;
}
