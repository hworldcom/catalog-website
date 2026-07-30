import { createFileRoute } from "@tanstack/react-router";

import { DelegatedClassifierUploadWorkflowScreen } from "@/features/admin/screens/delegated-classifier-upload-workflow-screen";

export const Route = createFileRoute("/_authenticated/admin/classifier-uploads_/$workflowId")({
  head: () => ({ meta: [{ title: "Delegated classifier upload · Bazoria" }] }),
  component: DelegatedClassifierUploadWorkflowRoute,
});

function DelegatedClassifierUploadWorkflowRoute() {
  const { workflowId } = Route.useParams();
  return <DelegatedClassifierUploadWorkflowScreen workflowId={workflowId} />;
}
