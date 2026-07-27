import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ClassifierImportInboxScreen } from "@/features/admin/screens/classifier-import-inbox-screen";

export const Route = createFileRoute("/_authenticated/admin/classifier-imports")({
  head: () => ({ meta: [{ title: "Classifier imports · Bazoria" }] }),
  component: ClassifierImportsRoute,
});

function ClassifierImportsRoute() {
  const navigate = useNavigate();
  return (
    <ClassifierImportInboxScreen
      onOpenImport={(importId) =>
        void navigate({
          to: "/admin/classifier-imports/$importId",
          params: { importId },
        })
      }
    />
  );
}
