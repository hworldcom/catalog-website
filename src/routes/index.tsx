import { createFileRoute } from "@tanstack/react-router";

import { NotFound } from "@/components/layout/not-found";
import { PageError } from "@/components/layout/page-error";
import { MarketplaceHomeScreen } from "@/features/marketplace/screens/marketplace-home-screen";
import { normalizePublicAudience } from "@/features/marketplace/public-audience";
import {
  audienceNavigationQueryOptions,
  marketplaceQueryOptions,
} from "@/features/marketplace/queries";

export const Route = createFileRoute("/")({
  component: MarketplaceRoute,
  loaderDeps: ({ search }) => ({ audience: normalizePublicAudience(search.audience) }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(marketplaceQueryOptions(deps.audience)),
      context.queryClient.ensureQueryData(audienceNavigationQueryOptions(deps.audience)),
    ]),
  head: () => ({
    meta: [
      { title: "Bazoria — Wholesale Discovery for Retailers & Resellers" },
      {
        name: "description",
        content:
          "Discover wholesale suppliers and browse catalogs. Contact sellers directly through inquiry or WhatsApp — no middlemen, no checkout.",
      },
      { property: "og:title", content: "Bazoria — Wholesale Discovery for Retailers & Resellers" },
      {
        property: "og:description",
        content:
          "Discover wholesale suppliers and browse catalogs. Contact sellers directly through inquiry or WhatsApp — no middlemen, no checkout.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: PageError,
  notFoundComponent: () => <NotFound title="Marketplace unavailable" />,
});

function MarketplaceRoute() {
  const { audience } = Route.useLoaderDeps();
  return <MarketplaceHomeScreen audience={audience} />;
}
