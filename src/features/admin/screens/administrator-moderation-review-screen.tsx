import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useReadOnlyModerationRefresh } from "@/features/moderation/read-only-moderation-refresh";
import { listProductCategories } from "@/features/seller/categories.functions";
import { t, tr, type T } from "@/lib/i18n";

import {
  administratorModerationActionErrorCode,
  classifyAdministratorModerationActionError,
  normalizeAdministratorModerationReason,
  type AdministratorModerationReviewAction,
} from "../administrator-moderation-review.actions";
import type { AdministratorModerationReviewRouteState } from "../administrator-moderation-review.navigation";
import {
  administratorProductRefreshDescriptor,
  administratorSellerRefreshDescriptor,
} from "../administrator-moderation-review.refresh";
import {
  decideAdministratorProductSubmission,
  decideAdministratorSellerSubmission,
  getAdministratorProductModerationRequest,
  getAdministratorSellerModerationRequest,
  retryAdministratorProductActivation,
  retryAdministratorProductActivationDispatch,
  retryAdministratorProductPostSwitchCleanup,
} from "../administrator-moderation.functions";
import type {
  AdministratorModerationDecisionValue,
  AdministratorProductActivationRecoveryRequest,
  AdministratorProductModerationDecisionRequest,
  AdministratorProductModerationDetail,
  AdministratorSellerModerationDecisionRequest,
  AdministratorSellerModerationDetail,
} from "../administrator-moderation.types";
import {
  AdministratorProductReviewDetails,
  AdministratorSellerReviewDetails,
  type AdministratorModerationCategory,
} from "../components/administrator-moderation-review-details";
import { ClassifierImportShell } from "../components/classifier-import-shell";

type AdministratorModerationDetail =
  AdministratorSellerModerationDetail | AdministratorProductModerationDetail;

type ModerationActionResponse = {
  detail: AdministratorModerationDetail;
  dispatch?: { result?: string } | null;
};

export type AdministratorModerationReviewClient = {
  getSeller(submissionId: string): Promise<AdministratorSellerModerationDetail>;
  getProduct(submissionId: string): Promise<AdministratorProductModerationDetail>;
  listCategories(): Promise<AdministratorModerationCategory[]>;
  decideSeller(
    request: AdministratorSellerModerationDecisionRequest,
  ): Promise<ModerationActionResponse>;
  decideProduct(
    request: AdministratorProductModerationDecisionRequest,
  ): Promise<ModerationActionResponse>;
  retryDispatch(
    request: AdministratorProductActivationRecoveryRequest,
  ): Promise<ModerationActionResponse>;
  retryActivation(
    request: AdministratorProductActivationRecoveryRequest,
  ): Promise<ModerationActionResponse>;
  retryPostSwitchCleanup(
    request: AdministratorProductActivationRecoveryRequest,
  ): Promise<ModerationActionResponse>;
};

type Props = {
  routeState: AdministratorModerationReviewRouteState;
  client?: AdministratorModerationReviewClient;
};

type DecisionDialogState = {
  decision: AdministratorModerationDecisionValue;
  reason: string;
};

