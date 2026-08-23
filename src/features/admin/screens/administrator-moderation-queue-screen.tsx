import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { t, tr, type Lang, type T } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";

import { listAdministratorModerationRequests } from "../administrator-moderation.functions";
import {
  administratorModerationDefaultRequest,
  buildAdministratorModerationDetailHref,
  type AdministratorModerationRouteState,
} from "../administrator-moderation.navigation";
import {
  ADMINISTRATOR_MODERATION_ACTIVATION_STATUSES,
  ADMINISTRATOR_MODERATION_REVIEW_STATUSES,
  ADMINISTRATOR_MODERATION_SUBMISSION_TYPES,
  parseAdministratorModerationRequest,
  type AdministratorModerationActivationStatus,
  type AdministratorModerationPage,
  type AdministratorModerationQueueItem,
  type AdministratorModerationRequest,
  type AdministratorModerationSubmissionType,
} from "../administrator-moderation.types";
import { ClassifierImportShell } from "../components/classifier-import-shell";

export type AdministratorModerationQueueClient = {
  list(request: AdministratorModerationRequest): Promise<AdministratorModerationPage>;
};

export type AdministratorModerationQueueScreenProps = {
  routeState: AdministratorModerationRouteState;
  onRequestChange(request: AdministratorModerationRequest): void;
  client?: AdministratorModerationQueueClient;
};

