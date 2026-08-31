import { createFileRoute } from "@tanstack/react-router";

import { parseDelegatedClassifierReviewSearch } from "@/features/admin/delegated-classifier-review-import.navigation";
import { guardAdministratorClassifierRoute } from "@/features/classifier-release/classifier-assisted-upload.navigation";
import { DelegatedClassifierReviewScreen } from "@/features/admin/screens/delegated-classifier-review-import-screens";

export const Route = createFileRoute(
  "/_authenticated/admin/classifier-uploads_/$workflowId_/review",
)({
  beforeLoad: ({ search }) => guardAdministratorClassifierRoute(search),
  head: () => ({ meta: [{ title: "Review delegated product groups · Bazoria" }] }),
  validateSearch: parseDelegatedClassifierReviewSearch,
  component: DelegatedClassifierReviewRoute,
});

function DelegatedClassifierReviewRoute() {
  const { workflowId } = Route.useParams();
  const { notice } = Route.useSearch();
  return (
    <DelegatedClassifierReviewScreen key={workflowId} workflowId={workflowId} notice={notice} />
  );
}
