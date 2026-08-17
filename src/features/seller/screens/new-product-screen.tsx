import { useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { t, tr } from "@/lib/i18n";

import { ProductEditor } from "../components/product-editor";
import { EditProductScreen } from "./edit-product-screen";

export function NewProductScreen({ onSaved }: { onSaved: (id: string) => void }) {
  const [savedProductId, setSavedProductId] = useState<string | null>(null);

  if (savedProductId) return <EditProductScreen productId={savedProductId} />;

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
                "Save the draft once. The picture uploader will open here immediately.",
                "Zapisz szkic raz. Narzędzie do przesyłania zdjęć otworzy się tutaj od razu.",
                "Speichern Sie den Entwurf einmal. Der Bild-Upload wird hier sofort geöffnet.",
                "Lưu bản nháp một lần. Trình tải ảnh lên sẽ mở ngay tại đây.",
              ),
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {tr(
              t(
                "Pictures are stored against the saved private draft and remain hidden from buyers.",
                "Zdjęcia są zapisywane w prywatnym szkicu i pozostają niewidoczne dla kupujących.",
                "Bilder werden im privaten Entwurf gespeichert und bleiben für Käufer unsichtbar.",
                "Ảnh được lưu trong bản nháp riêng tư và vẫn ẩn với người mua.",
              ),
            )}
          </p>
        </CardContent>
      </Card>
      <ProductEditor
        initial={null}
        onSaved={(id) => {
          setSavedProductId(id);
          onSaved(id);
        }}
      />
    </div>
  );
}
