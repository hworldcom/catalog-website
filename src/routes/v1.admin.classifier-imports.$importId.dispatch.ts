import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/v1/admin/classifier-imports/$importId/dispatch")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { handleDispatchClassifierImport } =
          await import("@/features/admin/server/classifier-import.http");
        return handleDispatchClassifierImport(request, params.importId);
      },
    },
  },
});
