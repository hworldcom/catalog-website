import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { t, tr, type T } from "@/lib/i18n";

import {
  ClassifierImportRequestError,
  classifierImportErrorMessage,
  createClassifierImportClient,
  type ClassifierBatchInboxItem,
  type ClassifierBatchInboxPage,
  type ClassifierImportClient,
  type ClassifierImportDestination,
  type ClassifierImportStatus,
} from "../classifier-import.api";
import { ClassifierImportShell } from "../components/classifier-import-shell";

const defaultClient = createClassifierImportClient();
const PAGE_SIZE = 20;

const S = {
  title: t(
    "Approved classifier batches",
    "Zatwierdzone partie klasyfikatora",
    "Genehmigte Klassifikator-Stapel",
    "Các lô phân loại đã duyệt",
  ),
  description: t(
    "Review approved batches and explicitly authorize creation of Bazoria ProductDrafts.",
    "Przejrzyj zatwierdzone partie i jawnie zezwól na utworzenie szkiców produktów Bazoria.",
    "Prüfen Sie genehmigte Stapel und autorisieren Sie ausdrücklich die Erstellung von Bazoria-Produktentwürfen.",
    "Xem các lô đã duyệt và cho phép rõ ràng việc tạo bản nháp sản phẩm Bazoria.",
  ),
  loading: t(
    "Loading approved batches…",
    "Ładowanie zatwierdzonych partii…",
    "Genehmigte Stapel werden geladen…",
    "Đang tải các lô đã duyệt…",
  ),
  refreshing: t(
    "Loading the requested page. The last successful page remains visible.",
    "Ładowanie żądanej strony. Ostatnia poprawna strona pozostaje widoczna.",
    "Die angeforderte Seite wird geladen. Die letzte erfolgreiche Seite bleibt sichtbar.",
    "Đang tải trang được yêu cầu. Trang tải thành công gần nhất vẫn hiển thị.",
  ),
  loadErrorTitle: t(
    "Approved batches could not be loaded",
    "Nie można załadować zatwierdzonych partii",
    "Genehmigte Stapel konnten nicht geladen werden",
    "Không thể tải các lô đã duyệt",
  ),
  destinationErrorTitle: t(
    "Import destination is unavailable",
    "Miejsce docelowe importu jest niedostępne",
    "Importziel ist nicht verfügbar",
    "Điểm đến nhập không khả dụng",
  ),
  actionErrorTitle: t(
    "Import could not be authorized",
    "Nie można autoryzować importu",
    "Import konnte nicht autorisiert werden",
    "Không thể cấp phép nhập",
  ),
  retry: t("Try again", "Spróbuj ponownie", "Erneut versuchen", "Thử lại"),
  emptyTitle: t(
    "No approved batches",
    "Brak zatwierdzonych partii",
    "Keine genehmigten Stapel",
    "Không có lô đã duyệt",
  ),
  emptyDescription: t(
    "Approved classifier batches will appear here without creating import work automatically.",
    "Zatwierdzone partie klasyfikatora pojawią się tutaj bez automatycznego tworzenia zadań importu.",
    "Genehmigte Klassifikator-Stapel erscheinen hier, ohne automatisch Importaufträge zu erstellen.",
    "Các lô phân loại đã duyệt sẽ xuất hiện ở đây mà không tự động tạo công việc nhập.",
  ),
  batchId: t("Classifier batch ID", "Identyfikator partii", "Klassifikator-Stapel-ID", "Mã lô"),
  created: t("Created", "Utworzono", "Erstellt", "Đã tạo"),
  finalized: t(
    "Upload finalized",
    "Przesyłanie zakończono",
    "Upload abgeschlossen",
    "Tải lên hoàn tất",
  ),
  originalFiles: t("Original files", "Pliki oryginalne", "Originaldateien", "Tệp gốc"),
  processedFiles: t(
    "Processed files",
    "Przetworzone pliki",
    "Verarbeitete Dateien",
    "Tệp đã xử lý",
  ),
  approvedGroups: t("Approved groups", "Zatwierdzone grupy", "Genehmigte Gruppen", "Nhóm đã duyệt"),
  destination: t(
    "Read-only destination store",
    "Docelowy sklep tylko do odczytu",
    "Schreibgeschützter Zielshop",
    "Cửa hàng đích chỉ đọc",
  ),
  storeId: t("Store ID", "Identyfikator sklepu", "Shop-ID", "Mã cửa hàng"),
  destinationLoading: t(
    "Resolving the destination store…",
    "Ustalanie sklepu docelowego…",
    "Zielshop wird ermittelt…",
    "Đang xác định cửa hàng đích…",
  ),
  destinationUnavailable: t(
    "Authorization is disabled until the destination store is available.",
    "Autoryzacja jest wyłączona do czasu udostępnienia sklepu docelowego.",
    "Die Autorisierung ist deaktiviert, bis der Zielshop verfügbar ist.",
    "Việc cấp phép bị tắt cho đến khi cửa hàng đích khả dụng.",
  ),
  ready: t(
    "Ready for authorization",
    "Gotowe do autoryzacji",
    "Bereit zur Autorisierung",
    "Sẵn sàng cấp phép",
  ),
  imported: t("Import authorized", "Import autoryzowany", "Import autorisiert", "Đã cấp phép nhập"),
  approve: t(
    "Approve and import",
    "Zatwierdź i importuj",
    "Genehmigen und importieren",
    "Duyệt và nhập",
  ),
  openImport: t(
    "Open import details",
    "Otwórz szczegóły importu",
    "Importdetails öffnen",
    "Mở chi tiết nhập",
  ),
  importStatus: t("Import status", "Stan importu", "Importstatus", "Trạng thái nhập"),
  errorCode: t("Stable error code", "Stały kod błędu", "Stabiler Fehlercode", "Mã lỗi ổn định"),
  none: t("None", "Brak", "Keiner", "Không có"),
  previous: t("Previous", "Poprzednia", "Zurück", "Trước"),
  next: t("Next", "Następna", "Weiter", "Tiếp"),
  page: t("Page", "Strona", "Seite", "Trang"),
  confirmTitle: t(
    "Authorize ProductDraft creation?",
    "Autoryzować utworzenie szkiców produktów?",
    "Erstellung von Produktentwürfen autorisieren?",
    "Cấp phép tạo bản nháp sản phẩm?",
  ),
  confirmDescription: t(
    "The classifier review is already approved. This action authorizes durable Bazoria ProductDraft creation for the read-only destination shown below.",
    "Przegląd klasyfikatora jest już zatwierdzony. Ta czynność zezwala na trwałe utworzenie szkiców produktów Bazoria dla widocznego poniżej miejsca docelowego tylko do odczytu.",
    "Die Klassifikator-Prüfung ist bereits genehmigt. Diese Aktion autorisiert die dauerhafte Erstellung von Bazoria-Produktentwürfen für das unten angezeigte schreibgeschützte Ziel.",
    "Quy trình xem xét phân loại đã được duyệt. Thao tác này cấp phép tạo bản nháp sản phẩm Bazoria lâu dài cho điểm đến chỉ đọc bên dưới.",
  ),
  cancel: t("Cancel", "Anuluj", "Abbrechen", "Hủy"),
  authorizing: t("Authorizing…", "Autoryzowanie…", "Autorisierung…", "Đang cấp phép…"),
  notAvailable: t("Not available", "Niedostępne", "Nicht verfügbar", "Không khả dụng"),
  sellerUnavailable: t(
    "Store unavailable",
    "Sklep niedostępny",
    "Shop nicht verfügbar",
    "Cửa hàng không khả dụng",
  ),
  pending: t("Pending", "Oczekujące", "Ausstehend", "Đang chờ"),
  running: t("Running", "W toku", "Läuft", "Đang chạy"),
  completed: t("Completed", "Zakończono", "Abgeschlossen", "Đã hoàn tất"),
  completedWithErrors: t(
    "Completed with errors",
    "Zakończono z błędami",
    "Mit Fehlern abgeschlossen",
    "Hoàn tất có lỗi",
  ),
  failed: t("Failed", "Nieudane", "Fehlgeschlagen", "Thất bại"),
};

