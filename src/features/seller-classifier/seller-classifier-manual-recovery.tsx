import { Link } from "@tanstack/react-router";

import { t, tr } from "@/lib/i18n";

import { isSellerClassifierUnavailable } from "./seller-classifier-error";

const S = {
  guidance: t(
    "Automatic grouping is temporarily unavailable. You can still add a product manually.",
    "Automatyczne grupowanie jest tymczasowo niedostępne. Nadal możesz dodać produkt ręcznie.",
    "Die automatische Gruppierung ist vorübergehend nicht verfügbar. Sie können weiterhin ein Produkt manuell hinzufügen.",
    "Tính năng nhóm tự động tạm thời không khả dụng. Bạn vẫn có thể thêm sản phẩm thủ công.",
  ),
  action: t(
    "Add product manually",
    "Dodaj produkt ręcznie",
    "Produkt manuell hinzufügen",
    "Thêm sản phẩm thủ công",
  ),
};

export function SellerClassifierManualRecovery({ error }: { error: unknown }) {
  if (!isSellerClassifierUnavailable(error)) return null;

  return (
    <div className="space-y-2">
      <p>{tr(S.guidance)}</p>
      <Link
        to="/seller/products/new"
        className="inline-flex font-medium text-primary underline underline-offset-4"
      >
        {tr(S.action)}
      </Link>
    </div>
  );
}
