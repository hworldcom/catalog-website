import { Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { reportClientError } from "@/lib/client-error-reporting";
import { t, tr } from "@/lib/i18n";

import { PublicShell } from "./public-shell";

const S = {
  errorTitle: t(
    "This page didn't load",
    "Ta strona się nie załadowała",
    "Diese Seite konnte nicht laden",
    "Trang này không tải được",
  ),
  errorMsg: t(
    "Something went wrong. Try again or head back to the marketplace.",
    "Coś poszło nie tak. Spróbuj ponownie lub wróć do marketplace.",
    "Etwas ist schiefgelaufen. Bitte erneut versuchen oder zurück zum Marktplatz.",
    "Đã có lỗi. Vui lòng thử lại hoặc quay về marketplace.",
  ),
  tryAgain: t("Try again", "Spróbuj ponownie", "Erneut versuchen", "Thử lại"),
  homeShort: t("Home", "Główna", "Home", "Trang chủ"),
};

export function PageError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportClientError(error, { boundary: "bazoria_page" });
  }, [error]);
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">{tr(S.errorTitle)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{tr(S.errorMsg)}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {tr(S.tryAgain)}
          </button>
          <Link
            to="/"
            className="inline-flex items-center border border-border px-4 py-2 text-sm hover:border-primary"
          >
            {tr(S.homeShort)}
          </Link>
        </div>
      </div>
    </PublicShell>
  );
}