const S = {
  pageTitle: t(
    "Moderation request",
    "Prośba o moderację",
    "Moderationsanfrage",
    "Yêu cầu kiểm duyệt",
  ),
  back: t("Back to requests", "Wróć do zgłoszeń", "Zurück zu Anfragen", "Quay lại yêu cầu"),
  loading: t(
    "Loading moderation request",
    "Ładowanie zgłoszenia moderacyjnego",
    "Moderationsanfrage wird geladen",
    "Đang tải yêu cầu kiểm duyệt",
  ),
  invalidTitle: t(
    "Invalid moderation request",
    "Nieprawidłowe zgłoszenie moderacyjne",
    "Ungültige Moderationsanfrage",
    "Yêu cầu kiểm duyệt không hợp lệ",
  ),
  invalidDescription: t(
    "The moderation route or return state is invalid.",
    "Trasa moderacji lub stan powrotu jest nieprawidłowy.",
    "Die Moderationsroute oder der Rückkehrstatus ist ungültig.",
    "Đường dẫn kiểm duyệt hoặc trạng thái quay lại không hợp lệ.",
  ),
  administratorRequired: t(
    "Administrator access required",
    "Wymagany dostęp administratora",
    "Administratorzugriff erforderlich",
    "Cần quyền quản trị viên",
  ),
  administratorRequiredDescription: t(
    "This request is available only to allowlisted prototype administrators.",
    "To zgłoszenie jest dostępne tylko dla administratorów prototypu z listy dozwolonych.",
    "Diese Anfrage ist nur für zugelassene Prototyp-Administratoren verfügbar.",
    "Yêu cầu này chỉ dành cho quản trị viên nguyên mẫu được cho phép.",
  ),
  notFound: t(
    "Moderation request not found",
    "Nie znaleziono zgłoszenia moderacyjnego",
    "Moderationsanfrage nicht gefunden",
    "Không tìm thấy yêu cầu kiểm duyệt",
  ),
  unavailable: t(
    "Moderation request is temporarily unavailable",
    "Zgłoszenie moderacyjne jest tymczasowo niedostępne",
    "Moderationsanfrage ist vorübergehend nicht verfügbar",
    "Yêu cầu kiểm duyệt tạm thời không khả dụng",
  ),
  retry: t("Try again", "Spróbuj ponownie", "Erneut versuchen", "Thử lại"),
  refresh: t("Refresh request", "Odśwież zgłoszenie", "Anfrage aktualisieren", "Làm mới yêu cầu"),
  refreshWarning: t(
    "The latest state could not be loaded. The last successful review remains visible.",
    "Nie można załadować najnowszego stanu. Ostatni poprawny przegląd pozostaje widoczny.",
    "Der neueste Status konnte nicht geladen werden. Die letzte erfolgreiche Prüfung bleibt sichtbar.",
    "Không thể tải trạng thái mới nhất. Bản đánh giá thành công gần nhất vẫn hiển thị.",
  ),
  seller: t("Seller", "Sprzedawca", "Verkäufer", "Nhà bán"),
  submission: t("Submission", "Zgłoszenie", "Einreichung", "Lần gửi"),
  revision: t("Revision", "Wersja", "Revision", "Phiên bản"),
  submitted: t("Submitted", "Przesłano", "Eingereicht", "Đã gửi"),
  reviewStatus: t("Review status", "Status przeglądu", "Prüfstatus", "Trạng thái đánh giá"),
  activation: t("Activation", "Aktywacja", "Aktivierung", "Kích hoạt"),
  noActivation: t("Not started", "Nie rozpoczęto", "Nicht gestartet", "Chưa bắt đầu"),
  decision: t("Decision", "Decyzja", "Entscheidung", "Quyết định"),
  approveSeller: t("Approve", "Zatwierdź", "Genehmigen", "Duyệt"),
  approveProduct: t(
    "Approve and start activation",
    "Zatwierdź i rozpocznij aktywację",
    "Genehmigen und Aktivierung starten",
    "Duyệt và bắt đầu kích hoạt",
  ),
  requestChanges: t(
    "Request changes",
    "Poproś o zmiany",
    "Änderungen anfordern",
    "Yêu cầu thay đổi",
  ),
  reject: t("Reject", "Odrzuć", "Ablehnen", "Từ chối"),
  approveSellerTitle: t(
    "Approve seller profile?",
    "Zatwierdzić profil sprzedawcy?",
    "Verkäuferprofil genehmigen?",
    "Duyệt hồ sơ nhà bán?",
  ),
  approveProductTitle: t(
    "Approve product submission?",
    "Zatwierdzić zgłoszenie produktu?",
    "Produkteinreichung genehmigen?",
    "Duyệt sản phẩm?",
  ),
  approveSellerDescription: t(
    "The proposed profile becomes the seller's approved public projection.",
    "Proponowany profil stanie się zatwierdzonym publicznym profilem sprzedawcy.",
    "Das vorgeschlagene Profil wird zur genehmigten öffentlichen Darstellung des Verkäufers.",
    "Hồ sơ đề xuất sẽ trở thành hồ sơ công khai đã duyệt của nhà bán.",
  ),
  approveProductDescription: t(
    "Approval records the decision and starts asynchronous product activation.",
    "Zatwierdzenie zapisuje decyzję i rozpoczyna asynchroniczną aktywację produktu.",
    "Die Genehmigung speichert die Entscheidung und startet die asynchrone Produktaktivierung.",
    "Việc duyệt ghi nhận quyết định và bắt đầu kích hoạt sản phẩm bất đồng bộ.",
  ),
  reasonTitle: t(
    "Seller-visible reason",
    "Powód widoczny dla sprzedawcy",
    "Für Verkäufer sichtbarer Grund",
    "Lý do hiển thị cho nhà bán",
  ),
  reasonDescription: t(
    "Enter a clear reason from 1 to 1,000 characters.",
    "Podaj jasny powód o długości od 1 do 1000 znaków.",
    "Geben Sie einen klaren Grund mit 1 bis 1.000 Zeichen ein.",
    "Nhập lý do rõ ràng từ 1 đến 1.000 ký tự.",
  ),
  reasonRequired: t(
    "Enter a reason before continuing.",
    "Podaj powód przed kontynuowaniem.",
    "Geben Sie vor dem Fortfahren einen Grund ein.",
    "Nhập lý do trước khi tiếp tục.",
  ),
  cancel: t("Cancel", "Anuluj", "Abbrechen", "Hủy"),
  confirm: t("Confirm", "Potwierdź", "Bestätigen", "Xác nhận"),
  actionUnknownTitle: t(
    "Action outcome is not confirmed",
    "Wynik działania nie jest potwierdzony",
    "Aktionsergebnis ist nicht bestätigt",
    "Kết quả hành động chưa được xác nhận",
  ),
  actionUnknownDescription: t(
    "Retry the exact frozen request or discard it and reload authoritative state. A different action cannot reuse this request identifier.",
    "Ponów dokładnie to samo zamrożone żądanie albo odrzuć je i wczytaj stan źródłowy. Inne działanie nie może użyć tego identyfikatora.",
    "Wiederholen Sie exakt die eingefrorene Anfrage oder verwerfen Sie sie und laden Sie den maßgeblichen Status neu. Eine andere Aktion darf diese Kennung nicht wiederverwenden.",
    "Thử lại đúng yêu cầu đã đóng băng hoặc hủy và tải lại trạng thái chính thức. Hành động khác không được dùng lại mã yêu cầu này.",
  ),
  retryExact: t(
    "Retry exact request",
    "Ponów dokładne żądanie",
    "Exakte Anfrage wiederholen",
    "Thử lại đúng yêu cầu",
  ),
  discardRefresh: t(
    "Discard and refresh",
    "Odrzuć i odśwież",
    "Verwerfen und aktualisieren",
    "Hủy và làm mới",
  ),
  concurrentTitle: t(
    "Request changed elsewhere",
    "Zgłoszenie zmieniło się gdzie indziej",
    "Anfrage wurde anderswo geändert",
    "Yêu cầu đã thay đổi ở nơi khác",
  ),
  concurrentDescription: t(
    "Another administrator or worker changed this request. The authoritative detail has been refreshed.",
    "Inny administrator lub proces zmienił to zgłoszenie. Stan źródłowy został odświeżony.",
    "Ein anderer Administrator oder Worker hat diese Anfrage geändert. Der maßgebliche Status wurde aktualisiert.",
    "Quản trị viên hoặc tiến trình khác đã thay đổi yêu cầu. Chi tiết chính thức đã được làm mới.",
  ),
  dispatchStale: t(
    "The dispatch state changed concurrently. The latest state is shown.",
    "Stan wysyłki zmienił się równocześnie. Pokazano najnowszy stan.",
    "Der Versandstatus wurde gleichzeitig geändert. Der neueste Status wird angezeigt.",
    "Trạng thái điều phối đã thay đổi đồng thời. Trạng thái mới nhất được hiển thị.",
  ),
  dispatchFailedDescription: t(
    "The moderation decision was approved, but activation dispatch failed. Use the authorized retry action below.",
    "Decyzja moderacyjna została zatwierdzona, ale wysyłka aktywacji nie powiodła się. Użyj poniższego autoryzowanego ponowienia.",
    "Die Moderationsentscheidung wurde genehmigt, aber der Aktivierungsversand ist fehlgeschlagen. Verwenden Sie die autorisierte Wiederholung unten.",
    "Quyết định kiểm duyệt đã được duyệt nhưng điều phối kích hoạt thất bại. Hãy dùng thao tác thử lại được cho phép bên dưới.",
  ),
  actionFailed: t(
    "The action could not be completed.",
    "Nie można ukończyć działania.",
    "Die Aktion konnte nicht abgeschlossen werden.",
    "Không thể hoàn tất hành động.",
  ),
  imagesNotReady: t(
    "Submitted images are not ready. Resolve the image state before approval.",
    "Przesłane zdjęcia nie są gotowe. Rozwiąż stan zdjęć przed zatwierdzeniem.",
    "Eingereichte Bilder sind nicht bereit. Klären Sie den Bildstatus vor der Genehmigung.",
    "Ảnh đã gửi chưa sẵn sàng. Xử lý trạng thái ảnh trước khi duyệt.",
  ),
  sellerNotApproved: t(
    "The seller must remain approved before this product can be approved.",
    "Sprzedawca musi pozostać zatwierdzony przed zatwierdzeniem produktu.",
    "Der Verkäufer muss genehmigt bleiben, bevor das Produkt genehmigt werden kann.",
    "Nhà bán phải vẫn được duyệt trước khi sản phẩm được duyệt.",
  ),
  slugConflict: t(
    "The proposed seller address is already in use.",
    "Proponowany adres sprzedawcy jest już używany.",
    "Die vorgeschlagene Verkäuferadresse wird bereits verwendet.",
    "Địa chỉ nhà bán đề xuất đã được sử dụng.",
  ),
  retryDispatch: t("Retry dispatch", "Ponów wysyłkę", "Versand wiederholen", "Thử lại điều phối"),
  retryActivation: t(
    "Retry activation",
    "Ponów aktywację",
    "Aktivierung wiederholen",
    "Thử lại kích hoạt",
  ),
  retryCleanup: t(
    "Retry public-image cleanup",
    "Ponów czyszczenie publicznych zdjęć",
    "Bereinigung öffentlicher Bilder wiederholen",
    "Thử lại dọn ảnh công khai",
  ),
  approvedDispatchFailed: t(
    "Approved · Dispatch failed",
    "Zatwierdzono · Błąd wysyłki",
    "Genehmigt · Versand fehlgeschlagen",
    "Đã duyệt · Điều phối lỗi",
  ),
  untitledProduct: t(
    "Untitled product",
    "Produkt bez tytułu",
    "Unbenanntes Produkt",
    "Sản phẩm chưa có tiêu đề",
  ),
};

