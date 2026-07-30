import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/v1/seller/classifier-batches/$workflowId/images/$imageId/thumbnail",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleGetSellerClassifierThumbnail } =
          await import("@/features/seller-classifier/server/seller-classifier-thumbnail.http");
        return handleGetSellerClassifierThumbnail(request, params.workflowId, params.imageId);
      },
    },
  },
});
