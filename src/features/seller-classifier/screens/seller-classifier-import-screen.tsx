import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { t, tr, type Lang } from "@/lib/i18n";

import {
  approveMyClassifierBatchAndCreateDrafts,
  getMyClassifierDraftImport,
  retryMyClassifierDraftImport,
} from "../seller-classifier-import.functions";
import { SELLER_CLASSIFIER_GROUPS_NOT_APPROVED_NOTICE } from "../seller-classifier-import.navigation";
import type {
  SellerClassifierDraftImportSnapshot,
  SellerClassifierDraftImportStage,
  SellerClassifierDraftImportStatus,
  SellerClassifierProductDraftImageStatus,
} from "../seller-classifier-import.types";

const POLL_INTERVAL_MS = 2_000;

const S = {
  title: t(
    "Creating product drafts",
    "Tworzenie szkiców produktów",
    "Produktentwürfe werden erstellt",
    "Đang tạo bản nháp sản phẩm",
  ),
  description: t(
    "Your approved groups are being converted into product drafts. You can leave this page and return later.",
    "Zatwierdzone grupy są przekształcane w szkice produktów. Możesz opuścić tę stronę i wrócić później.",
    "Ihre genehmigten Gruppen werden in Produktentwürfe umgewandelt. Sie können diese Seite verlassen und später zurückkehren.",
    "Các nhóm đã phê duyệt đang được chuyển thành bản nháp sản phẩm. Bạn có thể rời trang và quay lại sau.",
  ),
  loading: t(
    "Loading draft creation progress…",
    "Ładowanie postępu tworzenia szkiców…",
    "Fortschritt der Entwurfserstellung wird geladen…",
    "Đang tải tiến trình tạo bản nháp…",
  ),
  unavailableTitle: t(
    "Draft creation progress could not be loaded",
    "Nie można załadować postępu tworzenia szkiców",
    "Der Fortschritt der Entwurfserstellung konnte nicht geladen werden",
    "Không thể tải tiến trình tạo bản nháp",
  ),
  unavailable: t(
    "Product draft creation is temporarily unavailable.",
    "Tworzenie szkiców produktów jest tymczasowo niedostępne.",
    "Die Erstellung von Produktentwürfen ist vorübergehend nicht verfügbar.",
    "Tính năng tạo bản nháp sản phẩm tạm thời không khả dụng.",
  ),
  notFound: t(
    "This classifier workflow was not found.",
    "Nie znaleziono tego procesu klasyfikatora.",
    "Dieser Klassifikator-Ablauf wurde nicht gefunden.",
    "Không tìm thấy quy trình phân loại này.",
  ),
  setupError: t(
    "Product draft creation is not configured.",
    "Tworzenie szkiców produktów nie jest skonfigurowane.",
    "Die Erstellung von Produktentwürfen ist nicht konfiguriert.",
    "Tính năng tạo bản nháp sản phẩm chưa được cấu hình.",
  ),
  administratorRequired: t(
    "Administrator access is required for this workflow.",
    "Ten proces wymaga dostępu administratora.",
    "Für diesen Ablauf ist Administratorzugriff erforderlich.",
    "Quy trình này yêu cầu quyền quản trị viên.",
  ),
  invalid: t(
    "The draft creation request is invalid.",
    "Żądanie utworzenia szkiców jest nieprawidłowe.",
    "Die Anfrage zur Entwurfserstellung ist ungültig.",
    "Yêu cầu tạo bản nháp không hợp lệ.",
  ),
  tryAgain: t("Try again", "Spróbuj ponownie", "Erneut versuchen", "Thử lại"),
  stage: t("Workflow stage", "Etap procesu", "Ablaufstatus", "Giai đoạn quy trình"),
  importStatus: t("Import status", "Status importu", "Importstatus", "Trạng thái nhập"),
  pendingGroups: t("Pending", "Oczekujące", "Ausstehend", "Đang chờ"),
  processingGroups: t("Processing", "Przetwarzane", "In Bearbeitung", "Đang xử lý"),
  completeGroups: t("Complete", "Ukończone", "Abgeschlossen", "Hoàn tất"),
  failedGroups: t("Failed", "Nieudane", "Fehlgeschlagen", "Thất bại"),
  drafts: t("Product drafts", "Szkice produktów", "Produktentwürfe", "Bản nháp sản phẩm"),
  noDrafts: t(
    "Product drafts will appear here as groups are completed.",
    "Szkice produktów pojawią się tutaj po ukończeniu grup.",
    "Produktentwürfe erscheinen hier, sobald Gruppen abgeschlossen sind.",
    "Bản nháp sản phẩm sẽ xuất hiện tại đây khi các nhóm hoàn tất.",
  ),
  noDraftsCreated: t(
    "No product drafts were created.",
    "Nie utworzono żadnych szkiców produktów.",
    "Es wurden keine Produktentwürfe erstellt.",
    "Không có bản nháp sản phẩm nào được tạo.",
  ),
  untitledDraft: t(
    "Untitled product draft",
    "Szkic produktu bez tytułu",
    "Unbenannter Produktentwurf",
    "Bản nháp sản phẩm chưa có tên",
  ),
  openDraft: t("Open draft", "Otwórz szkic", "Entwurf öffnen", "Mở bản nháp"),
  editDraft: t("Edit draft", "Edytuj szkic", "Entwurf bearbeiten", "Chỉnh sửa bản nháp"),
  openProduct: t("Open product", "Otwórz produkt", "Produkt öffnen", "Mở sản phẩm"),
  productDraftId: t(
    "Product draft identifier",
    "Identyfikator szkicu produktu",
    "Produktentwurf-ID",
    "Mã bản nháp sản phẩm",
  ),
  category: t("Category", "Kategoria", "Kategorie", "Danh mục"),
  categoryNotSet: t(
    "Category not set",
    "Kategoria nieustawiona",
    "Kategorie nicht festgelegt",
    "Chưa đặt danh mục",
  ),
  productCode: t("Product code", "Kod produktu", "Produktcode", "Mã sản phẩm"),
  assignedWhenPublishing: t(
    "Assigned when publishing",
    "Przypisywany przy publikacji",
    "Wird bei Veröffentlichung zugewiesen",
    "Được gán khi xuất bản",
  ),
  readOnlyOutcome: t(
    "This outcome is read-only in the delegated workflow.",
    "Ten wynik jest tylko do odczytu w procesie delegowanym.",
    "Dieses Ergebnis ist im delegierten Ablauf schreibgeschützt.",
    "Kết quả này chỉ có thể xem trong quy trình được ủy quyền.",
  ),
  continueImport: t("Continue import", "Kontynuuj import", "Import fortsetzen", "Tiếp tục nhập"),
  retryImport: t("Retry import", "Ponów import", "Import wiederholen", "Thử nhập lại"),
  actionRunning: t(
    "Updating product draft creation…",
    "Aktualizowanie tworzenia szkiców produktów…",
    "Produktentwurfserstellung wird aktualisiert…",
    "Đang cập nhật việc tạo bản nháp sản phẩm…",
  ),
  stateChanged: t(
    "The import state changed. The latest progress is shown.",
    "Stan importu uległ zmianie. Wyświetlono najnowszy postęp.",
    "Der Importstatus hat sich geändert. Der aktuelle Fortschritt wird angezeigt.",
    "Trạng thái nhập đã thay đổi. Tiến trình mới nhất được hiển thị.",
  ),
  ownershipConflict: t(
    "This batch cannot be imported for the current store. Contact support.",
    "Nie można zaimportować tej partii do bieżącego sklepu. Skontaktuj się z pomocą techniczną.",
    "Dieser Stapel kann nicht für den aktuellen Shop importiert werden. Wenden Sie sich an den Support.",
    "Không thể nhập lô này cho cửa hàng hiện tại. Hãy liên hệ bộ phận hỗ trợ.",
  ),
  partialSuccess: t(
    "Some product drafts are ready, but one or more groups still need attention.",
    "Niektóre szkice produktów są gotowe, ale co najmniej jedna grupa nadal wymaga uwagi.",
    "Einige Produktentwürfe sind fertig, aber mindestens eine Gruppe benötigt noch Aufmerksamkeit.",
    "Một số bản nháp sản phẩm đã sẵn sàng, nhưng vẫn có nhóm cần được xử lý.",
  ),
  ready: t(
    "Product drafts are ready",
    "Szkice produktów są gotowe",
    "Produktentwürfe sind fertig",
    "Bản nháp sản phẩm đã sẵn sàng",
  ),
  readyDescription: t(
    "Open each draft to review its facts, title, description, and publication settings.",
    "Otwórz każdy szkic, aby sprawdzić fakty, tytuł, opis i ustawienia publikacji.",
    "Öffnen Sie jeden Entwurf, um Fakten, Titel, Beschreibung und Veröffentlichungseinstellungen zu prüfen.",
    "Mở từng bản nháp để xem thông tin, tiêu đề, mô tả và cài đặt xuất bản.",
  ),
  incomplete: t(
    "Some product drafts were created, but one or more groups could not be completed.",
    "Utworzono niektóre szkice produktów, ale co najmniej jednej grupy nie udało się ukończyć.",
    "Einige Produktentwürfe wurden erstellt, aber mindestens eine Gruppe konnte nicht abgeschlossen werden.",
    "Một số bản nháp sản phẩm đã được tạo, nhưng có nhóm không thể hoàn tất.",
  ),
  failed: t(
    "Product draft creation could not be completed.",
    "Nie udało się ukończyć tworzenia szkiców produktów.",
    "Die Erstellung der Produktentwürfe konnte nicht abgeschlossen werden.",
    "Không thể hoàn tất việc tạo bản nháp sản phẩm.",
  ),
  unexpectedFailure: t(
    "Product draft creation encountered an unexpected problem.",
    "Podczas tworzenia szkiców produktów wystąpił nieoczekiwany problem.",
    "Bei der Erstellung der Produktentwürfe ist ein unerwartetes Problem aufgetreten.",
    "Đã xảy ra sự cố không mong muốn khi tạo bản nháp sản phẩm.",
  ),
  transitionMismatch: t(
    "Draft creation completed, but its final workflow state is temporarily unavailable.",
    "Tworzenie szkiców zakończyło się, ale końcowy stan procesu jest tymczasowo niedostępny.",
    "Die Entwurfserstellung ist abgeschlossen, aber der endgültige Ablaufstatus ist vorübergehend nicht verfügbar.",
    "Việc tạo bản nháp đã hoàn tất nhưng trạng thái quy trình cuối cùng tạm thời chưa khả dụng.",
  ),
  stageApproved: t("Approved", "Zatwierdzono", "Genehmigt", "Đã phê duyệt"),
  stageImporting: t(
    "Creating drafts",
    "Tworzenie szkiców",
    "Entwürfe werden erstellt",
    "Đang tạo bản nháp",
  ),
  stageReady: t("Drafts ready", "Szkice gotowe", "Entwürfe fertig", "Bản nháp sẵn sàng"),
  stageFailed: t("Needs attention", "Wymaga uwagi", "Aufmerksamkeit nötig", "Cần xử lý"),
  statusNotStarted: t("Not started", "Nie rozpoczęto", "Nicht gestartet", "Chưa bắt đầu"),
  statusPending: t("Pending", "Oczekuje", "Ausstehend", "Đang chờ"),
  statusRunning: t("Running", "W toku", "Läuft", "Đang chạy"),
  statusCompleted: t("Completed", "Ukończono", "Abgeschlossen", "Hoàn tất"),
  statusPartial: t(
    "Completed with errors",
    "Ukończono z błędami",
    "Mit Fehlern abgeschlossen",
    "Hoàn tất có lỗi",
  ),
  statusFailed: t("Failed", "Nieudany", "Fehlgeschlagen", "Thất bại"),
  productDraftStatus: t(
    "Product status",
    "Status produktu",
    "Produktstatus",
    "Trạng thái sản phẩm",
  ),
  imageStatus: t("Image status", "Status obrazów", "Bildstatus", "Trạng thái ảnh"),
  productDraft: t("Draft", "Szkic", "Entwurf", "Bản nháp"),
  productPublished: t("Published", "Opublikowano", "Veröffentlicht", "Đã xuất bản"),
  productArchived: t("Archived", "Zarchiwizowano", "Archiviert", "Đã lưu trữ"),
  imagesPending: t("Images pending", "Obrazy oczekują", "Bilder ausstehend", "Ảnh đang chờ"),
  imagesAvailable: t("Images available", "Obrazy dostępne", "Bilder verfügbar", "Ảnh khả dụng"),
  imagesPartial: t(
    "Some images unavailable",
    "Niektóre obrazy są niedostępne",
    "Einige Bilder sind nicht verfügbar",
    "Một số ảnh không khả dụng",
  ),
  imagesFailed: t(
    "Images unavailable",
    "Obrazy niedostępne",
    "Bilder nicht verfügbar",
    "Ảnh không khả dụng",
  ),
  actionInProgress: t(
    "This action is already being reconciled. Try again to check its result.",
    "Ta czynność jest już uzgadniana. Spróbuj ponownie, aby sprawdzić wynik.",
    "Diese Aktion wird bereits abgeglichen. Versuchen Sie es erneut, um das Ergebnis zu prüfen.",
    "Thao tác này đang được đối soát. Hãy thử lại để kiểm tra kết quả.",
  ),
  actionConflict: t(
    "This saved request belongs to a different action. Review the current action before submitting it again.",
    "Zapisane żądanie dotyczy innej czynności. Sprawdź bieżącą czynność przed ponownym wysłaniem.",
    "Diese gespeicherte Anfrage gehört zu einer anderen Aktion. Prüfen Sie die aktuelle Aktion vor dem erneuten Absenden.",
    "Yêu cầu đã lưu thuộc về một thao tác khác. Hãy kiểm tra thao tác hiện tại trước khi gửi lại.",
  ),
  submitNewAction: t(
    "Submit as a new action",
    "Wyślij jako nową czynność",
    "Als neue Aktion senden",
    "Gửi dưới dạng thao tác mới",
  ),
};

