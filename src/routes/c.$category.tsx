import { createFileRoute, notFound } from "@tanstack/react-router";

import { NotFound } from "@/components/layout/not-found";
import { PageError } from "@/components/layout/page-error";
import {
  audienceNavigationQueryOptions,
  categoryQueryOptions,
} from "@/features/marketplace/queries";
import { CategoryScreen } from "@/features/marketplace/screens/category-screen";
import { normalizePublicAudience } from "@/features/marketplace/public-audience";

export const Route = createFileRoute("/c/$category")({
  loaderDeps: ({ search }) => ({ audience: normalizePublicAudience(search.audience) }),
  loader: async ({ params, context, deps }) => {
    const [data] = await Promise.all([
      context.queryClient.ensureQueryData(categoryQueryOptions(params.category, deps.audience)),
      context.queryClient.ensureQueryData(audienceNavigationQueryOptions(deps.audience)),
    ]);
    if (!data.category) throw notFound();
  },
  component: CategoryRoute,
  errorComponent: PageError,
  notFoundComponent: () => (
    <NotFound title="Category not found" message="We couldn't find that category." />
  ),
  head: ({ params }) => ({
    meta: [
      { title: `${prettify(params.category)} — Wholesale on Bazoria` },
      {
        name: "description",
        content: `Browse wholesale ${prettify(params.category).toLowerCase()} suppliers and products on Bazoria.`,
      },
    ],
  }),
});

function CategoryRoute() {
  const { category } = Route.useParams();
  const { audience } = Route.useLoaderDeps();
  return <CategoryScreen categorySlug={category} audience={audience} />;
}

function prettify(slug: string) {
  return slug
    .split("-")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}
