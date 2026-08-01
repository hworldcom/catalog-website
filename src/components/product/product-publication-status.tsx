import { Button } from "@/components/ui/button";
import type {
  SellerProductPublicationSnapshot,
  SellerProductPublicationStatus,
} from "@/features/seller/seller-product-publication.types";
import { t, tr } from "@/lib/i18n";

import { isActiveProductPublication } from "./product-publication-status.utils";

const S = {
  publication: t(
    "Product publication",
    "Publikacja produktu",
    "Produktveröffentlichung",
    "Xuất bản sản phẩm",
  ),
  publishing: t(
    "Publishing product and images",
    "Publikowanie produktu i zdjęć",
    "Produkt und Bilder werden veröffentlicht",
    "Đang xuất bản sản phẩm và hình ảnh",
  ),
  published: t(
    "Product published",
    "Produkt opublikowany",
    "Produkt veröffentlicht",
    "Sản phẩm đã được xuất bản",
  ),
  failed: t(
    "Publication failed",
    "Publikowanie nie powiodło się",
    "Veröffentlichung fehlgeschlagen",
    "Xuất bản thất bại",
  ),
  cleanup: t(
    "Publication cleanup required",
    "Wymagane czyszczenie publikacji",
    "Bereinigung der Veröffentlichung erforderlich",
    "Cần dọn dẹp quá trình xuất bản",
  ),
  pending: t(
    "Publication is queued and will start shortly.",
    "Publikacja jest w kolejce i rozpocznie się wkrótce.",
    "Die Veröffentlichung ist eingereiht und beginnt in Kürze.",
    "Quá trình xuất bản đang trong hàng đợi và sẽ sớm bắt đầu.",
  ),
  running: t(
    "The public product images are being prepared.",
    "Publiczne zdjęcia produktu są przygotowywane.",
    "Die öffentlichen Produktbilder werden vorbereitet.",
    "Hình ảnh công khai của sản phẩm đang được chuẩn bị.",
  ),
  completed: t(
    "The product and its images are publicly available.",
    "Produkt i jego zdjęcia są dostępne publicznie.",
    "Das Produkt und seine Bilder sind öffentlich verfügbar.",
    "Sản phẩm và hình ảnh hiện đã được công khai.",
  ),
  introduction: t(
    "Publishing creates stable public copies of the approved imported images.",
    "Publikowanie tworzy trwałe publiczne kopie zatwierdzonych importowanych zdjęć.",
    "Beim Veröffentlichen werden dauerhafte öffentliche Kopien der genehmigten importierten Bilder erstellt.",
    "Việc xuất bản tạo các bản sao công khai ổn định của hình ảnh nhập đã được phê duyệt.",
  ),
  cleanupGuidance: t(
    "Temporary public-image files must be cleaned up before publication can be retried.",
    "Tymczasowe publiczne pliki zdjęć muszą zostać usunięte przed ponowną próbą publikacji.",
    "Temporäre öffentliche Bilddateien müssen vor einem erneuten Veröffentlichungsversuch bereinigt werden.",
    "Các tệp hình ảnh công khai tạm thời phải được dọn dẹp trước khi có thể thử xuất bản lại.",
  ),
  retry: t(
    "Retry publication",
    "Ponów publikację",
    "Veröffentlichung erneut versuchen",
    "Thử xuất bản lại",
  ),
  support: t(
    "Contact support before trying to publish this product again.",
    "Skontaktuj się z pomocą techniczną przed ponowną próbą publikacji tego produktu.",
    "Wenden Sie sich an den Support, bevor Sie dieses Produkt erneut veröffentlichen.",
    "Hãy liên hệ bộ phận hỗ trợ trước khi thử xuất bản lại sản phẩm này.",
  ),
  refreshFailed: t(
    "Publication status could not be refreshed. The last known state is preserved.",
    "Nie udało się odświeżyć stanu publikacji. Zachowano ostatni znany stan.",
    "Der Veröffentlichungsstatus konnte nicht aktualisiert werden. Der letzte bekannte Stand bleibt erhalten.",
    "Không thể làm mới trạng thái xuất bản. Trạng thái gần nhất vẫn được giữ lại.",
  ),
  refresh: t("Refresh status", "Odśwież stan", "Status aktualisieren", "Làm mới trạng thái"),
  viewPublished: t(
    "View published product",
    "Zobacz opublikowany produkt",
    "Veröffentlichtes Produkt ansehen",
    "Xem sản phẩm đã xuất bản",
  ),
  refreshesAutomatically: t(
    "Publication status refreshes automatically.",
    "Stan publikacji odświeża się automatycznie.",
    "Der Veröffentlichungsstatus wird automatisch aktualisiert.",
    "Trạng thái xuất bản tự động làm mới.",
  ),
  dispatchFailed: t(
    "Publication could not be started. Try again.",
    "Nie udało się rozpocząć publikacji. Spróbuj ponownie.",
    "Die Veröffentlichung konnte nicht gestartet werden. Versuchen Sie es erneut.",
    "Không thể bắt đầu xuất bản. Hãy thử lại.",
  ),
  sourceUnavailable: t(
    "One or more product pictures could not be read. Try again. If the problem continues, contact support.",
    "Nie udało się odczytać co najmniej jednego zdjęcia produktu. Spróbuj ponownie. Jeśli problem będzie się powtarzał, skontaktuj się z pomocą techniczną.",
    "Mindestens ein Produktbild konnte nicht gelesen werden. Versuchen Sie es erneut. Wenn das Problem weiterhin besteht, wenden Sie sich an den Support.",
    "Không thể đọc một hoặc nhiều hình ảnh sản phẩm. Hãy thử lại. Nếu sự cố tiếp diễn, hãy liên hệ bộ phận hỗ trợ.",
  ),
  sourceChanged: t(
    "A product picture changed after publication was prepared. Contact support before publishing again.",
    "Zdjęcie produktu zmieniło się po przygotowaniu publikacji. Skontaktuj się z pomocą techniczną przed ponowną publikacją.",
    "Ein Produktbild wurde nach der Vorbereitung der Veröffentlichung geändert. Wenden Sie sich vor einer erneuten Veröffentlichung an den Support.",
    "Một hình ảnh sản phẩm đã thay đổi sau khi chuẩn bị xuất bản. Hãy liên hệ bộ phận hỗ trợ trước khi xuất bản lại.",
  ),
  destinationConflict: t(
    "A public product picture conflicts with an existing file. Contact support before publishing again.",
    "Publiczne zdjęcie produktu koliduje z istniejącym plikiem. Skontaktuj się z pomocą techniczną przed ponowną publikacją.",
    "Ein öffentliches Produktbild steht im Konflikt mit einer vorhandenen Datei. Wenden Sie sich vor einer erneuten Veröffentlichung an den Support.",
    "Một hình ảnh sản phẩm công khai xung đột với tệp hiện có. Hãy liên hệ bộ phận hỗ trợ trước khi xuất bản lại.",
  ),
  transferFailed: t(
    "One or more product pictures could not be copied for publication. Try again.",
    "Nie udało się skopiować co najmniej jednego zdjęcia produktu do publikacji. Spróbuj ponownie.",
    "Mindestens ein Produktbild konnte nicht zur Veröffentlichung kopiert werden. Versuchen Sie es erneut.",
    "Không thể sao chép một hoặc nhiều hình ảnh sản phẩm để xuất bản. Hãy thử lại.",
  ),
  verificationFailed: t(
    "A copied product picture could not be verified. Try again.",
    "Nie udało się zweryfikować skopiowanego zdjęcia produktu. Spróbuj ponownie.",
    "Ein kopiertes Produktbild konnte nicht überprüft werden. Versuchen Sie es erneut.",
    "Không thể xác minh hình ảnh sản phẩm đã sao chép. Hãy thử lại.",
  ),
  finalizationFailed: t(
    "The product could not be finalized after its pictures were prepared. Check the product fields, save any corrections, and try again.",
    "Nie udało się sfinalizować produktu po przygotowaniu zdjęć. Sprawdź pola produktu, zapisz poprawki i spróbuj ponownie.",
    "Das Produkt konnte nach der Vorbereitung seiner Bilder nicht abgeschlossen werden. Prüfen Sie die Produktfelder, speichern Sie Korrekturen und versuchen Sie es erneut.",
    "Không thể hoàn tất sản phẩm sau khi chuẩn bị hình ảnh. Kiểm tra các trường sản phẩm, lưu chỉnh sửa và thử lại.",
  ),
  unknownFailure: t(
    "Product publication encountered an unexpected problem. Try again or contact support if it continues.",
    "Podczas publikowania produktu wystąpił nieoczekiwany problem. Spróbuj ponownie lub skontaktuj się z pomocą techniczną, jeśli problem będzie się powtarzał.",
    "Bei der Produktveröffentlichung ist ein unerwartetes Problem aufgetreten. Versuchen Sie es erneut oder wenden Sie sich an den Support, wenn es weiterhin besteht.",
    "Đã xảy ra sự cố không mong muốn khi xuất bản sản phẩm. Hãy thử lại hoặc liên hệ bộ phận hỗ trợ nếu sự cố tiếp diễn.",
  ),
};

