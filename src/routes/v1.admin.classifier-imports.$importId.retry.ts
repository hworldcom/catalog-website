import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/v1/admin/classifier-imports/$importId/retry")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { handleRetryClassifierImport } =
          await import("@/features/admin/server/classifier-import.http");
        return handleRetryClassifierImport(request, params.importId);
      },
    },
  },
});