const reviewStatusLabels: Record<string, T> = {
  pending: t("Pending", "Oczekuje", "Ausstehend", "Đang chờ"),
  changes_requested: t(
    "Changes requested",
    "Zażądano zmian",
    "Änderungen angefordert",
    "Đã yêu cầu thay đổi",
  ),
  approved: t("Approved", "Zatwierdzono", "Genehmigt", "Đã duyệt"),
  rejected: t("Rejected", "Odrzucono", "Abgelehnt", "Đã từ chối"),
  withdrawn: t("Withdrawn", "Wycofano", "Zurückgezogen", "Đã rút"),
};

export function AdministratorModerationReviewScreen({ routeState, client: providedClient }: Props) {
  const getSeller = useServerFn(getAdministratorSellerModerationRequest);
  const getProduct = useServerFn(getAdministratorProductModerationRequest);
  const categories = useServerFn(listProductCategories);
  const decideSeller = useServerFn(decideAdministratorSellerSubmission);
  const decideProduct = useServerFn(decideAdministratorProductSubmission);
  const retryDispatch = useServerFn(retryAdministratorProductActivationDispatch);
  const retryActivation = useServerFn(retryAdministratorProductActivation);
  const retryCleanup = useServerFn(retryAdministratorProductPostSwitchCleanup);
  const client = useMemo<AdministratorModerationReviewClient>(
    () => ({
      getSeller: (submissionId) => getSeller({ data: { submissionId } }),
      getProduct: (submissionId) => getProduct({ data: { submissionId } }),
      listCategories: async () => {
        const response = await categories();
        return response.categories.map((category) => ({
          id: category.id,
          slug: category.slug,
          name: category.name,
        }));
      },
      decideSeller: (request) =>
        decideSeller({ data: request }) as Promise<ModerationActionResponse>,
      decideProduct: (request) =>
        decideProduct({ data: request }) as Promise<ModerationActionResponse>,
      retryDispatch: (request) =>
        retryDispatch({ data: request }) as Promise<ModerationActionResponse>,
      retryActivation: (request) =>
        retryActivation({ data: request }) as Promise<ModerationActionResponse>,
      retryPostSwitchCleanup: (request) =>
        retryCleanup({ data: request }) as Promise<ModerationActionResponse>,
    }),
    [
      categories,
      decideProduct,
      decideSeller,
      getProduct,
      getSeller,
      retryActivation,
      retryCleanup,
      retryDispatch,
    ],
  );
  return (
    <AdministratorModerationReviewScreenView
      routeState={routeState}
      client={providedClient ?? client}
    />
  );
}