export function ProductPublicationStatus({
  snapshot,
  statusReadFailed,
  busy,
  onRefresh,
  onRetry,
}: {
  snapshot: SellerProductPublicationSnapshot | null;
  statusReadFailed: boolean;
  busy: boolean;
  onRefresh(): void;
  onRetry(): void;
}) {
  const status = snapshot?.publicationStatus;
  const active = isActiveProductPublication(status);
  const failed = status === "failed" || status === "cleanup_required";

  return (
    <section className="border border-border bg-card p-4 text-sm" aria-live="polite">
      <h2 className="font-medium">{publicationStatusTitle(status)}</h2>
      <p className="mt-1 text-muted-foreground">
        {publicationStatusDescription(status, snapshot?.failureReasonCode ?? null)}
      </p>
      {status === "cleanup_required" ? (
        <p className="mt-2 text-muted-foreground">{tr(S.cleanupGuidance)}</p>
      ) : null}
      {statusReadFailed ? (
        <div className="mt-3">
          <p className="text-destructive">{tr(S.refreshFailed)}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRefresh}>
            {tr(S.refresh)}
          </Button>
        </div>
      ) : null}
      {failed && snapshot?.retryAllowed ? (
        <Button
          type="button"
          disabled={busy}
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onRetry}
        >
          {tr(S.retry)}
        </Button>
      ) : null}
      {failed && !snapshot?.retryAllowed ? (
        <p className="mt-3 text-muted-foreground">{tr(S.support)}</p>
      ) : null}
      {snapshot &&
      status === "completed" &&
      snapshot.productStatus === "published" &&
      snapshot.publicProductUrl ? (
        <a
          href={snapshot.publicProductUrl}
          className="mt-3 inline-block text-primary underline underline-offset-4"
        >
          {tr(S.viewPublished)}
        </a>
      ) : null}
      {active ? <span className="sr-only">{tr(S.refreshesAutomatically)}</span> : null}
    </section>
  );
}