const S = {
  title: t(
    "Moderation requests",
    "Prośby o moderację",
    "Moderationsanfragen",
    "Yêu cầu kiểm duyệt",
  ),
  description: t(
    "Review seller and product submissions from one protected queue.",
    "Przeglądaj zgłoszenia sprzedawców i produktów w jednej chronionej kolejce.",
    "Prüfen Sie Verkäufer- und Produktanfragen in einer geschützten Warteschlange.",
    "Xem yêu cầu của nhà bán và sản phẩm trong một hàng đợi được bảo vệ.",
  ),
  filters: t("Filters", "Filtry", "Filter", "Bộ lọc"),
  submissionType: t("Request type", "Typ zgłoszenia", "Anfragetyp", "Loại yêu cầu"),
  allSubmissionTypes: t(
    "All request types",
    "Wszystkie typy",
    "Alle Anfragetypen",
    "Mọi loại yêu cầu",
  ),
  reviewStatus: t("Review status", "Status moderacji", "Prüfstatus", "Trạng thái kiểm duyệt"),
  activationStatus: t(
    "Activation status",
    "Status aktywacji",
    "Aktivierungsstatus",
    "Trạng thái kích hoạt",
  ),
  allActivationStatuses: t(
    "Any activation state",
    "Dowolny stan aktywacji",
    "Jeder Aktivierungsstatus",
    "Mọi trạng thái kích hoạt",
  ),
  sellerId: t(
    "Seller ID (exact)",
    "ID sprzedawcy (dokładny)",
    "Verkäufer-ID (genau)",
    "Mã nhà bán (chính xác)",
  ),
  sellerIdPlaceholder: t(
    "Optional seller UUID",
    "Opcjonalny UUID sprzedawcy",
    "Optionale Verkäufer-UUID",
    "UUID nhà bán không bắt buộc",
  ),
  pageSize: t("Items per page", "Elementów na stronę", "Einträge pro Seite", "Mục mỗi trang"),
  applyFilters: t("Apply filters", "Zastosuj filtry", "Filter anwenden", "Áp dụng bộ lọc"),
  resetPending: t(
    "Reset to pending",
    "Pokaż oczekujące",
    "Auf ausstehend zurücksetzen",
    "Đặt lại về đang chờ",
  ),
  invalidFilters: t(
    "Choose compatible statuses, a page size from 1 to 100, and a valid seller identifier.",
    "Wybierz zgodne statusy, rozmiar strony od 1 do 100 i prawidłowy identyfikator sprzedawcy.",
    "Wählen Sie kompatible Status, 1 bis 100 Einträge und eine gültige Verkäufer-ID.",
    "Chọn trạng thái tương thích, 1 đến 100 mục và mã nhà bán hợp lệ.",
  ),
  invalidRequestTitle: t(
    "Invalid moderation filters",
    "Nieprawidłowe filtry moderacji",
    "Ungültige Moderationsfilter",
    "Bộ lọc kiểm duyệt không hợp lệ",
  ),
  invalidRequestDescription: t(
    "The URL contains malformed or incompatible filters. Reset it before loading requests.",
    "Adres zawiera nieprawidłowe lub niezgodne filtry. Zresetuj go przed wczytaniem zgłoszeń.",
    "Die URL enthält ungültige oder inkompatible Filter. Setzen Sie sie vor dem Laden zurück.",
    "URL chứa bộ lọc sai hoặc không tương thích. Hãy đặt lại trước khi tải.",
  ),
  loading: t(
    "Loading moderation requests",
    "Wczytywanie zgłoszeń",
    "Moderationsanfragen werden geladen",
    "Đang tải yêu cầu kiểm duyệt",
  ),
  refreshing: t(
    "Refreshing moderation requests…",
    "Odświeżanie zgłoszeń…",
    "Moderationsanfragen werden aktualisiert…",
    "Đang làm mới yêu cầu…",
  ),
  refresh: t("Refresh requests", "Odśwież zgłoszenia", "Anfragen aktualisieren", "Làm mới yêu cầu"),
  unavailableTitle: t(
    "Moderation requests could not be loaded",
    "Nie można wczytać zgłoszeń",
    "Moderationsanfragen konnten nicht geladen werden",
    "Không thể tải yêu cầu kiểm duyệt",
  ),
  unavailableDescription: t(
    "Administrator moderation is temporarily unavailable.",
    "Moderacja administratora jest tymczasowo niedostępna.",
    "Die Administratormoderation ist vorübergehend nicht verfügbar.",
    "Tính năng kiểm duyệt tạm thời không khả dụng.",
  ),
  administratorRequiredTitle: t(
    "Administrator access required",
    "Wymagany dostęp administratora",
    "Administratorzugriff erforderlich",
    "Cần quyền quản trị viên",
  ),
  administratorRequiredDescription: t(
    "This queue is available only to allowlisted administrators.",
    "Ta kolejka jest dostępna tylko dla dozwolonych administratorów.",
    "Diese Warteschlange ist nur für freigegebene Administratoren verfügbar.",
    "Hàng đợi này chỉ dành cho quản trị viên được cho phép.",
  ),
  emptyTitle: t(
    "No moderation requests",
    "Brak zgłoszeń",
    "Keine Moderationsanfragen",
    "Không có yêu cầu kiểm duyệt",
  ),
  emptyDescription: t(
    "No requests match the current filters.",
    "Brak zgłoszeń pasujących do filtrów.",
    "Keine Anfragen entsprechen den aktuellen Filtern.",
    "Không có yêu cầu phù hợp với bộ lọc.",
  ),
  firstPage: t("First page", "Pierwsza strona", "Erste Seite", "Trang đầu"),
  next: t("Next", "Następna", "Weiter", "Tiếp"),
  reviewRequest: t("Review request", "Przejrzyj zgłoszenie", "Anfrage prüfen", "Xem yêu cầu"),
  seller: t("Seller", "Sprzedawca", "Verkäufer", "Nhà bán"),
  productCode: t("Product code", "Kod produktu", "Produktcode", "Mã sản phẩm"),
  notAssigned: t("Not assigned", "Nie przypisano", "Nicht zugewiesen", "Chưa gán"),
  revision: t("Revision", "Wersja", "Revision", "Phiên bản"),
  submitted: t("Submitted", "Wysłano", "Eingereicht", "Đã gửi"),
  reviewState: t("Review", "Moderacja", "Prüfung", "Kiểm duyệt"),
  activation: t("Activation", "Aktywacja", "Aktivierung", "Kích hoạt"),
  previewPending: t(
    "Preview pending",
    "Podgląd oczekuje",
    "Vorschau ausstehend",
    "Bản xem trước đang chờ",
  ),
  previewLoading: t(
    "Loading preview",
    "Wczytywanie podglądu",
    "Vorschau wird geladen",
    "Đang tải bản xem trước",
  ),
  previewFailed: t(
    "Preview failed",
    "Podgląd nie powiódł się",
    "Vorschau fehlgeschlagen",
    "Bản xem trước thất bại",
  ),
  previewMissing: t("No preview", "Brak podglądu", "Keine Vorschau", "Không có bản xem trước"),
  previewUnavailable: t(
    "Preview unavailable",
    "Podgląd niedostępny",
    "Vorschau nicht verfügbar",
    "Bản xem trước không khả dụng",
  ),
  untitledProduct: t(
    "Untitled product",
    "Produkt bez tytułu",
    "Unbenanntes Produkt",
    "Sản phẩm chưa có tiêu đề",
  ),
};

