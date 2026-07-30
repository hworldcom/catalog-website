import { createFileRoute } from "@tanstack/react-router";

import { SellerClassifierHistoryScreen } from "@/features/seller-classifier/screens/seller-classifier-history-screen";

export const Route = createFileRoute("/_authenticated/seller/classifier-batches")({
  head: () => ({ meta: [{ title: "Classifier uploads · Bazoria" }] }),
  component: SellerClassifierHistoryScreen,
});
