import { createFileRoute } from "@tanstack/react-router";

import { EditProductScreen } from "@/features/seller/screens/edit-product-screen";

export const Route = createFileRoute("/_authenticated/seller/products_/$id")({
  component: EditProduct,
});

function EditProduct() {
  const { id } = Route.useParams();
  return <EditProductScreen productId={id} />;
}
