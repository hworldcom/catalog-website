import { createFileRoute } from "@tanstack/react-router";

import { normalizePublicAudience } from "@/features/marketplace/public-audience";
import { audienceNavigationQueryOptions } from "@/features/marketplace/queries";
import { JoinNetworkScreen } from "@/features/marketplace/screens/join-network-screen";

const title = "Join the Wholesale Network — Bazoria";
const description =
  "See how Bazoria helps wholesalers publish shareable catalogues and professional buyers discover European suppliers.";

export const Route = createFileRoute("/join")({
  loaderDeps: ({ search }) => ({ audience: normalizePublicAudience(search.audience) }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(audienceNavigationQueryOptions(deps.audience)),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
  }),
  component: JoinRoute,
});

function JoinRoute() {
  const { audience } = Route.useLoaderDeps();
  return <JoinNetworkScreen audience={audience} />;
}
