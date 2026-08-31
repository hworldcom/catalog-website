import { createFileRoute } from "@tanstack/react-router";

import { ClassifierImportDetailPage } from "@/features/admin/screens/classifier-import-detail-page";
import { guardAdministratorClassifierRoute } from "@/features/classifier-release/classifier-assisted-upload.navigation";

export const Route = createFileRoute("/_authenticated/admin/classifier-imports_/$importId")({
  beforeLoad: ({ search }) => guardAdministratorClassifierRoute(search),
  head: () => ({ meta: [{ title: "Classifier import details · Bazoria" }] }),
  component: ClassifierImportDetailRoute,
});

function ClassifierImportDetailRoute() {
  const { importId } = Route.useParams();
  return <ClassifierImportDetailPage importId={importId} />;
}
