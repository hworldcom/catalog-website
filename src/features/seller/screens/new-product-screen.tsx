import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { t, tr } from "@/lib/i18n";

import { ProductEditor } from "../components/product-editor";

export function NewProductScreen({ onSaved }: { onSaved: (id: string) => void }) {
  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>
            {tr(t("Product images", "Zdjęcia produktu", "Produktbilder", "Hình ảnh sản phẩm"))}
          </CardTitle>
          <CardDescription>
            {tr(
              t(
                "Private product pictures become available after the draft is saved.",
                "Prywatne zdjęcia produktu będą dostępne po zapisaniu szkicu.",
                "Private Produktbilder sind nach dem Speichern des Entwurfs verfügbar.",
                "Hình ảnh sản phẩm riêng tư sẽ khả dụng sau khi lưu bản nháp.",
              ),
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            disabled
            className="border border-border bg-card px-4 py-2 text-sm font-medium opacity-60"
          >
            {tr(
              t(
                "Save draft to add pictures",
                "Zapisz szkic, aby dodać zdjęcia",
                "Entwurf speichern, um Bilder hinzuzufügen",
                "Lưu bản nháp để thêm hình ảnh",
              ),
            )}
          </button>
        </CardContent>
      </Card>
      <ProductEditor
        initial={null}
        galleryState={{
          activeImageCount: 0,
          hasDurableImages: false,
          hasAvailableCover: false,
          incomplete: false,
        }}
        onSaved={onSaved}
      />
    </div>
  );
}
