import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/v1/admin/classifier-import-destination")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleGetClassifierImportDestination } =
          await import("@/features/admin/server/classifier-import.http");
        return handleGetClassifierImportDestination(request);
      },
    },
  },
});
