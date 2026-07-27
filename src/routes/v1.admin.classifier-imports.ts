import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/v1/admin/classifier-imports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleStartClassifierImport } =
          await import("@/features/admin/server/classifier-import.http");
        return handleStartClassifierImport(request);
      },
    },
  },
});
