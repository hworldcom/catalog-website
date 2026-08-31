import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { DelegatedClassifierUploadNewScreen } from "@/features/admin/screens/delegated-classifier-upload-new-screen";
import { guardAdministratorClassifierRoute } from "@/features/classifier-release/classifier-assisted-upload.navigation";

export const Route = createFileRoute("/_authenticated/admin/classifier-uploads_/new")({
  beforeLoad: ({ search }) => guardAdministratorClassifierRoute(search),
  head: () => ({ meta: [{ title: "Upload for a seller · Bazoria" }] }),
  component: DelegatedClassifierUploadNewRoute,
});

function DelegatedClassifierUploadNewRoute() {
  const navigate = useNavigate();
  return (
    <DelegatedClassifierUploadNewScreen
      onCreated={(workflowId) =>
        void navigate({
          to: "/admin/classifier-uploads/$workflowId",
          params: { workflowId },
        })
      }
    />
  );
}
