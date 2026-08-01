import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/v1/admin/classifier-uploads/$workflowId/images/$imageId/thumbnail",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleGetDelegatedClassifierThumbnail } =
          await import("@/features/admin/server/delegated-classifier-thumbnail.http");
        return handleGetDelegatedClassifierThumbnail(request, params.workflowId, params.imageId);
      },
    },
  },
});
