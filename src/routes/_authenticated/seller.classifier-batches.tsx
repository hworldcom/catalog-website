import { createFileRoute } from "@tanstack/react-router";

import { SellerClassifierHistoryScreen } from "@/features/seller-classifier/screens/seller-classifier-history-screen";
import { guardSellerClassifierRoute } from "@/features/classifier-release/classifier-assisted-upload.navigation";

export const Route = createFileRoute("/_authenticated/seller/classifier-batches")({
  beforeLoad: ({ search }) => guardSellerClassifierRoute(search),
  head: () => ({ meta: [{ title: "Classifier uploads · Bazoria" }] }),
  component: SellerClassifierHistoryScreen,
});
