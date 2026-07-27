import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/v1/admin/classifier-imports/$importId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleGetClassifierImport } =
          await import("@/features/admin/server/classifier-import.http");
        return handleGetClassifierImport(request, params.importId);
      },
    },
  },
});
