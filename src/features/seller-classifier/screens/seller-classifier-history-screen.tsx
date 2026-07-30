import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { t, tr, type Lang, useLang } from "@/lib/i18n";

import { retryMyClassifierBatchProvisioning } from "../seller-classifier-batch.functions";
import type { SellerClassifierBatchSnapshot } from "../seller-classifier-batch.types";
import { listMyClassifierBatches } from "../seller-classifier-history.functions";
import {
  SELLER_CLASSIFIER_HISTORY_DEFAULT_LIMIT,
  type SellerClassifierHistoryErrorSummaryCode,
  type SellerClassifierHistoryItem,
  type SellerClassifierHistoryPage,
  type SellerClassifierHistoryPrimaryAction,
  type SellerClassifierHistoryRequest,
} from "../seller-classifier-history.types";

const S = {
  title: t(
    "Classifier uploads",
    "Przesyłanie z klasyfikatorem",
    "Klassifikator-Uploads",
    "Tải lên bằng bộ phân loại",
  ),
  description: t(
    "Continue previous classifier workflows or start a new upload.",
    "Kontynuuj wcześniejsze procesy klasyfikatora lub rozpocznij nowe przesyłanie.",
    "Setzen Sie frühere Klassifikator-Abläufe fort oder starten Sie einen neuen Upload.",
    "Tiếp tục quy trình phân loại trước đó hoặc bắt đầu lượt tải lên mới.",
  ),
  newUpload: t(
    "New classifier upload",
    "Nowe przesyłanie z klasyfikatorem",
    "Neuer Klassifikator-Upload",
    "Tải lên mới bằng bộ phân loại",
  ),
  refresh: t("Refresh history", "Odśwież historię", "Verlauf aktualisieren", "Làm mới lịch sử"),
  refreshing: t("Refreshing…", "Odświeżanie…", "Wird aktualisiert…", "Đang làm mới…"),
  loading: t(
    "Loading classifier history…",
    "Ładowanie historii klasyfikatora…",
    "Klassifikator-Verlauf wird geladen…",
    "Đang tải lịch sử phân loại…",
  ),
  emptyTitle: t(
    "No classifier uploads yet",
    "Brak przesyłania z klasyfikatorem",
    "Noch keine Klassifikator-Uploads",
    "Chưa có lượt tải lên bằng bộ phân loại",
  ),
  emptyDescription: t(
    "Start a classifier upload to prepare product images and drafts.",
    "Rozpocznij przesyłanie z klasyfikatorem, aby przygotować zdjęcia i szkice produktów.",
    "Starten Sie einen Klassifikator-Upload, um Produktbilder und Entwürfe vorzubereiten.",
    "Bắt đầu tải lên bằng bộ phân loại để chuẩn bị ảnh và bản nháp sản phẩm.",
  ),
  unavailableTitle: t(
    "Classifier history could not be loaded",
    "Nie można załadować historii klasyfikatora",
    "Der Klassifikator-Verlauf konnte nicht geladen werden",
    "Không thể tải lịch sử phân loại",
  ),
  unavailable: t(
    "Classifier workflow history is temporarily unavailable.",
    "Historia procesów klasyfikatora jest tymczasowo niedostępna.",
    "Der Verlauf der Klassifikator-Abläufe ist vorübergehend nicht verfügbar.",
    "Lịch sử quy trình phân loại tạm thời không khả dụng.",
  ),
  sellerMissing: t(
    "A seller profile is required to view classifier uploads.",
    "Profil sprzedawcy jest wymagany, aby wyświetlić przesyłanie z klasyfikatorem.",
    "Zum Anzeigen der Klassifikator-Uploads ist ein Verkäuferprofil erforderlich.",
    "Cần hồ sơ người bán để xem các lượt tải lên bằng bộ phân loại.",
  ),
  tryAgain: t("Try again", "Spróbuj ponownie", "Erneut versuchen", "Thử lại"),
  loadMore: t("Load more", "Załaduj więcej", "Mehr laden", "Tải thêm"),
  loadingMore: t("Loading more…", "Ładowanie…", "Mehr wird geladen…", "Đang tải thêm…"),
  moreFailedTitle: t(
    "More workflows could not be loaded",
    "Nie można załadować kolejnych procesów",
    "Weitere Abläufe konnten nicht geladen werden",
    "Không thể tải thêm quy trình",
  ),
  created: t("Created", "Utworzono", "Erstellt", "Đã tạo"),
  updated: t("Last updated", "Ostatnia aktualizacja", "Zuletzt aktualisiert", "Cập nhật lần cuối"),
  uploadedByAdministrator: t(
    "Uploaded by administrator",
    "Przesłane przez administratora",
    "Vom Administrator hochgeladen",
    "Do quản trị viên tải lên",
  ),
  originalFiles: t("Original files", "Pliki źródłowe", "Originaldateien", "Tệp gốc"),
  processedFiles: t(
    "Processed files",
    "Przetworzone pliki",
    "Verarbeitete Dateien",
    "Tệp đã xử lý",
  ),
  groups: t("Groups", "Grupy", "Gruppen", "Nhóm"),
  productDrafts: t("Product drafts", "Szkice produktów", "Produktentwürfe", "Bản nháp sản phẩm"),
  notAvailable: t(
    "Not available yet",
    "Jeszcze niedostępne",
    "Noch nicht verfügbar",
    "Chưa khả dụng",
  ),
  preparing: t(
    "Preparing classifier upload",
    "Przygotowywanie przesyłania z klasyfikatorem",
    "Klassifikator-Upload wird vorbereitet",
    "Đang chuẩn bị tải lên bằng bộ phân loại",
  ),
  continueUpload: t(
    "Continue upload",
    "Kontynuuj przesyłanie",
    "Upload fortsetzen",
    "Tiếp tục tải lên",
  ),
  viewProcessing: t(
    "View processing",
    "Wyświetl przetwarzanie",
    "Verarbeitung anzeigen",
    "Xem xử lý",
  ),
  reviewGroups: t("Review groups", "Sprawdź grupy", "Gruppen prüfen", "Xem lại nhóm"),
  continueImport: t("Continue import", "Kontynuuj import", "Import fortsetzen", "Tiếp tục nhập"),
  viewImport: t("View import", "Wyświetl import", "Import anzeigen", "Xem nhập"),
  openDrafts: t("Open drafts", "Otwórz szkice", "Entwürfe öffnen", "Mở bản nháp"),
  retryPreparation: t(
    "Retry preparation",
    "Ponów przygotowanie",
    "Vorbereitung wiederholen",
    "Thử chuẩn bị lại",
  ),
  retrying: t("Retrying…", "Ponawianie…", "Wird wiederholt…", "Đang thử lại…"),
  alreadyPreparing: t(
    "Classifier upload preparation is already in progress.",
    "Przygotowywanie przesyłania z klasyfikatorem już trwa.",
    "Die Vorbereitung des Klassifikator-Uploads läuft bereits.",
    "Quá trình chuẩn bị tải lên bằng bộ phân loại đang diễn ra.",
  ),
  retryFailed: t(
    "Classifier upload preparation could not be retried.",
    "Nie można ponowić przygotowania przesyłania z klasyfikatorem.",
    "Die Vorbereitung des Klassifikator-Uploads konnte nicht wiederholt werden.",
    "Không thể thử lại việc chuẩn bị tải lên bằng bộ phân loại.",
  ),
  supportReference: t(
    "Support reference",
    "Identyfikator dla pomocy",
    "Support-Referenz",
    "Mã tham chiếu hỗ trợ",
  ),
  stageProvisioning: t("Preparing", "Przygotowywanie", "Vorbereitung", "Đang chuẩn bị"),
  stageUpload: t("Uploading", "Przesyłanie", "Upload", "Đang tải lên"),
  stageProcessing: t("Processing", "Przetwarzanie", "Verarbeitung", "Đang xử lý"),
  stageReview: t("Review", "Przegląd", "Prüfung", "Xem lại"),
  stageApproved: t("Approved", "Zatwierdzono", "Genehmigt", "Đã phê duyệt"),
  stageImporting: t(
    "Creating drafts",
    "Tworzenie szkiców",
    "Entwürfe werden erstellt",
    "Đang tạo bản nháp",
  ),
  stageReady: t("Drafts ready", "Szkice gotowe", "Entwürfe fertig", "Bản nháp sẵn sàng"),
  stageFailed: t("Needs attention", "Wymaga uwagi", "Aufmerksamkeit nötig", "Cần xử lý"),
  provisioningFailed: t(
    "Classifier upload preparation failed.",
    "Przygotowanie przesyłania z klasyfikatorem nie powiodło się.",
    "Die Vorbereitung des Klassifikator-Uploads ist fehlgeschlagen.",
    "Chuẩn bị tải lên bằng bộ phân loại không thành công.",
  ),
  processingFailed: t(
    "Image processing could not be completed.",
    "Nie udało się ukończyć przetwarzania obrazów.",
    "Die Bildverarbeitung konnte nicht abgeschlossen werden.",
    "Không thể hoàn tất xử lý ảnh.",
  ),
  importIncomplete: t(
    "Some product drafts were created, but the workflow did not complete.",
    "Utworzono niektóre szkice produktów, ale proces nie został ukończony.",
    "Einige Produktentwürfe wurden erstellt, aber der Ablauf wurde nicht abgeschlossen.",
    "Một số bản nháp sản phẩm đã được tạo nhưng quy trình chưa hoàn tất.",
  ),
  importFailed: t(
    "Product draft creation could not be completed.",
    "Nie udało się ukończyć tworzenia szkiców produktów.",
    "Die Erstellung der Produktentwürfe konnte nicht abgeschlossen werden.",
    "Không thể hoàn tất việc tạo bản nháp sản phẩm.",
  ),
  unexpectedFailure: t(
    "This classifier workflow encountered an unexpected problem.",
    "W tym procesie klasyfikatora wystąpił nieoczekiwany problem.",
    "Bei diesem Klassifikator-Ablauf ist ein unerwartetes Problem aufgetreten.",
    "Quy trình phân loại này gặp sự cố không mong muốn.",
  ),
};

