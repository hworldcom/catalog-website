import { createFileRoute } from "@tanstack/react-router";

import { parseDelegatedClassifierImportSearch } from "@/features/admin/delegated-classifier-review-import.navigation";
import { guardAdministratorClassifierRoute } from "@/features/classifier-release/classifier-assisted-upload.navigation";
import { DelegatedProductPublicationScreen } from "@/features/admin/screens/delegated-product-publication-screen";

export const Route = createFileRoute(
  "/_authenticated/admin/classifier-uploads_/$workflowId_/products/$productDraftId",
)({
  beforeLoad: ({ search }) => guardAdministratorClassifierRoute(search),
  head: () => ({ meta: [{ title: "Complete seller product · Bazoria" }] }),
  validateSearch: parseDelegatedClassifierImportSearch,
  component: DelegatedProductPublicationRoute,
});

function DelegatedProductPublicationRoute() {
  const { workflowId, productDraftId } = Route.useParams();
  return (
    <DelegatedProductPublicationScreen
      key={`${workflowId}:${productDraftId}`}
      workflowId={workflowId}
      productDraftId={productDraftId}
    />
  );
}
