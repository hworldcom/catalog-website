import { createFileRoute } from "@tanstack/react-router";

import { StorefrontScreen } from "@/features/seller/screens/storefront-screen";

export const Route = createFileRoute("/_authenticated/seller/storefront")({
  component: StorefrontScreen,
});
