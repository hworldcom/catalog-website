import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/v1/public/sellers/$sellerId/profile-images/$kind")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleGetPublicSellerProfileAsset } =
          await import("@/features/seller/server/seller-profile-media.http");
        return handleGetPublicSellerProfileAsset(request, params.sellerId, params.kind);
      },
    },
  },
});
