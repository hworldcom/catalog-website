import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/v1/admin/classifier-batches")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleListClassifierBatches } =
          await import("@/features/admin/server/classifier-batch-inbox.http");
        return handleListClassifierBatches(request);
      },
    },
  },
});
