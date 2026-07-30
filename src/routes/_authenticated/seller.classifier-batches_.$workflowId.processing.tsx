import { createFileRoute } from "@tanstack/react-router";

import { SellerClassifierProcessingScreen } from "@/features/seller-classifier/screens/seller-classifier-processing-screen";

export const Route = createFileRoute(
  "/_authenticated/seller/classifier-batches_/$workflowId/processing",
)({
  head: () => ({ meta: [{ title: "Classifier processing · Bazoria" }] }),
  component: SellerClassifierProcessingRoute,
});

function SellerClassifierProcessingRoute() {
  const { workflowId } = Route.useParams();
  return <SellerClassifierProcessingScreen workflowId={workflowId} />;
}
