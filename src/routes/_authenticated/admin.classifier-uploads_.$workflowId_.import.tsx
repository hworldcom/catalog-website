import { createFileRoute } from "@tanstack/react-router";

import { parseDelegatedClassifierImportSearch } from "@/features/admin/delegated-classifier-review-import.navigation";
import { DelegatedClassifierImportScreen } from "@/features/admin/screens/delegated-classifier-review-import-screens";

export const Route = createFileRoute(
  "/_authenticated/admin/classifier-uploads_/$workflowId_/import",
)({
  head: () => ({ meta: [{ title: "Delegated product draft creation · Bazoria" }] }),
  validateSearch: parseDelegatedClassifierImportSearch,
  component: DelegatedClassifierImportRoute,
});

function DelegatedClassifierImportRoute() {
  const { workflowId } = Route.useParams();
  return <DelegatedClassifierImportScreen key={workflowId} workflowId={workflowId} />;
}
