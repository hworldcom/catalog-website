import { t, type T } from "@/lib/i18n";

export const productCodeCopy = {
  label: t("Product code", "Kod produktu", "Produktcode", "Mã sản phẩm"),
  assignedWhenPublishing: t(
    "Assigned when publishing",
    "Przypisywany podczas publikacji",
    "Wird bei der Veröffentlichung zugewiesen",
    "Được gán khi xuất bản",
  ),
} satisfies Record<string, T>;