const submissionTypeLabels: Record<AdministratorModerationSubmissionType, T> = {
  new_seller: t("New seller", "Nowy sprzedawca", "Neuer Verkäufer", "Nhà bán mới"),
  seller_update: t(
    "Seller update",
    "Aktualizacja sprzedawcy",
    "Verkäuferänderung",
    "Cập nhật nhà bán",
  ),
  initial_product: t("New product", "Nowy produkt", "Neues Produkt", "Sản phẩm mới"),
  product_update: t(
    "Product update",
    "Aktualizacja produktu",
    "Produktänderung",
    "Cập nhật sản phẩm",
  ),
};

const reviewStatusLabels: Record<AdministratorModerationRequest["reviewStatus"], T> = {
  pending: t("Pending", "Oczekuje", "Ausstehend", "Đang chờ"),
  changes_requested: t(
    "Changes requested",
    "Wymagane zmiany",
    "Änderungen angefordert",
    "Yêu cầu thay đổi",
  ),
  approved: t("Approved", "Zatwierdzone", "Genehmigt", "Đã duyệt"),
  rejected: t("Rejected", "Odrzucone", "Abgelehnt", "Bị từ chối"),
  withdrawn: t("Withdrawn", "Wycofane", "Zurückgezogen", "Đã rút"),
};

const activationStatusLabels: Record<AdministratorModerationActivationStatus, T> = {
  pending: t("Pending", "Oczekuje", "Ausstehend", "Đang chờ"),
  running: t("Running", "W toku", "Läuft", "Đang chạy"),
  failed: t("Failed", "Niepowodzenie", "Fehlgeschlagen", "Thất bại"),
  cleanup_required: t(
    "Cleanup required",
    "Wymagane czyszczenie",
    "Bereinigung erforderlich",
    "Cần dọn dẹp",
  ),
  completed: t("Completed", "Zakończone", "Abgeschlossen", "Hoàn tất"),
  abandoned: t("Abandoned", "Porzucone", "Abgebrochen", "Đã hủy"),
};

const activationDisplayLabels: Record<
  NonNullable<AdministratorModerationQueueItem["activation"]>["displayState"],
  T
