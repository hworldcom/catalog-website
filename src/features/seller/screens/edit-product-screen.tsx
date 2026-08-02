import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import type { ProductDraftDescriptionEditorState } from "@/features/product-draft-descriptions/components/product-draft-description-editor";
import {
  SellerProductDraftDescriptionSection,
  type DescriptionGenerationRefreshScope,
} from "@/features/product-draft-descriptions/components/seller-product-draft-description-section";
import { getMyProduct } from "@/features/seller/products.functions";
import {
  ProductDraftFactsEditor,
  type ProductDraftFactsEditorState,
} from "@/features/product-draft-facts/components/product-draft-facts-editor";
import type { ProductDraftTitleSnapshot } from "@/features/product-draft-title/product-draft-title.types";
import { t, tr } from "@/lib/i18n";

import { ProductDraftImageGallery } from "../components/product-draft-image-gallery";
import {
  ProductEditor,
  type ProductEditorCoordinationState,
  type ProductEditorTitleReplacement,
  type SavedProductSnapshot,
} from "../components/product-editor";

const cleanProductState: ProductEditorCoordinationState = {
  dirty: false,
  saving: false,
  publicationActive: false,
};

const cleanEditorState = { dirty: false, saving: false };

export function EditProductScreen({ productId }: { productId: string }) {
  const [productState, setProductState] =
    useState<ProductEditorCoordinationState>(cleanProductState);
  const [factsState, setFactsState] = useState<ProductDraftFactsEditorState>(cleanEditorState);
  const [descriptionState, setDescriptionState] =
    useState<ProductDraftDescriptionEditorState>(cleanEditorState);
  const [generationActive, setGenerationActive] = useState(false);
  const [descriptionRefreshRequest, setDescriptionRefreshRequest] = useState(0);
  const [factsRefreshRequest, setFactsRefreshRequest] = useState(0);
  const [displayTitle, setDisplayTitle] = useState<string | null>(null);
  const [titleReplacement, setTitleReplacement] = useState<ProductEditorTitleReplacement | null>(
    null,
  );
  const get = useServerFn(getMyProduct);
  const queryClient = useQueryClient();
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

  const refreshProduct = useCallback(async () => {
    const refreshed = await get({ data: { id: productId } });
    queryClient.setQueryData(["my-product", productId], refreshed);
    if (refreshed.product) setDisplayTitle(refreshed.product.title);
  }, [get, productId, queryClient]);

  const refreshGenerationContext = useCallback(
    async (scope: DescriptionGenerationRefreshScope) => {
      await refreshProduct();
      if (scope === "product_and_facts") setFactsRefreshRequest((value) => value + 1);
    },
    [refreshProduct],
  );

  const handleGenerated = useCallback((result: { titleSnapshot: ProductDraftTitleSnapshot }) => {
    setDisplayTitle(result.titleSnapshot.title);
    setTitleReplacement((current) => ({
      version: (current?.version ?? 0) + 1,
      snapshot: result.titleSnapshot,
    }));
  }, []);

  const handleProductSaved = useCallback((snapshot: SavedProductSnapshot) => {
    setDisplayTitle(snapshot.title);
    setDescriptionRefreshRequest((value) => value + 1);
  }, []);

  useEffect(() => {
    setProductState(cleanProductState);
    setFactsState(cleanEditorState);
    setDescriptionState(cleanEditorState);
    setGenerationActive(false);
    setDisplayTitle(null);
    setTitleReplacement(null);
  }, [productId]);

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

  const currentTitle = displayTitle ?? data.product.title;

  return (
    <div className="space-y-8">
      {data.gallery ? (
        <ProductDraftImageGallery
          initialGallery={data.gallery}
          productTitle={currentTitle}
          refresh={refreshGallery}
        />
      ) : null}
      <ProductEditor
        initial={data.product}
        factsState={factsState}
        descriptionState={descriptionState}
        disabled={generationActive}
        titleReplacement={titleReplacement}
        onStateChange={setProductState}
        onDisplayTitleChange={setDisplayTitle}
        onProductSaved={handleProductSaved}
      />
      <ProductDraftFactsEditor
        productDraftId={productId}
        disabled={generationActive}
        refreshRequest={factsRefreshRequest}
        onStateChange={setFactsState}
        onSaved={() => setDescriptionRefreshRequest((value) => value + 1)}
      />
      <SellerProductDraftDescriptionSection
        productDraftId={productId}
        title={currentTitle}
        coordination={{ product: productState, facts: factsState }}
        refreshRequest={descriptionRefreshRequest}
        onDescriptionStateChange={setDescriptionState}
        onGenerationStateChange={setGenerationActive}
        onGenerated={handleGenerated}
        onRefreshContext={refreshGenerationContext}
      />
    </div>
  );
}