const statusLabels: Record<ClassifierImportStatus, T> = {
  pending: S.pending,
  running: S.running,
  completed: S.completed,
  completed_with_errors: S.completedWithErrors,
  failed: S.failed,
};

type ClassifierImportInboxScreenProps = {
  client?: ClassifierImportClient;
  onOpenImport: (importId: string) => void;
};

export function ClassifierImportInboxScreen({
  client = defaultClient,
  onOpenImport,
}: ClassifierImportInboxScreenProps) {
  const [page, setPage] = useState<ClassifierBatchInboxPage | null>(null);
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loadedPageIndex, setLoadedPageIndex] = useState(0);
  const [pageRequest, setPageRequest] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [destination, setDestination] = useState<ClassifierImportDestination | null>(null);
  const [destinationRequest, setDestinationRequest] = useState(0);
  const [destinationLoading, setDestinationLoading] = useState(true);
  const [destinationError, setDestinationError] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<ClassifierBatchInboxItem | null>(null);
  const [submittingBatchId, setSubmittingBatchId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const currentCursor = cursorStack[pageIndex];

  useEffect(() => {
    const controller = new AbortController();
    setPageLoading(true);
    setPageError(null);
    void client
      .listBatches({ limit: PAGE_SIZE, cursor: currentCursor, signal: controller.signal })
      .then((nextPage) => {
        if (!controller.signal.aborted) {
          setPage(nextPage);
          setLoadedPageIndex(pageIndex);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setPageError(classifierImportErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPageLoading(false);
      });
    return () => controller.abort();
  }, [client, currentCursor, pageIndex, pageRequest]);

  useEffect(() => {
    const controller = new AbortController();
    setDestination(null);
    setDestinationLoading(true);
    setDestinationError(null);
    void client
      .getDestination(controller.signal)
      .then((nextDestination) => {
        if (!controller.signal.aborted) setDestination(nextDestination);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setDestinationError(classifierImportErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDestinationLoading(false);
      });
    return () => controller.abort();
  }, [client, destinationRequest]);

  async function authorizeSelectedBatch() {
    if (!selectedBatch || !destination || submittingBatchId) return;
    const batchId = selectedBatch.batchId;
    setSubmittingBatchId(batchId);
    setActionError(null);
    try {
      const result = await client.start(batchId);
      onOpenImport(result.importId);
    } catch (error) {
      if (
        error instanceof ClassifierImportRequestError &&
        error.code === "classifier_import_retry_required" &&
        error.importId
      ) {
        onOpenImport(error.importId);
      } else {
        setActionError(classifierImportErrorMessage(error));
      }
    } finally {
      setSubmittingBatchId(null);
      setSelectedBatch(null);
    }
  }

  function showNextPage() {
    if (!page?.nextCursor || pageLoading || pageError || pageIndex !== loadedPageIndex) return;
    setCursorStack((current) => [...current.slice(0, pageIndex + 1), page.nextCursor ?? undefined]);
    setPageIndex((current) => current + 1);
  }

  function showPreviousPage() {
    if (pageIndex === 0 || pageLoading) return;
    setPageIndex((current) => current - 1);
  }

  return (
    <ClassifierImportShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">{tr(S.title)}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{tr(S.description)}</p>
        </div>

        {pageError ? (
          <Alert variant="destructive">
            <AlertTitle>{tr(S.loadErrorTitle)}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{pageError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPageRequest((v) => v + 1)}
              >
                {tr(S.retry)}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {destinationError ? (
          <Alert variant="destructive">
            <AlertTitle>{tr(S.destinationErrorTitle)}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{destinationError}</p>
              <p>{tr(S.destinationUnavailable)}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDestinationRequest((v) => v + 1)}
              >
                {tr(S.retry)}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {actionError ? (
          <Alert variant="destructive">
            <AlertTitle>{tr(S.actionErrorTitle)}</AlertTitle>
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        ) : null}

        {!page && pageLoading ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">{tr(S.loading)}</CardContent>
          </Card>
        ) : null}

        {page && pageLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            {tr(S.refreshing)}
          </p>
        ) : null}

        {page && page.items.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{tr(S.emptyTitle)}</CardTitle>
              <CardDescription>{tr(S.emptyDescription)}</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {page?.items.length ? (
          <div className="space-y-4">
            {page.items.map((batch) => (
              <BatchCard
                key={batch.batchId}
                batch={batch}
                destination={destination}
                destinationLoading={destinationLoading}
                authorizationDisabled={submittingBatchId !== null}
                onAuthorize={() => {
                  setActionError(null);
                  setSelectedBatch(batch);
                }}
              />
            ))}
          </div>
        ) : null}

        {page ? (
          <nav
            aria-label={tr(S.page)}
            className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
          >
            <Button
              type="button"
              variant="outline"
              disabled={pageIndex === 0 || pageLoading}
              onClick={showPreviousPage}
            >
              {tr(S.previous)}
            </Button>
            <span className="text-sm text-muted-foreground">
              {tr(S.page)} {loadedPageIndex + 1}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={
                !page.nextCursor ||
                pageLoading ||
                Boolean(pageError) ||
                pageIndex !== loadedPageIndex
              }
              onClick={showNextPage}
            >
              {tr(S.next)}
            </Button>
          </nav>
        ) : null}
      </div>

      <AlertDialog
        open={selectedBatch !== null}
        onOpenChange={(open) => {
          if (!open && !submittingBatchId) setSelectedBatch(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr(S.confirmTitle)}</AlertDialogTitle>
            <AlertDialogDescription>{tr(S.confirmDescription)}</AlertDialogDescription>
          </AlertDialogHeader>
          {selectedBatch && destination ? (
            <dl className="grid gap-4 rounded-md border p-4 text-sm">
              <Definition label={tr(S.batchId)} value={selectedBatch.batchId} mono />
              <Definition label={tr(S.destination)} value={destination.destinationSeller.name} />
              <Definition label={tr(S.storeId)} value={destination.destinationSeller.id} mono />
            </dl>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submittingBatchId !== null}>
              {tr(S.cancel)}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!selectedBatch || !destination || submittingBatchId !== null}
              onClick={(event) => {
                event.preventDefault();
                void authorizeSelectedBatch();
              }}
            >
              {submittingBatchId ? tr(S.authorizing) : tr(S.approve)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ClassifierImportShell>
  );
}

function BatchCard({
  batch,
  destination,
  destinationLoading,
  authorizationDisabled,
  onAuthorize,
}: {
  batch: ClassifierBatchInboxItem;
  destination: ClassifierImportDestination | null;
  destinationLoading: boolean;
  authorizationDisabled: boolean;
  onAuthorize: () => void;
}) {
  const existingImport = batch.imports[0] ?? null;
  const seller = existingImport?.destinationSeller ?? destination?.destinationSeller ?? null;

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base">{tr(S.batchId)}</CardTitle>
          <CardDescription className="mt-1 break-all font-mono text-xs">
            {batch.batchId}
          </CardDescription>
        </div>
        <Badge variant={existingImport ? "secondary" : "outline"}>
          {existingImport ? tr(S.imported) : tr(S.ready)}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <Definition label={tr(S.created)} value={formatTimestamp(batch.createdAt)} />
          <Definition label={tr(S.finalized)} value={formatTimestamp(batch.finalizedAt)} />
          <Definition label={tr(S.originalFiles)} value={String(batch.originalFileCount)} />
          <Definition label={tr(S.processedFiles)} value={String(batch.processedFileCount)} />
          <Definition label={tr(S.approvedGroups)} value={String(batch.groupCount)} />
        </dl>

        <div className="grid gap-4 rounded-md border bg-muted/20 p-4 text-sm sm:grid-cols-2">
          <Definition
            label={tr(S.destination)}
            value={
              seller?.name ??
              (destinationLoading ? tr(S.destinationLoading) : tr(S.sellerUnavailable))
            }
          />
          <Definition
            label={tr(S.storeId)}
            value={seller?.id ?? tr(S.notAvailable)}
            mono={Boolean(seller)}
          />
          {existingImport ? (
            <>
              <Definition
                label={tr(S.importStatus)}
                value={tr(statusLabels[existingImport.status])}
              />
              <Definition
                label={tr(S.errorCode)}
                value={existingImport.errorCode ?? tr(S.none)}
                mono={Boolean(existingImport.errorCode)}
              />
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          {existingImport ? (
            <Button asChild variant="outline">
              <Link
                to="/admin/classifier-imports/$importId"
                params={{ importId: existingImport.importId }}
              >
                {tr(S.openImport)}
              </Link>
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!destination || authorizationDisabled}
              onClick={onAuthorize}
            >
              {tr(S.approve)}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Definition({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-all ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</dd>
    </div>
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) return tr(S.notAvailable);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    date,
  );
}