export type SellerClassifierHistoryClient = {
  list(request: SellerClassifierHistoryRequest): Promise<SellerClassifierHistoryPage>;
  retryProvisioning(workflowId: string): Promise<SellerClassifierBatchSnapshot>;
};

type ReadError = {
  message: string;
  retryable: boolean;
};

export function SellerClassifierHistoryScreen() {
  const lang = useLang();
  const navigate = useNavigate();
  const list = useServerFn(listMyClassifierBatches);
  const retryProvisioning = useServerFn(retryMyClassifierBatchProvisioning);
  const client = useMemo<SellerClassifierHistoryClient>(
    () => ({
      list: (request) => list({ data: request }),
      retryProvisioning: (workflowId) => retryProvisioning({ data: { workflowId } }),
    }),
    [list, retryProvisioning],
  );

  return (
    <SellerClassifierHistoryScreenView
      lang={lang}
      client={client}
      onOpen={(workflowId, action) =>
        void navigate({
          to: actionRoute(action),
          params: { workflowId },
          search: { lang },
        })
      }
    />
  );
}

export function SellerClassifierHistoryScreenView({
  lang,
  client,
  onOpen,
}: {
  lang: Lang;
  client: SellerClassifierHistoryClient;
  onOpen(
    workflowId: string,
    action: Exclude<SellerClassifierHistoryPrimaryAction, "none" | "retry_provisioning">,
  ): void;
}) {
  const [page, setPage] = useState<SellerClassifierHistoryPage | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [readError, setReadError] = useState<ReadError | null>(null);
  const [moreError, setMoreError] = useState(false);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [actionMessages, setActionMessages] = useState<Map<string, string>>(new Map());
  const mounted = useRef(true);
  const pageRef = useRef<SellerClassifierHistoryPage | null>(null);
  const firstRead = useRef<Promise<SellerClassifierHistoryPage | null> | null>(null);
  const moreRead = useRef<Promise<void> | null>(null);
  const retrying = useRef(new Set<string>());

  const loadFirst = useCallback(() => {
    if (firstRead.current) return firstRead.current;
    if (pageRef.current) setRefreshing(true);
    const request = client
      .list({ cursor: null, limit: SELLER_CLASSIFIER_HISTORY_DEFAULT_LIMIT })
      .then((next) => {
        if (!mounted.current) return next;
        pageRef.current = next;
        setPage(next);
        setReadError(null);
        setMoreError(false);
        return next;
      })
      .catch((error: unknown) => {
        if (mounted.current) setReadError(historyReadError(error));
        return null;
      })
      .finally(() => {
        if (firstRead.current === request) firstRead.current = null;
        if (mounted.current) {
          setInitialLoading(false);
          setRefreshing(false);
        }
      });
    firstRead.current = request;
    return request;
  }, [client]);

  useEffect(() => {
    mounted.current = true;
    void loadFirst();
    return () => {
      mounted.current = false;
    };
  }, [loadFirst]);

  const loadMore = useCallback(() => {
    if (moreRead.current || !page?.nextCursor) return moreRead.current ?? Promise.resolve();
    setLoadingMore(true);
    setMoreError(false);
    const expectedCursor = page.nextCursor;
    const request = client
      .list({
        cursor: expectedCursor,
        limit: SELLER_CLASSIFIER_HISTORY_DEFAULT_LIMIT,
      })
      .then((next) => {
        if (!mounted.current) return;
        setPage((current) => {
          if (!current || current.nextCursor !== expectedCursor) return current;
          const combined = {
            workflows: appendUnique(current.workflows, next.workflows),
            nextCursor: next.nextCursor,
          };
          pageRef.current = combined;
          return combined;
        });
      })
      .catch(() => {
        if (mounted.current) setMoreError(true);
      })
      .finally(() => {
        if (moreRead.current === request) moreRead.current = null;
        if (mounted.current) setLoadingMore(false);
      });
    moreRead.current = request;
    return request;
  }, [client, page]);

  async function retryPreparation(item: SellerClassifierHistoryItem) {
    if (retrying.current.has(item.workflowId)) return;
    retrying.current.add(item.workflowId);
    setRetryingIds(new Set(retrying.current));
    setActionMessages((current) => withoutKey(current, item.workflowId));
    try {
      const snapshot = await client.retryProvisioning(item.workflowId);
      if (!mounted.current) return;
      if (snapshot.provisioningStatus === "ready") {
        onOpen(item.workflowId, "open_upload");
        return;
      }
      setPage((current) => {
        if (!current) return current;
        const updated = {
          ...current,
          workflows: current.workflows.map((workflow) =>
            workflow.workflowId === item.workflowId
              ? applyProvisioningSnapshot(workflow, snapshot)
              : workflow,
          ),
        };
        pageRef.current = updated;
        return updated;
      });
    } catch (error) {
      if (!mounted.current) return;
      if (errorCode(error) === "seller_classifier_batch_provisioning_in_progress") {
        await loadFirst();
        if (mounted.current) {
          setActionMessages((current) =>
            new Map(current).set(item.workflowId, tr(S.alreadyPreparing)),
          );
        }
      } else {
        setActionMessages((current) => new Map(current).set(item.workflowId, tr(S.retryFailed)));
      }
    } finally {
      retrying.current.delete(item.workflowId);
      if (mounted.current) setRetryingIds(new Set(retrying.current));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">{tr(S.title)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tr(S.description)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={refreshing}
            onClick={() => void loadFirst()}
          >
            {refreshing ? tr(S.refreshing) : tr(S.refresh)}
          </Button>
          <a
            href={localizedHref("/seller/classifier-batches/new", lang)}
            className="inline-flex h-9 items-center justify-center bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {tr(S.newUpload)}
          </a>
        </div>
      </header>

      {initialLoading ? (
        <p className="text-sm text-muted-foreground">{tr(S.loading)}</p>
      ) : readError && !page ? (
        <Alert variant="destructive">
          <AlertTitle>{tr(S.unavailableTitle)}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{readError.message}</p>
            {readError.retryable ? (
              <Button type="button" variant="outline" onClick={() => void loadFirst()}>
                {tr(S.tryAgain)}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : page?.workflows.length ? (
        <>
          {readError ? (
            <Alert variant="destructive">
              <AlertTitle>{tr(S.unavailableTitle)}</AlertTitle>
              <AlertDescription>{readError.message}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4">
            {page.workflows.map((item) => (
              <HistoryCard
                key={item.workflowId}
                item={item}
                lang={lang}
                retrying={retryingIds.has(item.workflowId)}
                actionMessage={actionMessages.get(item.workflowId) ?? null}
                onRetry={() => void retryPreparation(item)}
                onOpen={(action) => onOpen(item.workflowId, action)}
              />
            ))}
          </div>
          {moreError ? (
            <Alert variant="destructive">
              <AlertTitle>{tr(S.moreFailedTitle)}</AlertTitle>
              <AlertDescription>
                <Button
                  type="button"
                  variant="outline"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {tr(S.tryAgain)}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {page.nextCursor ? (
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? tr(S.loadingMore) : tr(S.loadMore)}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{tr(S.emptyTitle)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{tr(S.emptyDescription)}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HistoryCard({
  item,
  lang,
  retrying,
  actionMessage,
  onRetry,
  onOpen,
}: {
  item: SellerClassifierHistoryItem;
  lang: Lang;
  retrying: boolean;
  actionMessage: string | null;
  onRetry(): void;
  onOpen(
    action: Exclude<SellerClassifierHistoryPrimaryAction, "none" | "retry_provisioning">,
  ): void;
}) {
  const safeError = item.errorSummaryCode ? errorSummaryLabel(item.errorSummaryCode) : null;
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">{formatDate(item.createdAt, lang)}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {item.initiatorKind === "administrator" ? (
              <Badge variant="outline">{tr(S.uploadedByAdministrator)}</Badge>
            ) : null}
            <Badge variant={item.stage === "failed" ? "destructive" : "secondary"}>
              {stageLabel(item.stage)}
            </Badge>
          </div>
        </div>
        <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <Definition label={tr(S.created)} value={formatDateTime(item.createdAt, lang)} />
          <Definition label={tr(S.updated)} value={formatDateTime(item.updatedAt, lang)} />
        </dl>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Definition label={tr(S.originalFiles)} value={countLabel(item.counts.originalFiles)} />
          <Definition label={tr(S.processedFiles)} value={countLabel(item.counts.processedFiles)} />
          <Definition label={tr(S.groups)} value={countLabel(item.counts.groups)} />
          <Definition label={tr(S.productDrafts)} value={countLabel(item.counts.productDrafts)} />
        </dl>

        {item.stage === "provisioning" ? (
          <p className="text-sm text-muted-foreground">{tr(S.preparing)}</p>
        ) : null}
        {safeError ? (
          <Alert variant="destructive">
            <AlertDescription>{safeError}</AlertDescription>
          </Alert>
        ) : null}
        {item.supportReference ? (
          <p className="break-all text-xs text-muted-foreground">
            {tr(S.supportReference)}: {item.supportReference}
          </p>
        ) : null}
        {actionMessage ? <p className="text-sm text-destructive">{actionMessage}</p> : null}

        {item.primaryAction === "retry_provisioning" ? (
          <Button type="button" disabled={retrying} onClick={onRetry}>
            {retrying ? tr(S.retrying) : tr(S.retryPreparation)}
          </Button>
        ) : isOpenAction(item.primaryAction) ? (
          <Button type="button" onClick={() => openHistoryItem(item, onOpen)}>
            {actionLabel(item)}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Definition({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

function appendUnique(
  current: SellerClassifierHistoryItem[],
  next: SellerClassifierHistoryItem[],
): SellerClassifierHistoryItem[] {
  const seen = new Set(current.map((item) => item.workflowId));
  return [...current, ...next.filter((item) => !seen.has(item.workflowId))];
}

function applyProvisioningSnapshot(
  item: SellerClassifierHistoryItem,
  snapshot: SellerClassifierBatchSnapshot,
): SellerClassifierHistoryItem {
  return {
    ...item,
    updatedAt: snapshot.updatedAt,
    stage: snapshot.stage,
    errorSummaryCode: snapshot.stage === "failed" ? "provisioning_failed" : null,
    supportReference:
      snapshot.stage === "failed" && !snapshot.retryAllowed ? snapshot.workflowId : null,
    primaryAction:
      snapshot.provisioningStatus === "failed" && snapshot.retryAllowed
        ? "retry_provisioning"
        : "none",
  };
}

function withoutKey(map: Map<string, string>, key: string): Map<string, string> {
  const next = new Map(map);
  next.delete(key);
  return next;
}

function errorCode(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}

function historyReadError(error: unknown): ReadError {
  if (errorCode(error) === "seller_not_found") {
    return { message: tr(S.sellerMissing), retryable: false };
  }
  return { message: tr(S.unavailable), retryable: true };
}

function countLabel(value: number | null): string {
  return value === null ? tr(S.notAvailable) : String(value);
}

function stageLabel(stage: SellerClassifierHistoryItem["stage"]): string {
  switch (stage) {
    case "provisioning":
      return tr(S.stageProvisioning);
    case "upload":
      return tr(S.stageUpload);
    case "processing":
      return tr(S.stageProcessing);
    case "review":
      return tr(S.stageReview);
    case "approved":
      return tr(S.stageApproved);
    case "importing":
      return tr(S.stageImporting);
    case "drafts_ready":
      return tr(S.stageReady);
    case "failed":
      return tr(S.stageFailed);
  }
}

function errorSummaryLabel(code: SellerClassifierHistoryErrorSummaryCode): string {
  switch (code) {
    case "provisioning_failed":
      return tr(S.provisioningFailed);
    case "processing_failed":
      return tr(S.processingFailed);
    case "import_incomplete":
      return tr(S.importIncomplete);
    case "import_failed":
      return tr(S.importFailed);
    case "unexpected_failure":
      return tr(S.unexpectedFailure);
  }
}

function actionLabel(item: SellerClassifierHistoryItem): string {
  switch (item.primaryAction) {
    case "open_upload":
      return tr(S.continueUpload);
    case "open_processing":
      return tr(S.viewProcessing);
    case "open_review":
      return tr(S.reviewGroups);
    case "open_import":
      if (item.stage === "approved") return tr(S.continueImport);
      if (item.stage === "drafts_ready") return tr(S.openDrafts);
      return tr(S.viewImport);
    case "none":
    case "retry_provisioning":
      return "";
  }
}

function isOpenAction(
  action: SellerClassifierHistoryPrimaryAction,
): action is Exclude<SellerClassifierHistoryPrimaryAction, "none" | "retry_provisioning"> {
  return action !== "none" && action !== "retry_provisioning";
}

function openHistoryItem(
  item: SellerClassifierHistoryItem,
  onOpen: (
    action: Exclude<SellerClassifierHistoryPrimaryAction, "none" | "retry_provisioning">,
  ) => void,
): void {
  if (isOpenAction(item.primaryAction)) onOpen(item.primaryAction);
}

function actionRoute(
  action: Exclude<SellerClassifierHistoryPrimaryAction, "none" | "retry_provisioning">,
):
  | "/seller/classifier-batches/$workflowId/upload"
  | "/seller/classifier-batches/$workflowId/processing"
  | "/seller/classifier-batches/$workflowId/review"
  | "/seller/classifier-batches/$workflowId/import" {
  switch (action) {
    case "open_upload":
      return "/seller/classifier-batches/$workflowId/upload";
    case "open_processing":
      return "/seller/classifier-batches/$workflowId/processing";
    case "open_review":
      return "/seller/classifier-batches/$workflowId/review";
    case "open_import":
      return "/seller/classifier-batches/$workflowId/import";
  }
}

function formatDate(value: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function locale(lang: Lang): string {
  return { EN: "en", PL: "pl", DE: "de", VI: "vi" }[lang];
}

function localizedHref(path: string, lang: Lang): string {
  return `${path}?${new URLSearchParams({ lang }).toString()}`;
}
