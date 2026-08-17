import { Link } from "@tanstack/react-router";

import { t, tr } from "@/lib/i18n";
import { marketplaceHomeSearch } from "@/features/marketplace/public-audience";

import { PublicShell } from "./public-shell";

const S = {
  notFoundTitle: t("Not found", "Nie znaleziono", "Nicht gefunden", "Không tìm thấy"),
  notFoundMsg: t(
    "The page you're looking for doesn't exist.",
    "Strona, której szukasz, nie istnieje.",
    "Die gesuchte Seite existiert nicht.",
    "Trang bạn tìm không tồn tại.",
  ),
  backToMarketplace: t(
    "Back to marketplace",
    "Wróć do marketplace",
    "Zurück zum Marktplatz",
    "Về marketplace",
  ),
};

export function NotFound({ title, message }: { title?: string; message?: string }) {
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="font-display text-3xl font-semibold">{title ?? tr(S.notFoundTitle)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message ?? tr(S.notFoundMsg)}</p>
        <div className="mt-6">
          <Link
            to="/"
            search={marketplaceHomeSearch}
            className="inline-flex items-center bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {tr(S.backToMarketplace)}
          </Link>
        </div>
      </div>
    </PublicShell>
  );
}
