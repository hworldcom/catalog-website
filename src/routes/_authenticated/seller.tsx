import { createFileRoute } from "@tanstack/react-router";

import { SellerLayoutScreen } from "@/features/seller/screens/seller-layout-screen";

export const Route = createFileRoute("/_authenticated/seller")({
  head: () => ({ meta: [{ title: "Seller dashboard · Bazoria" }] }),
  component: SellerLayoutScreen,
});