export function AdministratorModerationReviewScreenView({
  routeState,
  client,
}: {
  routeState: AdministratorModerationReviewRouteState;
  client: AdministratorModerationReviewClient;
}) {
  const [detail, setDetail] = useState<AdministratorModerationDetail | null>(null);
  const [categories, setCategories] = useState<AdministratorModerationCategory[]>([]);
  const [categoryWarning, setCategoryWarning] = useState(false);
  const [loading, setLoading] = useState(routeState.valid);
  const [pageError, setPageError] = useState<PageError | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!routeState.valid) {
      setDetail(null);
      setLoading(false);
      setPageError("invalid");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPageError(null);
    setDetail(null);
    setCategories([]);
    setCategoryWarning(false);

    void readDetail(client, routeState)
      .then(async (next) => {
        if (cancelled) return;
        setDetail(next);
        if (next.kind === "product") {
          try {
            const nextCategories = await client.listCategories();
            if (!cancelled) setCategories(nextCategories);
          } catch {
            if (!cancelled) setCategoryWarning(true);
          }
        }
      })
      .catch((error) => {
        if (!cancelled) setPageError(readPageError(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, loadAttempt, routeState]);

  if (!routeState.valid) {
    return <ReviewPageState backHref={routeState.backHref} state="invalid" />;
  }
  if (loading && !detail) {
    return <ReviewLoading backHref={routeState.backHref} />;
  }
  if (pageError || !detail) {
    return (
      <ReviewPageState
        backHref={routeState.backHref}
        state={pageError ?? "unavailable"}
        onRetry={() => setLoadAttempt((value) => value + 1)}
      />
    );
  }
  return (
    <LoadedModerationReview
      key={`${routeState.submissionType}:${routeState.submissionId}`}
      routeState={routeState}
      initialDetail={detail}
      initialCategories={categories}
      initialCategoryWarning={categoryWarning}
      client={client}
    />
  );
}

function LoadedModerationReview({
  routeState,
  initialDetail,
  initialCategories,
  initialCategoryWarning,
  client,
}: {
  routeState: Extract<AdministratorModerationReviewRouteState, { valid: true }>;
  initialDetail: AdministratorModerationDetail;
  initialCategories: AdministratorModerationCategory[];
  initialCategoryWarning: boolean;
  client: AdministratorModerationReviewClient;
}) {
  const [detail, setDetail] = useState(initialDetail);
  const [categories, setCategories] = useState(initialCategories);
  const [categoryWarning, setCategoryWarning] = useState(initialCategoryWarning);
  const [fatalError, setFatalError] = useState<PageError | null>(null);
  const [dialog, setDialog] = useState<DecisionDialogState | null>(null);
  const [reasonError, setReasonError] = useState(false);
  const [retainedAction, setRetainedAction] = useState<AdministratorModerationReviewAction | null>(
    null,
  );
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [concurrentNotice, setConcurrentNotice] = useState<string | null>(null);

  const readCurrent = useCallback(async () => {
    try {
      const next = await readDetail(client, routeState);
      if (next.kind === "product") {
        try {
          setCategories(await client.listCategories());
          setCategoryWarning(false);
        } catch {
          setCategoryWarning(true);
        }
      }
      return next;
    } catch (error) {
      const page = readPageError(error);
      if (page === "administrator_required" || page === "not_found" || page === "invalid") {
        setFatalError(page);
      }
      throw error;
    }
  }, [client, routeState]);

  const refresh = useReadOnlyModerationRefresh({
    detail,
    readDetail: readCurrent,
    onDetail: setDetail,
    describe: uncertain
      ? () => ({ activationDisplayState: null, reviewStatus: null, imageCredentials: [] })
      : describeAdministratorModerationDetail,
  });

  async function executeAction(action: AdministratorModerationReviewAction) {
    setBusy(true);
    setActionError(null);
    setConcurrentNotice(null);
    try {
      const response = await runAction(client, action);
      setRetainedAction(null);
      setUncertain(false);
      setDialog(null);
      setDetail(assertActionDetail(response.detail, routeState));
      if (response.dispatch?.result === "stale") setConcurrentNotice(tr(S.dispatchStale));
    } catch (error) {
      const disposition = classifyAdministratorModerationActionError(error);
      if (disposition === "outcome_unknown") {
        setUncertain(true);
        setDialog(null);
      } else if (disposition === "refresh_concurrent") {
        setRetainedAction(null);
        setUncertain(false);
        setDialog(null);
        setConcurrentNotice(tr(S.concurrentDescription));
        await refresh.refreshDetail().catch(() => undefined);
      } else if (disposition === "administrator_required") {
        setRetainedAction(null);
        setFatalError("administrator_required");
      } else if (disposition === "invalid_request") {
        setRetainedAction(null);
        setFatalError("invalid");
      } else if (disposition === "not_found") {
        setRetainedAction(null);
        setFatalError("not_found");
      } else {
        setRetainedAction(null);
        setUncertain(false);
        setDialog(null);
        setActionError(administratorModerationActionErrorCode(error) ?? "unknown");
      }
    } finally {
      setBusy(false);
    }
  }

  function confirmDecision() {
    if (!dialog || retainedAction) return;
    const reason = normalizeAdministratorModerationReason(dialog.reason);
    if (dialog.decision !== "approve" && (reason.length < 1 || reason.length > 1_000)) {
      setReasonError(true);
      return;
    }
    const requestId = crypto.randomUUID();
    const common = {
      submissionId: detail.request.submissionId,
      expectedRevision: detail.request.revision,
      decision: dialog.decision,
      reason: dialog.decision === "approve" ? null : reason,
      requestId,
    };
    const action: AdministratorModerationReviewAction =
      detail.kind === "seller"
        ? {
            kind: "seller_decision",
            payload: { ...common, sellerId: detail.request.seller.sellerId },
          }
        : { kind: "product_decision", payload: common };
    setReasonError(false);
    setRetainedAction(action);
    void executeAction(action);
  }

  function beginRecovery(
    kind: "retry_dispatch" | "retry_activation" | "retry_post_switch_cleanup",
  ) {
    if (detail.kind !== "product" || !detail.request.activation || retainedAction) return;
    const action: AdministratorModerationReviewAction = {
      kind,
      payload: {
        submissionId: detail.request.submissionId,
        runId: detail.request.activation.runId,
        expectedDispatchGeneration: detail.request.activation.dispatchGeneration,
        requestId: crypto.randomUUID(),
      },
    };
    setRetainedAction(action);
    void executeAction(action);
  }

  async function discardAndRefresh() {
    setBusy(true);
    setActionError(null);
    try {
      await refresh.refreshDetail();
      setRetainedAction(null);
      setUncertain(false);
    } catch {
      // Keep the exact action frozen until an authoritative read succeeds.
    } finally {
      setBusy(false);
    }
  }

  if (fatalError) return <ReviewPageState backHref={routeState.backHref} state={fatalError} />;

  const isDispatchFailure =
    detail.kind === "product" && detail.request.activation?.displayState === "dispatch_failed";
  return (
    <ClassifierImportShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <a
              href={routeState.backHref}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← {tr(S.back)}
            </a>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
              {tr(S.pageTitle)}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {detail.request.seller.name} · {detail.request.submissionType}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={refresh.refreshing || busy || uncertain}
            onClick={() => void refresh.refreshDetail().catch(() => undefined)}
          >
            {tr(S.refresh)}
          </Button>
        </div>

        <RequestSummary detail={detail} />

        {isDispatchFailure ? (
          <Alert variant="destructive">
            <AlertTitle>{tr(S.approvedDispatchFailed)}</AlertTitle>
            <AlertDescription>{tr(S.dispatchFailedDescription)}</AlertDescription>
          </Alert>
        ) : null}
        {refresh.readWarning ? (
          <Alert>
            <AlertTitle>{tr(S.unavailable)}</AlertTitle>
            <AlertDescription>{tr(S.refreshWarning)}</AlertDescription>
          </Alert>
        ) : null}
        {concurrentNotice ? (
          <Alert>
            <AlertTitle>{tr(S.concurrentTitle)}</AlertTitle>
            <AlertDescription>{concurrentNotice}</AlertDescription>
          </Alert>
        ) : null}
        {actionError ? (
          <Alert variant="destructive">
            <AlertTitle>{tr(S.actionFailed)}</AlertTitle>
            <AlertDescription>{actionErrorMessage(actionError)}</AlertDescription>
          </Alert>
        ) : null}
        {uncertain && retainedAction ? (
          <Alert variant="destructive">
            <AlertTitle>{tr(S.actionUnknownTitle)}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{tr(S.actionUnknownDescription)}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void executeAction(retainedAction)}
                >
                  {tr(S.retryExact)}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void discardAndRefresh()}
                >
                  {tr(S.discardRefresh)}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        {detail.kind === "seller" ? (
          <AdministratorSellerReviewDetails detail={detail} />
        ) : (
          <AdministratorProductReviewDetails
            detail={detail}
            categories={categories}
            categoryWarning={categoryWarning}
            failedCredentialIdentities={refresh.failedCredentialIdentities}
            onImageError={refresh.handleImageError}
          />
        )}

        {!uncertain ? (
          <ActionPanel
            detail={detail}
            busy={busy}
            onDecision={(decision) => {
              setActionError(null);
              setReasonError(false);
              setDialog({ decision, reason: "" });
            }}
            onRecovery={beginRecovery}
          />
        ) : null}

        <DecisionDialog
          state={dialog}
          detail={detail}
          busy={busy}
          reasonError={reasonError}
          onReason={(reason) => {
            setReasonError(false);
            setDialog((current) => (current ? { ...current, reason } : current));
          }}
          onClose={() => {
            if (!busy) setDialog(null);
          }}
          onConfirm={confirmDecision}
        />
      </div>
    </ClassifierImportShell>
  );
}

function RequestSummary({ detail }: { detail: AdministratorModerationDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{tr(S.submission)}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Summary label={tr(S.seller)} value={detail.request.seller.name} />
        <Summary label={tr(S.revision)} value={String(detail.request.revision)} />
        <Summary label={tr(S.submitted)} value={formatDate(detail.request.submittedAt)} />
        <Summary
          label={tr(S.reviewStatus)}
          value={tr(reviewStatusLabels[detail.request.reviewStatus] ?? S.reviewStatus)}
        />
        <Summary
          label={tr(S.activation)}
          value={
            detail.kind === "product" && detail.request.activation
              ? detail.request.activation.displayState
              : tr(S.noActivation)
          }
        />
      </CardContent>
    </Card>
  );
}

function ActionPanel({
  detail,
  busy,
  onDecision,
  onRecovery,
}: {
  detail: AdministratorModerationDetail;
  busy: boolean;
  onDecision(decision: AdministratorModerationDecisionValue): void;
  onRecovery(kind: "retry_dispatch" | "retry_activation" | "retry_post_switch_cleanup"): void;
}) {
  if (detail.kind === "seller" && !detail.actions.canDecide) return null;
  if (
    detail.kind === "product" &&
    !detail.actions.canDecide &&
    !detail.actions.canRetryDispatch &&
    !detail.actions.canRetryActivation &&
    !detail.actions.canRetryPostSwitchCleanup
  )
    return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr(S.decision)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {detail.actions.canDecide ? (
          <>
            <Button type="button" disabled={busy} onClick={() => onDecision("approve")}>
              {detail.kind === "seller" ? tr(S.approveSeller) : tr(S.approveProduct)}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onDecision("request_changes")}
            >
              {tr(S.requestChanges)}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => onDecision("reject")}
            >
              {tr(S.reject)}
            </Button>
          </>
        ) : null}
        {detail.kind === "product" && detail.actions.canRetryDispatch ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onRecovery("retry_dispatch")}
          >
            {tr(S.retryDispatch)}
          </Button>
        ) : null}
        {detail.kind === "product" && detail.actions.canRetryActivation ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onRecovery("retry_activation")}
          >
            {tr(S.retryActivation)}
          </Button>
        ) : null}
        {detail.kind === "product" && detail.actions.canRetryPostSwitchCleanup ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onRecovery("retry_post_switch_cleanup")}
          >
            {tr(S.retryCleanup)}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DecisionDialog({
  state,
  detail,
  busy,
  reasonError,
  onReason,
  onClose,
  onConfirm,
}: {
  state: DecisionDialogState | null;
  detail: AdministratorModerationDetail;
  busy: boolean;
  reasonError: boolean;
  onReason(reason: string): void;
  onClose(): void;
  onConfirm(): void;
}) {
  if (!state) return null;
  const approval = state.decision === "approve";
  const approvalSubject =
    detail.kind === "seller"
      ? detail.request.seller.name
      : `${detail.request.product.title.trim() || tr(S.untitledProduct)} · ${detail.request.seller.name}`;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {approval
              ? detail.kind === "seller"
                ? tr(S.approveSellerTitle)
                : tr(S.approveProductTitle)
              : state.decision === "reject"
                ? tr(S.reject)
                : tr(S.requestChanges)}
          </DialogTitle>
          <DialogDescription>
            {approval
              ? `${approvalSubject}: ${
                  detail.kind === "seller"
                    ? tr(S.approveSellerDescription)
                    : tr(S.approveProductDescription)
                }`
              : tr(S.reasonDescription)}
          </DialogDescription>
        </DialogHeader>
        {!approval ? (
          <div className="space-y-2">
            <label htmlFor="moderation-reason" className="text-sm font-medium">
              {tr(S.reasonTitle)}
            </label>
            <Textarea
              id="moderation-reason"
              value={state.reason}
              maxLength={1_000}
              disabled={busy}
              aria-invalid={reasonError}
              onChange={(event) => onReason(event.target.value)}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{reasonError ? tr(S.reasonRequired) : ""}</span>
              <span>{state.reason.length}/1000</span>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {tr(S.cancel)}
          </Button>
          <Button type="button" disabled={busy} onClick={onConfirm}>
            {tr(S.confirm)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewLoading({ backHref }: { backHref: string }) {
  return (
    <ClassifierImportShell>
      <a href={backHref} className="text-sm text-muted-foreground hover:text-foreground">
        ← {tr(S.back)}
      </a>
      <div aria-label={tr(S.loading)} className="mt-6 space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-36 w-full" />
        <div className="grid gap-5 xl:grid-cols-2">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    </ClassifierImportShell>
  );
}

type PageError = "invalid" | "administrator_required" | "not_found" | "unavailable";

function ReviewPageState({
  backHref,
  state,
  onRetry,
}: {
  backHref: string;
  state: PageError;
  onRetry?: () => void;
}) {
  const content =
    state === "invalid"
      ? { title: S.invalidTitle, description: S.invalidDescription }
      : state === "administrator_required"
        ? { title: S.administratorRequired, description: S.administratorRequiredDescription }
        : state === "not_found"
          ? { title: S.notFound, description: S.notFound }
          : { title: S.unavailable, description: S.unavailable };
  return (
    <ClassifierImportShell>
      <div className="space-y-5">
        <a href={backHref} className="text-sm text-muted-foreground hover:text-foreground">
          ← {tr(S.back)}
        </a>
        <Alert variant="destructive">
          <AlertTitle>{tr(content.title)}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{tr(content.description)}</p>
            {state === "unavailable" && onRetry ? (
              <Button type="button" variant="outline" onClick={onRetry}>
                {tr(S.retry)}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      </div>
    </ClassifierImportShell>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 break-words text-sm">{value}</div>
    </div>
  );
}

async function readDetail(
  client: AdministratorModerationReviewClient,
  routeState: Extract<AdministratorModerationReviewRouteState, { valid: true }>,
): Promise<AdministratorModerationDetail> {
  const detail =
    routeState.family === "seller"
      ? await client.getSeller(routeState.submissionId)
      : await client.getProduct(routeState.submissionId);
  return assertActionDetail(detail, routeState);
}

function assertActionDetail(
  detail: AdministratorModerationDetail,
  routeState: Extract<AdministratorModerationReviewRouteState, { valid: true }>,
): AdministratorModerationDetail {
  if (
    detail.kind !== routeState.family ||
    detail.request.submissionId !== routeState.submissionId ||
    detail.request.submissionType !== routeState.submissionType
  ) {
    throw codedError("moderation_submission_not_found");
  }
  return detail;
}

function describeAdministratorModerationDetail(detail: AdministratorModerationDetail) {
  return detail.kind === "product"
    ? administratorProductRefreshDescriptor(detail)
    : administratorSellerRefreshDescriptor(detail);
}

function runAction(
  client: AdministratorModerationReviewClient,
  action: AdministratorModerationReviewAction,
): Promise<ModerationActionResponse> {
  switch (action.kind) {
    case "seller_decision":
      return client.decideSeller(action.payload);
    case "product_decision":
      return client.decideProduct(action.payload);
    case "retry_dispatch":
      return client.retryDispatch(action.payload);
    case "retry_activation":
      return client.retryActivation(action.payload);
    case "retry_post_switch_cleanup":
      return client.retryPostSwitchCleanup(action.payload);
  }
}

function readPageError(error: unknown): PageError {
  const code = administratorModerationActionErrorCode(error);
  if (code === "prototype_administrator_required") return "administrator_required";
  if (code === "moderation_request_invalid") return "invalid";
  if (code === "moderation_submission_not_found") return "not_found";
  return "unavailable";
}

function actionErrorMessage(code: string): string {
  if (code === "seller_profile_slug_conflict") return tr(S.slugConflict);
  if (code === "product_moderation_images_not_ready" || code === "seller_profile_image_not_ready") {
    return tr(S.imagesNotReady);
  }
  if (
    code === "product_moderation_seller_approval_required" ||
    code === "seller_approval_required"
  ) {
    return tr(S.sellerNotApproved);
  }
  return tr(S.actionFailed);
}

function codedError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