export type ClassifierImportActionSubmissionOptions = {
  newRequest?: boolean;
};

export type SellerClassifierImportClient = {
  getImport(workflowId: string): Promise<SellerClassifierDraftImportSnapshot>;
  continueImport(
    workflowId: string,
    options?: ClassifierImportActionSubmissionOptions,
  ): Promise<SellerClassifierDraftImportSnapshot>;
  retryImport(
    workflowId: string,
    options?: ClassifierImportActionSubmissionOptions,
  ): Promise<SellerClassifierDraftImportSnapshot>;
};

type PageError = {
  message: string;
  retryable: boolean;
};

type MutationAction = "continue" | "retry";

export type SellerClassifierImportLabels = {
  title: string;
  description: string;
  continueImport: string;
  retryImport: string;
};

export function SellerClassifierImportScreen({
  workflowId,
  lang,
}: {
  workflowId: string;
  lang: Lang;
}) {
  const navigate = useNavigate();
  const getImport = useServerFn(getMyClassifierDraftImport);
  const continueImport = useServerFn(approveMyClassifierBatchAndCreateDrafts);
  const retryImport = useServerFn(retryMyClassifierDraftImport);
  const client = useMemo<SellerClassifierImportClient>(
    () => ({
      getImport: (id) => getImport({ data: { workflowId: id } }),
      continueImport: (id) => continueImport({ data: { workflowId: id } }),
      retryImport: (id) => retryImport({ data: { workflowId: id } }),
    }),
    [continueImport, getImport, retryImport],
  );

  return (
    <SellerClassifierImportScreenView
      workflowId={workflowId}
      lang={lang}
      client={client}
      onReviewRequired={() =>
        void navigate({
          to: "/seller/classifier-batches/$workflowId/review",
          params: { workflowId },
          search: {
            lang,
            notice: SELLER_CLASSIFIER_GROUPS_NOT_APPROVED_NOTICE,
          },
        })
      }
    />
  );
}

