import { createFileRoute } from "@tanstack/react-router";

import { SellerClassifierReviewScreen } from "@/features/seller-classifier/screens/seller-classifier-review-screen";
import { guardSellerClassifierRoute } from "@/features/classifier-release/classifier-assisted-upload.navigation";
import { parseSellerClassifierReviewSearch } from "@/features/seller-classifier/seller-classifier-import.navigation";

export const Route = createFileRoute(
  "/_authenticated/seller/classifier-batches_/$workflowId/review",
)({
  beforeLoad: ({ search }) => guardSellerClassifierRoute(search),
  head: () => ({ meta: [{ title: "Review product groups · Bazoria" }] }),
  validateSearch: parseSellerClassifierReviewSearch,
  component: SellerClassifierReviewRoute,
});

function SellerClassifierReviewRoute() {
  const { workflowId } = Route.useParams();
  const { notice } = Route.useSearch();
  return <SellerClassifierReviewScreen key={workflowId} workflowId={workflowId} notice={notice} />;
}
