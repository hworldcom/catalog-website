import { createFileRoute } from "@tanstack/react-router";

import { SellerClassifierImportScreen } from "@/features/seller-classifier/screens/seller-classifier-import-screen";
import { parseSellerClassifierImportSearch } from "@/features/seller-classifier/seller-classifier-import.navigation";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute(
  "/_authenticated/seller/classifier-batches_/$workflowId/import",
)({
  head: () => ({ meta: [{ title: "Product draft creation · Bazoria" }] }),
  validateSearch: parseSellerClassifierImportSearch,
  component: SellerClassifierImportRoute,
});

function SellerClassifierImportRoute() {
  const { workflowId } = Route.useParams();
  const lang = useLang();
  return <SellerClassifierImportScreen key={workflowId} workflowId={workflowId} lang={lang} />;
}
