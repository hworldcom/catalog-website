import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { LanguageSwitcher, t, tr } from "@/lib/i18n";
import { useAdministratorNavigationContext } from "../administrator-navigation.context";

const S = {
  catalogOperations: t(
    "Catalog operations",
    "Operacje katalogowe",
    "Katalogvorgänge",
    "Vận hành danh mục",
  ),
  productDrafts: t("ProductDrafts", "Szkice produktów", "Produktentwürfe", "Bản nháp sản phẩm"),
  moderationRequests: t(
    "Moderation requests",
    "Prośby o moderację",
    "Moderationsanfragen",
    "Yêu cầu kiểm duyệt",
  ),
  delegatedUpload: t(
    "Upload for seller",
    "Prześlij dla sprzedawcy",
    "Für Verkäufer hochladen",
    "Tải lên cho nhà bán",
  ),
  internalOperations: t(
    "Internal catalog operations",
    "Wewnętrzne operacje katalogowe",
    "Interne Katalogvorgänge",
    "Vận hành danh mục nội bộ",
  ),
  sellerDashboard: t("Seller dashboard", "Panel sprzedawcy", "Verkäufer-Dashboard", "Bảng nhà bán"),
};

export function ClassifierImportShell({ children }: { children: ReactNode }) {
  const { prototypeAdministrator } = useAdministratorNavigationContext();
  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/admin/classifier-uploads/new" className="min-w-0">
            <div className="font-display text-lg font-semibold">{tr(S.catalogOperations)}</div>
            <div className="text-xs text-muted-foreground">{tr(S.internalOperations)}</div>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              to="/admin/classifier-uploads/new"
              className="text-muted-foreground hover:text-foreground"
            >
              {tr(S.delegatedUpload)}
            </Link>
            <Link
              to="/admin/product-drafts"
              search={{ limit: 25 }}
              className="text-muted-foreground hover:text-foreground"
            >
              {tr(S.productDrafts)}
            </Link>
            {prototypeAdministrator ? (
              <Link
                to="/admin/moderation"
                search={{ reviewStatus: "pending", limit: 25 }}
                className="text-muted-foreground hover:text-foreground"
              >
                {tr(S.moderationRequests)}
              </Link>
            ) : null}
            <Link to="/seller" className="text-muted-foreground hover:text-foreground">
              {tr(S.sellerDashboard)}
            </Link>
            <LanguageSwitcher />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
