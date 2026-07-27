import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { NewProductScreen } from "@/features/seller/screens/new-product-screen";

export const Route = createFileRoute("/_authenticated/seller/products_/new")({
  component: NewProduct,
});

function NewProduct() {
  const navigate = useNavigate();
  return (
    <NewProductScreen onSaved={(id) => navigate({ to: "/seller/products/$id", params: { id } })} />
  );
}