> = {
  waiting_for_dispatch: t(
    "Waiting for dispatch",
    "Oczekuje na uruchomienie",
    "Wartet auf Start",
    "Đang chờ khởi chạy",
  ),
  dispatch_failed: t(
    "Dispatch failed",
    "Uruchomienie nie powiodło się",
    "Start fehlgeschlagen",
    "Khởi chạy thất bại",
  ),
  publishing: t("Publishing", "Publikowanie", "Veröffentlichung", "Đang xuất bản"),
  activation_failed: t(
    "Activation failed",
    "Aktywacja nie powiodła się",
    "Aktivierung fehlgeschlagen",
    "Kích hoạt thất bại",
  ),
  abandonment_cleanup: t(
    "Cleaning abandoned publication",
    "Czyszczenie porzuconej publikacji",
    "Abgebrochene Veröffentlichung wird bereinigt",
    "Đang dọn bản xuất bản đã hủy",
  ),
  abandonment_cleanup_required: t(
    "Abandonment cleanup required",
    "Wymagane czyszczenie porzucenia",
    "Abbruchbereinigung erforderlich",
    "Cần dọn dẹp sau khi hủy",
  ),
  public_cleanup: t(
    "Cleaning temporary files",
    "Czyszczenie plików tymczasowych",
    "Temporäre Dateien werden bereinigt",
    "Đang dọn tệp tạm",
  ),
  public_cleanup_required: t(
    "Public cleanup required",
    "Wymagane czyszczenie publiczne",
    "Öffentliche Bereinigung erforderlich",
    "Cần dọn dẹp công khai",
  ),
  completed: t("Completed", "Zakończone", "Abgeschlossen", "Hoàn tất"),
  abandoned: t("Abandoned", "Porzucone", "Abgebrochen", "Đã hủy"),
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function AdministratorModerationQueueScreen({
  routeState,
  onRequestChange,
  client: providedClient,
}: AdministratorModerationQueueScreenProps) {
  const list = useServerFn(listAdministratorModerationRequests);
  const client = useMemo<AdministratorModerationQueueClient>(
    () => ({ list: (request) => list({ data: request }) }),
    [list],
  );
  return (
    <AdministratorModerationQueueScreenView
      routeState={routeState}
      onRequestChange={onRequestChange}
      client={providedClient ?? client}
    />
  );
}

export function AdministratorModerationQueueScreenView({
  routeState,
  onRequestChange,
  client,
}: Required<AdministratorModerationQueueScreenProps>) {
  const request = routeState.valid ? routeState.request : administratorModerationDefaultRequest();
  const stableRequest = useMemo<AdministratorModerationRequest>(
    () => ({
      activationStatus: request.activationStatus,
      cursor: request.cursor,
      limit: request.limit,
      reviewStatus: request.reviewStatus,
      sellerId: request.sellerId,
      submissionType: request.submissionType,
    }),
    [
      request.activationStatus,
      request.cursor,
      request.limit,
      request.reviewStatus,
      request.sellerId,
      request.submissionType,
    ],
  );
  const onRequestChangeRef = useRef(onRequestChange);
  onRequestChangeRef.current = onRequestChange;
  const retainSnapshot = useRef(false);
  const [page, setPage] = useState<AdministratorModerationPage | null>(null);
  const [loading, setLoading] = useState(routeState.valid);
  const [loadRequest, setLoadRequest] = useState(0);
  const [loadError, setLoadError] = useState<QueueLoadError | null>(null);
  const [localPreviewFailures, setLocalPreviewFailures] = useState<Set<string>>(new Set());
  const [filterError, setFilterError] = useState(false);
  const [submissionTypeInput, setSubmissionTypeInput] = useState<
    AdministratorModerationSubmissionType | ""
  >(request.submissionType ?? "");
  const [reviewStatusInput, setReviewStatusInput] = useState(request.reviewStatus);
  const [activationStatusInput, setActivationStatusInput] = useState<
    AdministratorModerationActivationStatus | ""
  >(request.activationStatus ?? "");
  const [sellerIdInput, setSellerIdInput] = useState(request.sellerId ?? "");
  const [limitInput, setLimitInput] = useState(String(request.limit));

  useEffect(() => {
    setSubmissionTypeInput(stableRequest.submissionType ?? "");
    setReviewStatusInput(stableRequest.reviewStatus);
    setActivationStatusInput(stableRequest.activationStatus ?? "");
    setSellerIdInput(stableRequest.sellerId ?? "");
    setLimitInput(String(stableRequest.limit));
    setFilterError(false);
  }, [stableRequest]);

  useEffect(() => {
    if (!routeState.valid) {
      setPage(null);
      setLoadError("invalid");
      setLoading(false);
      return;
    }

    let cancelled = false;
    let redirectingFromStaleCursor = false;
    const keepPage = retainSnapshot.current;
    retainSnapshot.current = false;
    if (!keepPage) {
      setPage(null);
      setLocalPreviewFailures(new Set());
    }
    setLoadError(null);
    setLoading(true);

    void client
      .list(stableRequest)
      .then((nextPage) => {
        if (cancelled) return;
        if (stableRequest.cursor && nextPage.items.length === 0) {
          redirectingFromStaleCursor = true;
          onRequestChangeRef.current({ ...stableRequest, cursor: null });
          return;
        }
        setPage(nextPage);
        setLocalPreviewFailures(new Set());
      })
      .catch((error) => {
        if (cancelled) return;
        const nextError = queueLoadError(error);
        if (nextError === "unauthorized" || nextError === "invalid") setPage(null);
        setLoadError(nextError);
      })
      .finally(() => {
        if (!cancelled && !redirectingFromStaleCursor) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, loadRequest, routeState.valid, stableRequest]);

  function submitFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const limit = Number(limitInput);
    const sellerId = sellerIdInput.trim();
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (sellerId.length > 0 && !uuidPattern.test(sellerId))
    ) {
      setFilterError(true);
      return;
    }
    try {
      const nextRequest = parseAdministratorModerationRequest({
        submissionType: submissionTypeInput || null,
        reviewStatus: reviewStatusInput,
        activationStatus: activationStatusInput || null,
        sellerId: sellerId || null,
        limit,
        cursor: null,
      });
      setFilterError(false);
      onRequestChange(nextRequest);
    } catch {
      setFilterError(true);
    }
  }

  function resetToPending() {
    setFilterError(false);
    onRequestChange(administratorModerationDefaultRequest());
  }

  function refresh() {
    retainSnapshot.current = true;
    setLoadRequest((value) => value + 1);
  }

  if (!routeState.valid || loadError === "invalid") {
    return (
      <QueueShell>
        <Alert variant="destructive">
          <AlertTitle>{tr(S.invalidRequestTitle)}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{tr(S.invalidRequestDescription)}</p>
            <Button type="button" variant="outline" size="sm" onClick={resetToPending}>
              {tr(S.resetPending)}
            </Button>
          </AlertDescription>
        </Alert>
      </QueueShell>
    );
  }

  if (loadError === "unauthorized") {
    return (
      <QueueShell>
        <Alert variant="destructive">
          <AlertTitle>{tr(S.administratorRequiredTitle)}</AlertTitle>
          <AlertDescription>{tr(S.administratorRequiredDescription)}</AlertDescription>
        </Alert>
      </QueueShell>
    );
  }

  const linkRequest: AdministratorModerationRequest = page
    ? { ...page.normalizedFilters, cursor: stableRequest.cursor }
    : stableRequest;

  return (
    <QueueShell>
      <Card>
        <CardHeader>
          <CardTitle>{tr(S.filters)}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 lg:grid-cols-3 xl:grid-cols-6"
            onSubmit={submitFilters}
            noValidate
          >
            <FilterSelect
              label={tr(S.submissionType)}
              value={submissionTypeInput}
              onChange={(value) => {
                const next = value as AdministratorModerationSubmissionType | "";
                setSubmissionTypeInput(next);
                if (next === "new_seller" || next === "seller_update") {
                  setActivationStatusInput("");
                }
              }}
            >
              <option value="">{tr(S.allSubmissionTypes)}</option>
              {ADMINISTRATOR_MODERATION_SUBMISSION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {tr(submissionTypeLabels[value])}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label={tr(S.reviewStatus)}
              value={reviewStatusInput}
              onChange={(value) => {
                const next = value as AdministratorModerationRequest["reviewStatus"];
                setReviewStatusInput(next);
                if (next !== "approved") setActivationStatusInput("");
              }}
            >
              {ADMINISTRATOR_MODERATION_REVIEW_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {tr(reviewStatusLabels[value])}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label={tr(S.activationStatus)}
              value={activationStatusInput}
              onChange={(value) => {
                const next = value as AdministratorModerationActivationStatus | "";
                setActivationStatusInput(next);
                if (next) {
                  setReviewStatusInput("approved");
                  if (
                    submissionTypeInput === "new_seller" ||
                    submissionTypeInput === "seller_update"
                  ) {
                    setSubmissionTypeInput("");
                  }
                }
              }}
            >
              <option value="">{tr(S.allActivationStatuses)}</option>
              {ADMINISTRATOR_MODERATION_ACTIVATION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {tr(activationStatusLabels[value])}
                </option>
              ))}
            </FilterSelect>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{tr(S.sellerId)}</span>
              <input
                aria-label={tr(S.sellerId)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-xs"
                placeholder={tr(S.sellerIdPlaceholder)}
                value={sellerIdInput}
                onChange={(event) => setSellerIdInput(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{tr(S.pageSize)}</span>
              <input
                aria-label={tr(S.pageSize)}
                className="h-10 w-full rounded-md border border-input bg-background px-3"
                type="number"
                min={1}
                max={100}
                value={limitInput}
                onChange={(event) => setLimitInput(event.target.value)}
              />
            </label>
            <div className="flex items-end gap-2">
              <Button type="submit">{tr(S.applyFilters)}</Button>
              <Button type="button" variant="outline" onClick={resetToPending}>
                {tr(S.resetPending)}
              </Button>
            </div>
          </form>
          {filterError ? (
            <p className="mt-3 text-sm text-destructive">{tr(S.invalidFilters)}</p>
          ) : null}
        </CardContent>
      </Card>

      {loadError === "unavailable" ? (
        <Alert variant="destructive">
          <AlertTitle>{tr(S.unavailableTitle)}</AlertTitle>
          <AlertDescription>{tr(S.unavailableDescription)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {loading && page ? (
          <p role="status" className="text-sm text-muted-foreground">
            {tr(S.refreshing)}
          </p>
        ) : (
          <span />
        )}
        <Button type="button" variant="outline" disabled={loading} onClick={refresh}>
          {tr(S.refresh)}
        </Button>
      </div>

      {!page && loading ? <QueueSkeleton /> : null}

      {page && page.items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{tr(S.emptyTitle)}</CardTitle>
            <CardDescription>{tr(S.emptyDescription)}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {page?.items.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {page.items.map((item) => (
            <ModerationQueueCard
              key={`${item.submissionType}:${item.submissionId}`}
              item={item}
              lang={routeState.lang}
              request={linkRequest}
              previewFailed={localPreviewFailures.has(item.submissionId)}
              onPreviewError={() =>
                setLocalPreviewFailures((current) => new Set(current).add(item.submissionId))
              }
            />
          ))}
        </div>
      ) : null}

      {page ? (
        <nav
          aria-label={tr(S.title)}
          className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
        >
          <Button
            type="button"
            variant="outline"
            disabled={!stableRequest.cursor || loading}
            onClick={() => onRequestChange({ ...stableRequest, cursor: null })}
          >
            {tr(S.firstPage)}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!page.nextCursor || loading || Boolean(loadError)}
            onClick={() =>
              page.nextCursor && onRequestChange({ ...stableRequest, cursor: page.nextCursor })
            }
          >
            {tr(S.next)}
          </Button>
        </nav>
      ) : null}
    </QueueShell>
  );
}

function QueueShell({ children }: { children: React.ReactNode }) {
  return (
    <ClassifierImportShell>
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl font-semibold">{tr(S.title)}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{tr(S.description)}</p>
        </header>
        {children}
      </div>
    </ClassifierImportShell>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        aria-label={label}
        className="h-10 w-full rounded-md border border-input bg-background px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function ModerationQueueCard({
  item,
  lang,
  request,
  previewFailed,
  onPreviewError,
}: {
  item: AdministratorModerationQueueItem;
  lang: Lang;
  request: AdministratorModerationRequest;
  previewFailed: boolean;
  onPreviewError(): void;
}) {
  const title =
    item.product?.title.trim() || (item.product ? tr(S.untitledProduct) : item.seller.name);
  return (
    <Card className="overflow-hidden">
      <div className="grid min-h-52 grid-cols-1 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <ModerationPreview
          item={item}
          title={title}
          failed={previewFailed}
          onError={onPreviewError}
        />
        <div className="flex min-w-0 flex-col">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="break-words">{title}</CardTitle>
                <CardDescription>{tr(submissionTypeLabels[item.submissionType])}</CardDescription>
              </div>
              <Badge variant={item.reviewStatus === "pending" ? "secondary" : "outline"}>
                {tr(reviewStatusLabels[item.reviewStatus])}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Definition label={tr(S.seller)} value={item.seller.name} />
              {item.product ? (
                <Definition
                  label={tr(S.productCode)}
                  value={item.product.productCode ?? tr(S.notAssigned)}
                  mono={item.product.productCode !== null}
                />
              ) : null}
              <Definition label={tr(S.revision)} value={String(item.revision)} />
              <Definition label={tr(S.submitted)} value={formatDate(item.submittedAt, lang)} />
              <Definition
                label={tr(S.reviewState)}
                value={tr(reviewStatusLabels[item.reviewStatus])}
              />
              {item.activation ? (
                <Definition
                  label={tr(S.activation)}
                  value={tr(activationDisplayLabels[item.activation.displayState])}
                />
              ) : null}
            </dl>
            <Button asChild className="mt-auto self-start">
              <a
                href={buildAdministratorModerationDetailHref(
                  item.submissionType,
                  item.submissionId,
                  request,
                  lang,
                )}
              >
                {tr(S.reviewRequest)}
              </a>
            </Button>
          </CardContent>
        </div>
      </div>
    </Card>
  );
}

function ModerationPreview({
  item,
  title,
  failed,
  onError,
}: {
  item: AdministratorModerationQueueItem;
  title: string;
  failed: boolean;
  onError(): void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const deliveryUrl = item.preview.deliveryStatus === "available" ? item.preview.url : null;
  const requiresAuthenticatedFetch =
    item.preview.kind === "seller_logo" || item.preview.kind === "seller_cover";

  useEffect(() => {
    let currentObjectUrl: string | null = null;
    const controller = new AbortController();
    setObjectUrl(null);
    if (!requiresAuthenticatedFetch || !deliveryUrl || failed) {
      return () => controller.abort();
    }

    void (async () => {
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) throw new Error("authentication_required");
        const response = await fetch(deliveryUrl, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("seller_profile_image_not_found");
        currentObjectUrl = URL.createObjectURL(await response.blob());
        setObjectUrl(currentObjectUrl);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        onErrorRef.current();
      }
    })();

    return () => {
      controller.abort();
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    };
  }, [deliveryUrl, failed, requiresAuthenticatedFetch]);

  const imageUrl = requiresAuthenticatedFetch ? objectUrl : deliveryUrl;
  if (item.preview.deliveryStatus === "available" && imageUrl && !failed) {
    return (
      <div className="aspect-square bg-muted sm:aspect-auto">
        <img
          src={imageUrl}
          alt={`${title} preview`}
          className="h-full w-full object-cover"
          onError={onError}
        />
      </div>
    );
  }
  const state =
    !failed && requiresAuthenticatedFetch && deliveryUrl
      ? "loading"
      : failed
        ? "unavailable"
        : item.preview.deliveryStatus;
  const label =
    state === "loading"
      ? S.previewLoading
      : state === "pending"
        ? S.previewPending
        : state === "failed"
          ? S.previewFailed
          : state === "missing"
            ? S.previewMissing
            : S.previewUnavailable;
  return (
    <div className="flex aspect-square items-center justify-center bg-muted p-4 text-center text-sm text-muted-foreground sm:aspect-auto">
      {tr(label)}
    </div>
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
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-words ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div aria-label={tr(S.loading)} className="grid gap-4 lg:grid-cols-2">
      {[0, 1, 2, 3].map((value) => (
        <Card key={value}>
          <CardContent className="grid min-h-52 grid-cols-[11rem_minmax(0,1fr)] gap-4 p-4">
            <Skeleton className="h-full min-h-44" />
            <div className="space-y-4">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-20 w-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

type QueueLoadError = "invalid" | "unauthorized" | "unavailable";

function queueLoadError(error: unknown): QueueLoadError {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : null;
  if (code === "prototype_administrator_required") return "unauthorized";
  if (code === "moderation_request_invalid") return "invalid";
  return "unavailable";
}

function formatDate(value: string, lang: Lang): string {
  const locales: Record<Lang, string> = { EN: "en", PL: "pl", DE: "de", VI: "vi" };
  return new Intl.DateTimeFormat(locales[lang], { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
