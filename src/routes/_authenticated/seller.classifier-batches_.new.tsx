import { createFileRoute } from "@tanstack/react-router";

import { SellerClassifierNewScreen } from "@/features/seller-classifier/screens/seller-classifier-new-screen";

export const Route = createFileRoute("/_authenticated/seller/classifier-batches_/new")({
  head: () => ({ meta: [{ title: "Classifier upload · Bazoria" }] }),
  component: SellerClassifierNewScreen,
});
