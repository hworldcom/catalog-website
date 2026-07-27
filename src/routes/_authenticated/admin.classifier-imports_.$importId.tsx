import { createFileRoute } from "@tanstack/react-router";

import { ClassifierImportDetailPage } from "@/features/admin/screens/classifier-import-detail-page";

export const Route = createFileRoute("/_authenticated/admin/classifier-imports_/$importId")({
  head: () => ({ meta: [{ title: "Classifier import details · Bazoria" }] }),
  component: ClassifierImportDetailRoute,
});

function ClassifierImportDetailRoute() {
  const { importId } = Route.useParams();
  return <ClassifierImportDetailPage importId={importId} />;
}
