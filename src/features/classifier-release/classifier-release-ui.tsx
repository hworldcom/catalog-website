import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { t, tr } from "@/lib/i18n";

import { CLASSIFIER_ASSISTED_UPLOAD_DISABLED_CODE } from "./classifier-assisted-upload";
import { useRuntimePublicConfig } from "./classifier-release-runtime";

const S = {
  noticeTitle: t(
    "Classifier-assisted uploads unavailable",
    "Przesyłanie z klasyfikatorem jest niedostępne",
    "Klassifikator-Uploads sind nicht verfügbar",
    "Tải lên bằng bộ phân loại không khả dụng",
  ),
  noticeDescription: t(
    "Classifier-assisted uploads are unavailable in this environment.",
    "Przesyłanie z klasyfikatorem jest niedostępne w tym środowisku.",
    "Klassifikator-Uploads sind in dieser Umgebung nicht verfügbar.",
    "Tải lên bằng bộ phân loại không khả dụng trong môi trường này.",
  ),
};

export function ClassifierAssistedUploadDisabledNotice({ notice }: { notice?: string }) {
  if (notice !== CLASSIFIER_ASSISTED_UPLOAD_DISABLED_CODE) return null;
  return (
    <Alert className="border-sky-300 bg-sky-50 text-sky-950">
      <AlertTitle>{tr(S.noticeTitle)}</AlertTitle>
      <AlertDescription>{tr(S.noticeDescription)}</AlertDescription>
    </Alert>
  );
}

export function UatEnvironmentBadge() {
  const config = useRuntimePublicConfig();
  if (config?.environment !== "uat") return null;
  return (
    <div
      aria-label="User acceptance testing environment"
      className="fixed bottom-4 right-4 z-50 rounded-md border border-amber-400 bg-amber-100 px-2.5 py-1 text-xs font-bold tracking-[0.16em] text-amber-950 shadow-sm"
    >
      UAT
    </div>
  );
}
