import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { t, tr, useLang, type Lang, type T } from "@/lib/i18n";

import { listAdminProductDrafts } from "../admin-product-draft-index.functions";
import { buildAdminProductDraftReviewHref } from "../admin-product-draft-index.navigation";
import {
  ADMIN_PRODUCT_DRAFT_INDEX_DEFAULT_LIMIT,
  type AdminProductDraftIndexItem,
  type AdminProductDraftIndexPage,
  type AdminProductDraftIndexRequest,
  type AdminProductDraftStatus,
} from "../admin-product-draft-index.types";
import { ClassifierImportShell } from "../components/classifier-import-shell";

export type AdminProductDraftIndexClient = {
  list(request: AdminProductDraftIndexRequest): Promise<AdminProductDraftIndexPage>;
};

export type AdminProductDraftIndexScreenProps = {
  request: AdminProductDraftIndexRequest;
  onRequestChange(request: AdminProductDraftIndexRequest): void;
  client?: AdminProductDraftIndexClient;
};

const S = {
  title: t("ProductDrafts", "Szkice produktów", "Produktentwürfe", "Bản nháp sản phẩm"),
  description: t(
    "Review ProductDrafts across destination stores before publication.",
    "Przejrzyj szkice produktów we wszystkich sklepach docelowych przed publikacją.",
    "Prüfen Sie Produktentwürfe aus allen Zielshops vor der Veröffentlichung.",
    "Xem lại các bản nháp sản phẩm trên mọi cửa hàng đích trước khi xuất bản.",
  ),
  filters: t("Filters", "Filtry", "Filter", "Bộ lọc"),
  status: t("Status", "Status", "Status", "Trạng thái"),
  allStatuses: t("All statuses", "Wszystkie statusy", "Alle Status", "Mọi trạng thái"),
  sellerId: t(
    "Seller ID (exact)",
    "Identyfikator sprzedawcy (dokładny)",
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
  clearFilters: t("Clear filters", "Wyczyść filtry", "Filter löschen", "Xóa bộ lọc"),
  invalidFilters: t(
    "Enter a page size from 1 to 100 and a valid seller identifier.",
    "Wprowadź rozmiar strony od 1 do 100 oraz prawidłowy identyfikator sprzedawcy.",
    "Geben Sie eine Seitengröße von 1 bis 100 und eine gültige Verkäufer-ID ein.",
    "Nhập kích thước trang từ 1 đến 100 và mã nhà bán hợp lệ.",
  ),
  loading: t(
    "Loading ProductDrafts…",
    "Ładowanie szkiców produktów…",
    "Produktentwürfe werden geladen…",
    "Đang tải bản nháp sản phẩm…",
  ),
  refreshing: t(
    "Refreshing this ProductDraft page…",
    "Odświeżanie tej strony szkiców produktów…",
    "Diese Produktentwurf-Seite wird aktualisiert…",
    "Đang làm mới trang bản nháp sản phẩm này…",
  ),
  loadErrorTitle: t(
    "ProductDrafts could not be loaded",
    "Nie można załadować szkiców produktów",
    "Produktentwürfe konnten nicht geladen werden",
    "Không thể tải bản nháp sản phẩm",
  ),
  retry: t("Try again", "Spróbuj ponownie", "Erneut versuchen", "Thử lại"),
  emptyTitle: t(
    "No ProductDrafts",
    "Brak szkiców produktów",
    "Keine Produktentwürfe",
    "Không có bản nháp sản phẩm",
  ),
  emptyDescription: t(
    "No ProductDrafts match the current filters.",
    "Żadne szkice produktów nie pasują do bieżących filtrów.",
    "Keine Produktentwürfe entsprechen den aktuellen Filtern.",
    "Không có bản nháp sản phẩm nào phù hợp với bộ lọc hiện tại.",
  ),
  untitled: t(
    "Untitled product",
    "Produkt bez tytułu",
    "Unbenanntes Produkt",
    "Sản phẩm chưa có tên",
  ),
  seller: t("Seller", "Sprzedawca", "Verkäufer", "Nhà bán"),
  category: t("Category", "Kategoria", "Kategorie", "Danh mục"),
  factsRevision: t("Facts revision", "Wersja danych", "Faktenrevision", "Phiên bản thông tin"),
  created: t("Created", "Utworzono", "Erstellt", "Đã tạo"),
  sourceBatch: t(
    "Classifier batch",
    "Partia klasyfikatora",
    "Klassifikator-Stapel",
    "Lô phân loại",
  ),
  review: t("Review draft", "Przejrzyj szkic", "Entwurf prüfen", "Xem bản nháp"),
  noCategory: t("Not assigned", "Nie przypisano", "Nicht zugewiesen", "Chưa gán"),
  noFacts: t("Not available", "Niedostępne", "Nicht verfügbar", "Không khả dụng"),
  sellerIdShort: t("Seller ID", "ID sprzedawcy", "Verkäufer-ID", "Mã nhà bán"),
  firstPage: t("First page", "Pierwsza strona", "Erste Seite", "Trang đầu"),
  next: t("Next", "Następna", "Weiter", "Tiếp"),
  previewPending: t(
    "Preview pending",
    "Podgląd oczekuje",
    "Vorschau ausstehend",
    "Bản xem trước đang chờ",
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
  previewRefreshFailed: t(
    "One or more previews could not be refreshed.",
    "Nie udało się odświeżyć co najmniej jednego podglądu.",
    "Mindestens eine Vorschau konnte nicht aktualisiert werden.",
    "Không thể làm mới một hoặc nhiều bản xem trước.",
  ),
  draft: t("Draft", "Szkic", "Entwurf", "Bản nháp"),
  published: t("Published", "Opublikowany", "Veröffentlicht", "Đã xuất bản"),
  archived: t("Archived", "Zarchiwizowany", "Archiviert", "Đã lưu trữ"),
};

const statusLabels: Record<AdminProductDraftStatus, T> = {
  draft: S.draft,
  published: S.published,
  archived: S.archived,
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function AdminProductDraftIndexScreen(props: AdminProductDraftIndexScreenProps) {
  const list = useServerFn(listAdminProductDrafts);
  const client = useMemo<AdminProductDraftIndexClient>(
    () => ({
      list: (request) => list({ data: request }),
    }),
    [list],
  );

  return <AdminProductDraftIndexScreenView {...props} client={props.client ?? client} />;
}

export function AdminProductDraftIndexScreenView({
  request,
  onRequestChange,
  client,
}: Required<AdminProductDraftIndexScreenProps>) {
  const lang = useLang();
  const { cursor, limit, sellerId, status } = request;
  const stableRequest = useMemo(
    () => ({ cursor, limit, sellerId, status }),
    [cursor, limit, sellerId, status],
  );
  const [page, setPage] = useState<AdminProductDraftIndexPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadRequest, setLoadRequest] = useState(0);
  const [filterError, setFilterError] = useState(false);
  const [limitInput, setLimitInput] = useState(String(request.limit));
  const [statusInput, setStatusInput] = useState<AdminProductDraftStatus | "">(
    request.status ?? "",
  );
  const [sellerInput, setSellerInput] = useState(request.sellerId ?? "");
  const [localUnavailable, setLocalUnavailable] = useState<Set<string>>(new Set());
  const [previewRefreshFailed, setPreviewRefreshFailed] = useState(false);
  const refreshInFlight = useRef(false);
  const replacementSnapshot = useRef(false);
  const pendingRefreshImageIds = useRef(new Set<string>());

  useEffect(() => {
    setLimitInput(String(stableRequest.limit));
    setStatusInput(stableRequest.status ?? "");
    setSellerInput(stableRequest.sellerId ?? "");
    setFilterError(false);
  }, [stableRequest]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    replacementSnapshot.current = false;
    refreshInFlight.current = false;
    pendingRefreshImageIds.current.clear();
    setLocalUnavailable(new Set());
    setPreviewRefreshFailed(false);

    void client
      .list(stableRequest)
      .then((nextPage) => {
        if (!cancelled) setPage(nextPage);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(adminProductDraftIndexErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, loadRequest, stableRequest]);

  const refreshPreviews = useCallback(
    (imageIds: string[], allowAfterReplacement: boolean) => {
      for (const imageId of imageIds) pendingRefreshImageIds.current.add(imageId);
      if (refreshInFlight.current) return;
      if (replacementSnapshot.current && !allowAfterReplacement) {
        const unavailableImageIds = [...pendingRefreshImageIds.current];
        pendingRefreshImageIds.current.clear();
        setLocalUnavailable((current) => new Set([...current, ...unavailableImageIds]));
        return;
      }

      refreshInFlight.current = true;
      setPreviewRefreshFailed(false);
      void client
        .list(stableRequest)
        .then((nextPage) => {
          setPage(nextPage);
          setLocalUnavailable(new Set());
          replacementSnapshot.current = true;
        })
        .catch(() => {
          const unavailableImageIds = [...pendingRefreshImageIds.current];
          setLocalUnavailable((current) => new Set([...current, ...unavailableImageIds]));
          setPreviewRefreshFailed(true);
        })
        .finally(() => {
          pendingRefreshImageIds.current.clear();
          refreshInFlight.current = false;
        });
    },
    [client, stableRequest],
  );

  useEffect(() => {
    if (!page) return;
    const available = page.items.filter(
      (item) =>
        item.previewImageId &&
        item.preview.deliveryStatus === "available" &&
        item.preview.expiresAt &&
        !localUnavailable.has(item.previewImageId),
    );
    if (available.length === 0) return;

    const earliestExpiry = Math.min(
      ...available.map((item) => Date.parse(item.preview.expiresAt!)),
    );
    const timer = window.setTimeout(
      () =>
        refreshPreviews(
          available.flatMap((item) => (item.previewImageId ? [item.previewImageId] : [])),
          true,
        ),
      Math.min(2_147_483_647, Math.max(0, earliestExpiry - Date.now())),
    );
    return () => window.clearTimeout(timer);
  }, [localUnavailable, page, refreshPreviews]);

  function submitFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const limit = Number(limitInput);
    const sellerId = sellerInput.trim();
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (sellerId.length > 0 && !uuidPattern.test(sellerId))
    ) {
      setFilterError(true);
      return;
    }
    setFilterError(false);
    onRequestChange({
      limit,
      cursor: null,
      status: statusInput || null,
      sellerId: sellerId || null,
    });
  }

  return (
    <ClassifierImportShell>
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl font-semibold">{tr(S.title)}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{tr(S.description)}</p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>{tr(S.filters)}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_9rem_auto]"
              onSubmit={submitFilters}
              noValidate
            >
              <label className="space-y-1 text-sm">
                <span className="font-medium">{tr(S.status)}</span>
                <select
                  aria-label={tr(S.status)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  value={statusInput}
                  onChange={(event) =>
                    setStatusInput(event.target.value as AdminProductDraftStatus | "")
                  }
                >
                  <option value="">{tr(S.allStatuses)}</option>
                  {Object.entries(statusLabels).map(([status, label]) => (
                    <option key={status} value={status}>
                      {tr(label)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{tr(S.sellerId)}</span>
                <input
                  aria-label={tr(S.sellerId)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-xs"
                  placeholder={tr(S.sellerIdPlaceholder)}
                  value={sellerInput}
                  onChange={(event) => setSellerInput(event.target.value)}
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    onRequestChange({
                      limit: ADMIN_PRODUCT_DRAFT_INDEX_DEFAULT_LIMIT,
                      cursor: null,
                      status: null,
                      sellerId: null,
                    })
                  }
                >
                  {tr(S.clearFilters)}
                </Button>
              </div>
            </form>
            {filterError ? (
              <p className="mt-3 text-sm text-destructive">{tr(S.invalidFilters)}</p>
            ) : null}
          </CardContent>
        </Card>

        {loadError ? (
          <Alert variant="destructive">
            <AlertTitle>{tr(S.loadErrorTitle)}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{loadError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLoadRequest((value) => value + 1)}
              >
                {tr(S.retry)}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {previewRefreshFailed ? (
          <p role="status" className="text-sm text-muted-foreground">
            {tr(S.previewRefreshFailed)}
          </p>
        ) : null}

        {!page && loading ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">{tr(S.loading)}</CardContent>
          </Card>
        ) : null}

        {page && loading ? (
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
          <div className="grid gap-4 lg:grid-cols-2">
            {page.items.map((item) => (
              <ProductDraftCard
                key={item.productDraftId}
                item={item}
                lang={lang}
                request={stableRequest}
                locallyUnavailable={
                  item.previewImageId ? localUnavailable.has(item.previewImageId) : false
                }
                onPreviewError={() => {
                  if (item.previewImageId) refreshPreviews([item.previewImageId], false);
                }}
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
      </div>
    </ClassifierImportShell>
  );
}

function ProductDraftCard({
  item,
  lang,
  request,
  locallyUnavailable,
  onPreviewError,
}: {
  item: AdminProductDraftIndexItem;
  lang: Lang;
  request: AdminProductDraftIndexRequest;
  locallyUnavailable: boolean;
  onPreviewError(): void;
}) {
  const title = item.title.trim() || tr(S.untitled);
  return (
    <Card className="overflow-hidden">
      <div className="grid min-h-52 grid-cols-1 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <ProductDraftPreview
          item={item}
          title={title}
          locallyUnavailable={locallyUnavailable}
          onError={onPreviewError}
        />
        <div className="flex min-w-0 flex-col">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <CardTitle className="break-words">{title}</CardTitle>
              <Badge variant={item.status === "draft" ? "secondary" : "outline"}>
                {tr(statusLabels[item.status])}
              </Badge>
            </div>
            <CardDescription className="break-all font-mono text-xs">
              {item.productDraftId}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Definition
                label={tr(S.seller)}
                value={`${item.seller.name} (${item.seller.slug})`}
              />
              <Definition label={tr(S.sellerIdShort)} value={item.seller.id} mono />
              <Definition
                label={tr(S.category)}
                value={
                  item.category ? `${item.category.name} (${item.category.slug})` : tr(S.noCategory)
                }
              />
              <Definition
                label={tr(S.factsRevision)}
                value={item.factsRevision === null ? tr(S.noFacts) : String(item.factsRevision)}
              />
              <Definition label={tr(S.created)} value={formatDate(item.createdAt, lang)} />
              {item.source ? (
                <Definition label={tr(S.sourceBatch)} value={item.source.classifierBatchId} mono />
              ) : null}
            </dl>
            <Button asChild className="mt-auto self-start">
              <a href={buildAdminProductDraftReviewHref(item.productDraftId, request, lang)}>
                {tr(S.review)}
              </a>
            </Button>
          </CardContent>
        </div>
      </div>
    </Card>
  );
}

function ProductDraftPreview({
  item,
  title,
  locallyUnavailable,
  onError,
}: {
  item: AdminProductDraftIndexItem;
  title: string;
  locallyUnavailable: boolean;
  onError(): void;
}) {
  if (item.preview.deliveryStatus === "available" && item.preview.url && !locallyUnavailable) {
    return (
      <div className="aspect-square bg-muted sm:aspect-auto">
        <img
          src={item.preview.url}
          alt={`${title} preview`}
          className="h-full w-full object-cover"
          onError={onError}
        />
      </div>
    );
  }

  const state = locallyUnavailable ? "unavailable" : item.preview.deliveryStatus;
  const label =
    state === "pending"
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

function formatDate(value: string, lang: Lang): string {
  const localeByLanguage: Record<Lang, string> = {
    EN: "en",
    PL: "pl",
    DE: "de",
    VI: "vi",
  };
  return new Intl.DateTimeFormat(localeByLanguage[lang], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function adminProductDraftIndexErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return tr(S.loadErrorTitle);
}
