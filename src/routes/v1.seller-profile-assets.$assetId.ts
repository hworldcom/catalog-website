import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/v1/seller-profile-assets/$assetId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleGetPrivateSellerProfileAsset } =
          await import("@/features/seller/server/seller-profile-media.http");
        return handleGetPrivateSellerProfileAsset(request, params.assetId);
      },
    },
  },
});
