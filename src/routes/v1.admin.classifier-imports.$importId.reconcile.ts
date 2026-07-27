import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/v1/admin/classifier-imports/$importId/reconcile")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { handleReconcileClassifierImport } =
          await import("@/features/admin/server/classifier-import.http");
        return handleReconcileClassifierImport(request, params.importId);
      },
    },
  },
});