function publicationStatusTitle(status: SellerProductPublicationStatus | undefined): string {
  if (status === "pending" || status === "running") return tr(S.publishing);
  if (status === "completed") return tr(S.published);
  if (status === "failed") return tr(S.failed);
  if (status === "cleanup_required") return tr(S.cleanup);
  return tr(S.publication);
}

function publicationStatusDescription(
  status: SellerProductPublicationStatus | undefined,
  failureReasonCode: SellerProductPublicationSnapshot["failureReasonCode"],
): string {
  if (status === "pending") return tr(S.pending);
  if (status === "running") return tr(S.running);
  if (status === "completed") return tr(S.completed);
  if (status === "failed" || status === "cleanup_required") {
    return publicationFailureMessage(failureReasonCode);
  }
  return tr(S.introduction);
}

function publicationFailureMessage(
  failureReasonCode: SellerProductPublicationSnapshot["failureReasonCode"],
): string {
  switch (failureReasonCode) {
    case "product_publication_dispatch_failed":
      return tr(S.dispatchFailed);
    case "product_publication_source_unavailable":
      return tr(S.sourceUnavailable);
    case "product_publication_source_changed":
      return tr(S.sourceChanged);
    case "product_publication_destination_conflict":
      return tr(S.destinationConflict);
    case "product_publication_transfer_failed":
      return tr(S.transferFailed);
    case "product_publication_verification_failed":
      return tr(S.verificationFailed);
    case "product_publication_finalization_failed":
      return tr(S.finalizationFailed);
    default:
      return tr(S.unknownFailure);
  }
}
