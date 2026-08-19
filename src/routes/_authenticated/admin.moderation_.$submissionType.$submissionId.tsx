import { createFileRoute } from "@tanstack/react-router";

import { parseAdministratorModerationReviewRoute } from "@/features/admin/administrator-moderation-review.navigation";
import { AdministratorModerationReviewScreen } from "@/features/admin/screens/administrator-moderation-review-screen";

export const Route = createFileRoute(
  "/_authenticated/admin/moderation_/$submissionType/$submissionId",
)({
  head: () => ({ meta: [{ title: "Moderation request · Bazoria" }] }),
  validateSearch: (search) => search,
  component: AdministratorModerationReviewRoute,
});

function AdministratorModerationReviewRoute() {
  const routeState = parseAdministratorModerationReviewRoute(Route.useParams(), Route.useSearch());
  return <AdministratorModerationReviewScreen routeState={routeState} />;
}
