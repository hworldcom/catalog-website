import { createFileRoute } from "@tanstack/react-router";

import { SellerClassifierUploadScreen } from "@/features/seller-classifier/screens/seller-classifier-upload-screen";

export const Route = createFileRoute(
  "/_authenticated/seller/classifier-batches_/$workflowId/upload",
)({
  head: () => ({ meta: [{ title: "Upload product images · Bazoria" }] }),
  component: SellerClassifierUploadRoute,
});

function SellerClassifierUploadRoute() {
  const { workflowId } = Route.useParams();
  return <SellerClassifierUploadScreen workflowId={workflowId} />;
}
