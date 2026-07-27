import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyProduct } from "@/features/seller/products.functions";
import {
  ProductDraftFactsEditor,
  type ProductDraftFactsEditorState,
} from "@/features/product-draft-facts/components/product-draft-facts-editor";
import { t, tr } from "@/lib/i18n";

import { ProductDraftImageGallery } from "../components/product-draft-image-gallery";
import { ProductEditor } from "../components/product-editor";

export function EditProductScreen({ productId }: { productId: string }) {
  const [factsState, setFactsState] = useState<ProductDraftFactsEditorState>({
    dirty: false,
    saving: false,
  });
  const get = useServerFn(getMyProduct);
  const { data, isError, isLoading } = useQuery({
    queryKey: ["my-product", productId],
    queryFn: () => get({ data: { id: productId } }),
  });
  const refreshGallery = useCallback(async () => {
    const refreshed = await get({ data: { id: productId } });
    if (!refreshed.product || !refreshed.gallery) {
      throw new Error("ProductDraft gallery is unavailable.");
    }
    return refreshed.gallery;
  }, [get, productId]);

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (isError)
    return (
      <div className="text-sm text-muted-foreground">
        {tr(
          t(
            "Product is temporarily unavailable.",
            "Produkt jest tymczasowo niedostępny.",
            "Das Produkt ist vorübergehend nicht verfügbar.",
            "Sản phẩm tạm thời không khả dụng.",
          ),
        )}
      </div>
    );
  if (!data?.product)
    return <div className="text-sm text-muted-foreground">Product not found.</div>;

  return (
    <div className="space-y-8">
      {data.gallery ? (
        <ProductDraftImageGallery
          initialGallery={data.gallery}
          productTitle={data.product.title}
          refresh={refreshGallery}
        />
      ) : null}
      <ProductEditor initial={data.product} factsState={factsState} />
      <ProductDraftFactsEditor productDraftId={productId} onStateChange={setFactsState} />
    </div>
  );
}
