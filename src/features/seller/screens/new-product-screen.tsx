import { ProductEditor } from "../components/product-editor";

export function NewProductScreen({ onSaved }: { onSaved: (id: string) => void }) {
  return <ProductEditor initial={null} onSaved={onSaved} />;
}