export function SellerClassifierImportScreenView({
  workflowId,
  lang,
  client,
  onReviewRequired = () => {},
  pollIntervalMs = POLL_INTERVAL_MS,
  productDraftHref = sellerProductDraftHref,
  showProductDraftId = false,
  labels,
}: {
  workflowId: string;
  lang: Lang;
  client: SellerClassifierImportClient;
  onReviewRequired?: () => void;
  pollIntervalMs?: number;
  productDraftHref?: ((productDraftId: string, lang: Lang) => string | null) | null;
  showProductDraftId?: boolean;
  labels?: Partial<SellerClassifierImportLabels>;
}) {
  const [snapshot, setSnapshot] = useState<SellerClassifierDraftImportSnapshot | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<PageError | null>(null);
  const [mutationAction, setMutationAction] = useState<MutationAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [conflictAction, setConflictAction] = useState<MutationAction | null>(null);
  const mounted = useRef(true);
  const readInFlight = useRef<Promise<SellerClassifierDraftImportSnapshot | null> | null>(null);
  const completionConfirmationAttempted = useRef(false);
  const statusHeadingFocused = useRef(false);
  const statusHeading = useRef<HTMLHeadingElement>(null);

  const readSnapshot = useCallback(() => {
    if (readInFlight.current) return readInFlight.current;
    setIsReading(true);
    const request = client
      .getImport(workflowId)
      .then((next) => {
        if (!mounted.current) return next;
        setSnapshot(next);
        setReadError(null);
        return next;
      })
      .catch((error: unknown) => {
        if (mounted.current) setReadError(importPageError(error));
        return null;
      })
      .finally(() => {
        if (readInFlight.current === request) readInFlight.current = null;
        if (mounted.current) {
          setInitialLoading(false);
          setIsReading(false);
        }
      });
    readInFlight.current = request;
    return request;
  }, [client, workflowId]);

  useEffect(() => {
    mounted.current = true;
    void readSnapshot();
    return () => {
      mounted.current = false;
    };
  }, [readSnapshot]);

  useEffect(() => {
    if (!snapshot || statusHeadingFocused.current) return;
    statusHeadingFocused.current = true;
    statusHeading.current?.focus();
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot || readError || isReading || mutationAction || !shouldPoll(snapshot)) return;
    if (document.hidden) return;
    const timeout = window.setTimeout(() => void readSnapshot(), pollIntervalMs);
    return () => window.clearTimeout(timeout);
  }, [isReading, mutationAction, pollIntervalMs, readError, readSnapshot, snapshot]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (
        !document.hidden &&
        snapshot &&
        !readError &&
        !isReading &&
        !mutationAction &&
        shouldPoll(snapshot)
      ) {
        void readSnapshot();
      }
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [isReading, mutationAction, readError, readSnapshot, snapshot]);

  useEffect(() => {
    const mismatch = snapshot?.importStatus === "completed" && snapshot.stage !== "drafts_ready";
    if (!mismatch) {
      completionConfirmationAttempted.current = false;
      return;
    }
    if (isReading || readError) return;
    if (!completionConfirmationAttempted.current) {
      completionConfirmationAttempted.current = true;
      void readSnapshot().then((next) => {
        if (mounted.current && hasCompletionMismatch(next)) {
          setReadError({ message: tr(S.transitionMismatch), retryable: true });
        }
      });
    }
  }, [isReading, readError, readSnapshot, snapshot]);

  const retryRead = useCallback(async () => {
    if (mutationAction) return;
    const next = await readSnapshot();
    if (mounted.current && hasCompletionMismatch(next)) {
      setReadError({ message: tr(S.transitionMismatch), retryable: true });
    }
  }, [mutationAction, readSnapshot]);

  const runMutation = useCallback(
    async (action: MutationAction, newRequest = false) => {
      if (mutationAction || isReading) return;
      setMutationAction(action);
      setActionError(null);
      setActionSuccess(null);
      setConflictAction(null);
      try {
        const next =
          action === "continue"
            ? newRequest
              ? await client.continueImport(workflowId, { newRequest: true })
              : await client.continueImport(workflowId)
            : newRequest
              ? await client.retryImport(workflowId, { newRequest: true })
              : await client.retryImport(workflowId);
        setSnapshot(next);
        setReadError(null);
      } catch (error) {
        const code = importErrorCode(error);
        if (
          action === "continue" &&
          (code === "seller_classifier_groups_not_approved" ||
            code === "delegated_review_not_allowed")
        ) {
          onReviewRequired();
        } else if (
          code === "seller_classifier_batch_not_found" ||
          code === "delegated_upload_workflow_not_found"
        ) {
          setReadError({ message: tr(S.notFound), retryable: false });
        } else if (
          code === "seller_classifier_import_retry_not_allowed" ||
          code === "delegated_import_retry_not_allowed"
        ) {
          await readSnapshot();
          setActionSuccess(tr(S.stateChanged));
        } else if (code === "delegated_action_request_conflict") {
          setActionError(tr(S.actionConflict));
          setConflictAction(action);
        } else {
          setActionError(importActionError(error));
        }
      } finally {
        if (mounted.current) setMutationAction(null);
      }
    },
    [client, isReading, mutationAction, onReviewRequired, readSnapshot, workflowId],
  );

  if (initialLoading && !snapshot) {
    return (
      <p className="py-8 text-sm text-muted-foreground" aria-live="polite">
        {tr(S.loading)}
      </p>
    );
  }

  if (!snapshot) {
    const error = readError ?? { message: tr(S.unavailable), retryable: true };
    return (
      <Alert variant="destructive">
        <AlertTitle>{tr(S.unavailableTitle)}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{error.message}</p>
          {error.retryable ? (
            <Button
              type="button"
              variant="outline"
              disabled={isReading || mutationAction !== null}
              onClick={retryRead}
            >
              {tr(S.tryAgain)}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  const controlsDisabled = mutationAction !== null || isReading;
  const partialSuccess = snapshot.productDrafts.length > 0 && snapshot.failedGroupCount > 0;
  const durableError = durableErrorMessage(snapshot.errorCode, snapshot.productDrafts.length);
  const terminalWithoutDrafts =
    snapshot.productDrafts.length === 0 &&
    (snapshot.stage === "failed" ||
      snapshot.importStatus === "completed_with_errors" ||
      snapshot.importStatus === "failed");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1
                ref={statusHeading}
                tabIndex={-1}
                className="font-display text-2xl font-semibold tracking-tight outline-none"
              >
                {labels?.title ?? tr(S.title)}
              </h1>
              <CardDescription className="mt-2">
                {labels?.description ?? tr(S.description)}
              </CardDescription>
            </div>
            <Badge variant={snapshot.stage === "drafts_ready" ? "default" : "outline"}>
              {stageLabel(snapshot.stage)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Definition label={tr(S.stage)} value={stageLabel(snapshot.stage)} />
            <Definition
              label={tr(S.importStatus)}
              value={importStatusLabel(snapshot.importStatus)}
            />
          </dl>
          <p className="sr-only" aria-live="polite">
            {tr(S.stage)}: {stageLabel(snapshot.stage)}. {tr(S.importStatus)}:{" "}
            {importStatusLabel(snapshot.importStatus)}.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-live="polite">
            <CountCard label={tr(S.pendingGroups)} count={snapshot.pendingGroupCount} />
            <CountCard label={tr(S.processingGroups)} count={snapshot.processingGroupCount} />
            <CountCard label={tr(S.completeGroups)} count={snapshot.completeGroupCount} />
            <CountCard label={tr(S.failedGroups)} count={snapshot.failedGroupCount} />
          </div>
        </CardContent>
      </Card>

      {readError ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>{tr(S.unavailableTitle)}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{readError.message}</p>
            {readError.retryable ? (
              <Button
                type="button"
                variant="outline"
                disabled={isReading || mutationAction !== null}
                onClick={retryRead}
              >
                {tr(S.tryAgain)}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {mutationAction ? (
        <Alert aria-live="polite">
          <AlertDescription>{tr(S.actionRunning)}</AlertDescription>
        </Alert>
      ) : null}
      {actionError ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>{tr(S.unavailableTitle)}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{actionError}</p>
            {conflictAction ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void runMutation(conflictAction, true)}
              >
                {tr(S.submitNewAction)}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {actionSuccess ? (
        <Alert role="status">
          <AlertDescription>{actionSuccess}</AlertDescription>
        </Alert>
      ) : null}
      {durableError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{durableError}</AlertDescription>
        </Alert>
      ) : null}
      {partialSuccess ? (
        <Alert>
          <AlertDescription>{tr(S.partialSuccess)}</AlertDescription>
        </Alert>
      ) : null}
      {snapshot.stage === "drafts_ready" ? (
        <Alert>
          <AlertTitle>{tr(S.ready)}</AlertTitle>
          <AlertDescription>{tr(S.readyDescription)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {snapshot.continuationAllowed ? (
          <Button
            type="button"
            disabled={controlsDisabled}
            onClick={() => void runMutation("continue")}
          >
            {labels?.continueImport ?? tr(S.continueImport)}
          </Button>
        ) : null}
        {snapshot.retryAllowed ? (
          <Button
            type="button"
            disabled={controlsDisabled}
            onClick={() => void runMutation("retry")}
          >
            {labels?.retryImport ?? tr(S.retryImport)}
          </Button>
        ) : null}
      </div>

      <section className="space-y-4" aria-labelledby="seller-classifier-product-drafts">
        <h2 id="seller-classifier-product-drafts" className="font-display text-xl font-semibold">
          {tr(S.drafts)}
        </h2>
        {snapshot.productDrafts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {terminalWithoutDrafts ? tr(S.noDraftsCreated) : tr(S.noDrafts)}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {snapshot.productDrafts.map((draft, index) => {
              const href = productDraftHref?.(draft.productDraftId, lang) ?? null;
              return (
                <Card key={draft.productDraftId}>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {draft.title?.trim() || `${tr(S.untitledDraft)} ${index + 1}`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <Definition
                        label={tr(S.productDraftStatus)}
                        value={productStatusLabel(draft.status)}
                      />
                      <Definition
                        label={tr(S.imageStatus)}
                        value={imageStatusLabel(draft.imageStatus)}
                      />
                      <Definition
                        label={tr(S.category)}
                        value={
                          draft.category
                            ? `${draft.category.name} (${draft.category.slug})`
                            : tr(S.categoryNotSet)
                        }
                      />
                      <Definition
                        label={tr(S.productCode)}
                        value={draft.productCode ?? tr(S.assignedWhenPublishing)}
                      />
                      {showProductDraftId ? (
                        <Definition label={tr(S.productDraftId)} value={draft.productDraftId} />
                      ) : null}
                    </dl>
                    {href ? (
                      <a
                        className="inline-flex text-sm font-medium text-primary underline underline-offset-4"
                        href={href}
                      >
                        {productActionLabel(draft.status)}
                      </a>
                    ) : (
                      <p className="text-sm text-muted-foreground">{tr(S.readOnlyOutcome)}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function shouldPoll(snapshot: SellerClassifierDraftImportSnapshot): boolean {
  return snapshot.importStatus === "pending" || snapshot.importStatus === "running";
}

function hasCompletionMismatch(snapshot: SellerClassifierDraftImportSnapshot | null): boolean {
  return snapshot?.importStatus === "completed" && snapshot.stage !== "drafts_ready";
}

function isImportError(value: unknown): value is { code: string } {
  return typeof value === "object" && value !== null && "code" in value;
}

function importErrorCode(error: unknown): string | null {
  return isImportError(error) && typeof error.code === "string" ? error.code : null;
}

function importPageError(error: unknown): PageError {
  switch (importErrorCode(error)) {
    case "seller_classifier_approval_invalid":
      return { message: tr(S.invalid), retryable: false };
    case "seller_classifier_batch_not_found":
    case "seller_not_found":
    case "delegated_upload_workflow_not_found":
      return { message: tr(S.notFound), retryable: false };
    case "seller_classifier_configuration_invalid":
    case "delegated_action_configuration_invalid":
    case "prototype_administrator_configuration_invalid":
      return { message: tr(S.setupError), retryable: false };
    case "prototype_administrator_required":
      return { message: tr(S.administratorRequired), retryable: false };
    default:
      return { message: tr(S.unavailable), retryable: true };
  }
}

function importActionError(error: unknown): string {
  switch (importErrorCode(error)) {
    case "seller_classifier_approval_invalid":
      return tr(S.invalid);
    case "seller_classifier_import_ownership_conflict":
      return tr(S.ownershipConflict);
    case "seller_classifier_configuration_invalid":
    case "delegated_action_configuration_invalid":
    case "prototype_administrator_configuration_invalid":
      return tr(S.setupError);
    case "prototype_administrator_required":
      return tr(S.administratorRequired);
    case "delegated_action_in_progress":
      return tr(S.actionInProgress);
    case "delegated_action_request_conflict":
      return tr(S.actionConflict);
    case "delegated_action_audit_unavailable":
    case "delegated_import_unavailable":
    case "delegated_classifier_unavailable":
    default:
      return tr(S.unavailable);
  }
}

function durableErrorMessage(errorCode: string | null, productDraftCount: number): string | null {
  if (errorCode === null) return null;
  if (errorCode === "seller_classifier_import_incomplete") {
    return productDraftCount > 0 ? tr(S.incomplete) : tr(S.failed);
  }
  if (errorCode === "seller_classifier_import_failed") return tr(S.failed);
  return tr(S.unexpectedFailure);
}

function productActionLabel(status: "draft" | "published" | "archived"): string {
  return status === "draft" ? tr(S.editDraft) : tr(S.openProduct);
}

function stageLabel(stage: SellerClassifierDraftImportStage): string {
  switch (stage) {
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

function importStatusLabel(status: SellerClassifierDraftImportStatus | null): string {
  switch (status) {
    case null:
      return tr(S.statusNotStarted);
    case "pending":
      return tr(S.statusPending);
    case "running":
      return tr(S.statusRunning);
    case "completed":
      return tr(S.statusCompleted);
    case "completed_with_errors":
      return tr(S.statusPartial);
    case "failed":
      return tr(S.statusFailed);
  }
}

function productStatusLabel(status: "draft" | "published" | "archived"): string {
  switch (status) {
    case "draft":
      return tr(S.productDraft);
    case "published":
      return tr(S.productPublished);
    case "archived":
      return tr(S.productArchived);
  }
}

function imageStatusLabel(status: SellerClassifierProductDraftImageStatus): string {
  switch (status) {
    case "pending":
      return tr(S.imagesPending);
    case "available":
      return tr(S.imagesAvailable);
    case "partially_available":
      return tr(S.imagesPartial);
    case "failed":
      return tr(S.imagesFailed);
  }
}

function sellerProductDraftHref(productDraftId: string, lang: Lang): string {
  const search = new URLSearchParams({ lang });
  return `/seller/products/${encodeURIComponent(productDraftId)}?${search.toString()}`;
}

function Definition({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function CountCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="border border-border/70 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{count}</p>
    </div>
  );
}
