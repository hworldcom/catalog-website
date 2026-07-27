import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { ClassifierImportShell } from "@/features/admin/components/classifier-import-shell";
import { t, tr } from "@/lib/i18n";

import { ProductDraftFactsEditor } from "../components/product-draft-facts-editor";

const S = {
  title: t(
    "Review ProductDraft facts",
    "Sprawdź dane szkicu produktu",
    "Fakten des Produktentwurfs prüfen",
    "Xem lại thông tin bản nháp sản phẩm",
  ),
  description: t(
    "Review structured facts before generating catalog descriptions.",
    "Sprawdź ustrukturyzowane dane przed wygenerowaniem opisów katalogowych.",
    "Prüfen Sie strukturierte Fakten, bevor Katalogbeschreibungen erstellt werden.",
    "Xem lại thông tin có cấu trúc trước khi tạo mô tả danh mục.",
  ),
  back: t(
    "Back to classifier imports",
    "Wróć do importów klasyfikatora",
    "Zurück zu Klassifikator-Importen",
    "Quay lại nhập từ bộ phân loại",
  ),
};

export function AdminProductDraftFactsScreen({ productDraftId }: { productDraftId: string }) {
  return (
    <ClassifierImportShell>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h1 className="font-display text-2xl font-semibold">{tr(S.title)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{tr(S.description)}</p>
            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
              {productDraftId}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin/classifier-imports">{tr(S.back)}</Link>
          </Button>
        </div>

        <ProductDraftFactsEditor productDraftId={productDraftId} />
      </div>
    </ClassifierImportShell>
  );
}
