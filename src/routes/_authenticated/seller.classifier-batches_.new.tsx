import { createFileRoute } from "@tanstack/react-router";

import { SellerClassifierNewScreen } from "@/features/seller-classifier/screens/seller-classifier-new-screen";
import { guardSellerClassifierRoute } from "@/features/classifier-release/classifier-assisted-upload.navigation";

export const Route = createFileRoute("/_authenticated/seller/classifier-batches_/new")({
  beforeLoad: ({ search }) => guardSellerClassifierRoute(search),
  head: () => ({ meta: [{ title: "Classifier upload · Bazoria" }] }),
  component: SellerClassifierNewScreen,
});
