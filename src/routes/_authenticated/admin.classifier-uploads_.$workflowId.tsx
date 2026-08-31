import { createFileRoute } from "@tanstack/react-router";

import { DelegatedClassifierUploadWorkflowScreen } from "@/features/admin/screens/delegated-classifier-upload-workflow-screen";
import { guardAdministratorClassifierRoute } from "@/features/classifier-release/classifier-assisted-upload.navigation";

export const Route = createFileRoute("/_authenticated/admin/classifier-uploads_/$workflowId")({
  beforeLoad: ({ search }) => guardAdministratorClassifierRoute(search),
  head: () => ({ meta: [{ title: "Delegated classifier upload · Bazoria" }] }),
  component: DelegatedClassifierUploadWorkflowRoute,
});

function DelegatedClassifierUploadWorkflowRoute() {
  const { workflowId } = Route.useParams();
  return <DelegatedClassifierUploadWorkflowScreen workflowId={workflowId} />;
}
