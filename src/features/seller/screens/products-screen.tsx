import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  archiveMyProduct,
  listMyProducts,
  restoreMyProduct,
} from "@/features/seller/products.functions";
import { productCodeCopy } from "@/features/product-code/product-code.copy";
import type {
  SellerProductListItem,
  SellerProductListRequest,
  SellerProductPreview,
} from "@/features/seller/seller-product-list.types";
import type {
  ProductActivationDisplayState,
  ProductMarketplaceVisibility,
} from "@/features/seller/product-moderation-status.types";
import { t, tr } from "@/lib/i18n";
import { ClassifierAssistedUploadDisabledNotice } from "@/features/classifier-release/classifier-release-ui";
import { useClassifierAssistedUploadEnabled } from "@/features/classifier-release/classifier-release-runtime";

const S = {
  products: t("Products", "Produkty", "Produkte", "Sản phẩm"),
  description: t(
    "Draft products aren't visible until you publish them.",
    "Szkice produktów nie są widoczne do czasu ich opublikowania.",
    "Produktentwürfe sind erst nach der Veröffentlichung sichtbar.",
    "Sản phẩm nháp chưa hiển thị cho đến khi bạn xuất bản.",
  ),
  addManually: t(
    "Add product manually",
    "Dodaj produkt ręcznie",
    "Produkt manuell hinzufügen",
    "Thêm sản phẩm thủ công",
  ),
  automaticGrouping: t(
    "Upload photos for automatic grouping",
    "Prześlij zdjęcia do automatycznego grupowania",
    "Fotos zur automatischen Gruppierung hochladen",
    "Tải ảnh lên để tự động nhóm",
  ),
  loading: t("Loading…", "Ładowanie…", "Wird geladen…", "Đang tải…"),
  refreshing: t(
    "Refreshing images…",
    "Odświeżanie zdjęć…",
    "Bilder werden aktualisiert…",
    "Đang làm mới ảnh…",
  ),
  preview: t("Preview", "Podgląd", "Vorschau", "Xem trước"),
  title: t("Title", "Tytuł", "Titel", "Tiêu đề"),
  status: t("Status", "Status", "Status", "Trạng thái"),
  productStatus: t("Product", "Produkt", "Produkt", "Sản phẩm"),
  marketplaceStatus: t("Marketplace", "Rynek", "Marktplatz", "Marketplace"),
  reviewStatus: t("Review", "Weryfikacja", "Prüfung", "Kiểm duyệt"),
  activationStatus: t("Activation", "Aktywacja", "Aktivierung", "Kích hoạt"),
  price: t("Price", "Cena", "Preis", "Giá"),
  moq: t("Minimum order", "Minimalne zamówienie", "Mindestbestellmenge", "Đơn hàng tối thiểu"),
  actions: t("Actions", "Działania", "Aktionen", "Thao tác"),
  untitled: t(
    "Untitled product",
    "Produkt bez tytułu",
    "Unbenanntes Produkt",
    "Sản phẩm chưa có tên",
  ),
  edit: t("Edit", "Edytuj", "Bearbeiten", "Chỉnh sửa"),
  archive: t("Archive", "Archiwizuj", "Archivieren", "Lưu trữ"),
  archiveConfirm: t(
    "Archive this product? It will leave the public catalog. Any unsent product edits will be discarded.",
    "Zarchiwizować ten produkt? Zniknie z publicznego katalogu. Niezapisane zmiany produktu zostaną odrzucone.",
    "Dieses Produkt archivieren? Es wird aus dem öffentlichen Katalog entfernt. Nicht eingereichte Produktänderungen werden verworfen.",
    "Lưu trữ sản phẩm này? Sản phẩm sẽ rời khỏi danh mục công khai. Mọi chỉnh sửa chưa gửi sẽ bị hủy.",
  ),
  archiveSuccess: t(
    "Product archived",
    "Produkt zarchiwizowany",
    "Produkt archiviert",
    "Đã lưu trữ sản phẩm",
  ),
  archiveNotAllowed: t(
    "Wait for active publication or complete publication cleanup before archiving this product.",
    "Poczekaj na zakończenie publikacji lub dokończ jej czyszczenie przed zarchiwizowaniem produktu.",
    "Warten Sie auf den Abschluss der Veröffentlichung oder schließen Sie deren Bereinigung ab, bevor Sie das Produkt archivieren.",
    "Hãy chờ xuất bản hoàn tất hoặc hoàn tất dọn dẹp xuất bản trước khi lưu trữ sản phẩm.",
  ),
  productNotFound: t(
    "The product was not found.",
    "Nie znaleziono produktu.",
    "Das Produkt wurde nicht gefunden.",
    "Không tìm thấy sản phẩm.",
  ),
  archiveUnavailable: t(
    "Product archive and restore are temporarily unavailable.",
    "Archiwizacja produktu jest tymczasowo niedostępna.",
    "Die Produktarchivierung ist vorübergehend nicht verfügbar.",
    "Tính năng lưu trữ sản phẩm tạm thời không khả dụng.",
  ),
  noProducts: t(
    "No products yet.",
    "Nie ma jeszcze produktów.",
    "Noch keine Produkte.",
    "Chưa có sản phẩm.",
  ),
  firstPage: t("First page", "Pierwsza strona", "Erste Seite", "Trang đầu"),
  nextPage: t("Next page", "Następna strona", "Nächste Seite", "Trang tiếp"),
  noImage: t("No image", "Brak zdjęcia", "Kein Bild", "Không có ảnh"),
  pending: t("Image pending", "Zdjęcie oczekuje", "Bild ausstehend", "Ảnh đang chờ"),
  failed: t("Image failed", "Błąd zdjęcia", "Bild fehlgeschlagen", "Ảnh bị lỗi"),
  missing: t("Image missing", "Brak zdjęcia", "Bild fehlt", "Thiếu ảnh"),
  unavailable: t(
    "Image unavailable",
    "Zdjęcie niedostępne",
    "Bild nicht verfügbar",
    "Ảnh không khả dụng",
  ),
  listUnavailable: t(
    "Products could not be loaded.",
    "Nie udało się załadować produktów.",
    "Produkte konnten nicht geladen werden.",
    "Không thể tải sản phẩm.",
  ),
  previewsUnavailable: t(
    "Some product previews are temporarily unavailable. Product actions remain available.",
    "Niektóre podglądy produktów są tymczasowo niedostępne. Działania na produktach pozostają dostępne.",
    "Einige Produktvorschauen sind vorübergehend nicht verfügbar. Produktaktionen bleiben verfügbar.",
    "Một số ảnh xem trước tạm thời không khả dụng. Các thao tác sản phẩm vẫn dùng được.",
  ),
  refreshFailed: t(
    "One or more image links could not be refreshed.",
    "Nie udało się odświeżyć co najmniej jednego odnośnika do zdjęcia.",
    "Mindestens ein Bildlink konnte nicht aktualisiert werden.",
    "Không thể làm mới một hoặc nhiều liên kết ảnh.",
  ),
  retry: t("Try again", "Spróbuj ponownie", "Erneut versuchen", "Thử lại"),
  draft: t("Draft", "Szkic", "Entwurf", "Bản nháp"),
  published: t("Published", "Opublikowany", "Veröffentlicht", "Đã xuất bản"),
  archived: t("Archived", "Zarchiwizowany", "Archiviert", "Đã lưu trữ"),
  notSubmitted: t("Not submitted", "Niewysłany", "Nicht eingereicht", "Chưa gửi"),
  draftChanges: t("Draft changes", "Zmiany robocze", "Entwurfsänderungen", "Thay đổi nháp"),
  pendingReview: t(
    "Pending review",
    "Oczekuje na weryfikację",
    "Prüfung ausstehend",
    "Đang chờ duyệt",
  ),
  changesRequested: t(
    "Changes requested",
    "Wymagane zmiany",
    "Änderungen angefordert",
    "Yêu cầu thay đổi",
  ),
  rejected: t("Rejected", "Odrzucony", "Abgelehnt", "Bị từ chối"),
  withdrawn: t("Withdrawn", "Wycofany", "Zurückgezogen", "Đã rút"),
  approved: t("Approved", "Zatwierdzony", "Genehmigt", "Đã duyệt"),
  notStarted: t("Not started", "Nierozpoczęta", "Nicht gestartet", "Chưa bắt đầu"),
  waitingForDispatch: t(
    "Waiting for dispatch",
    "Oczekuje na wysłanie",
    "Wartet auf Versand",
    "Đang chờ gửi",
  ),
  dispatchFailed: t(
    "Dispatch failed",
    "Wysłanie nie powiodło się",
    "Versand fehlgeschlagen",
    "Gửi thất bại",
  ),
  publishing: t("Publishing", "Publikowanie", "Veröffentlichung", "Đang xuất bản"),
  activationFailed: t(
    "Activation failed",
    "Aktywacja nie powiodła się",
    "Aktivierung fehlgeschlagen",
    "Kích hoạt thất bại",
  ),
  abandonmentCleanup: t(
    "Abandonment cleanup",
    "Czyszczenie po anulowaniu",
    "Abbruchbereinigung",
    "Dọn dẹp sau hủy",
  ),
  abandonmentCleanupRequired: t(
    "Abandonment cleanup required",
    "Wymagane czyszczenie po anulowaniu",
    "Abbruchbereinigung erforderlich",
    "Cần dọn dẹp sau hủy",
  ),
  publicCleanup: t(
    "Public cleanup",
    "Czyszczenie publiczne",
    "Öffentliche Bereinigung",
    "Dọn dẹp công khai",
  ),
  publicCleanupRequired: t(
    "Public cleanup required",
    "Wymagane czyszczenie publiczne",
    "Öffentliche Bereinigung erforderlich",
    "Cần dọn dẹp công khai",
  ),
  completed: t("Completed", "Zakończona", "Abgeschlossen", "Hoàn tất"),
  abandoned: t("Abandoned", "Anulowana", "Abgebrochen", "Đã hủy"),
  activeProducts: t(
    "Active products",
    "Aktywne produkty",
    "Aktive Produkte",
    "Sản phẩm đang hoạt động",
  ),
  archivedProducts: t(
    "Archived products",
    "Zarchiwizowane produkty",
    "Archivierte Produkte",
    "Sản phẩm đã lưu trữ",
  ),
  restore: t("Restore", "Przywróć", "Wiederherstellen", "Khôi phục"),
  continueEditing: t(
    "Continue editing",
    "Kontynuuj edycję",
    "Weiter bearbeiten",
    "Tiếp tục chỉnh sửa",
  ),
  restoreSuccess: t(
    "Restoration draft created",
    "Utworzono szkic przywracania",
    "Wiederherstellungsentwurf erstellt",
    "Đã tạo bản nháp khôi phục",
  ),
  moderationActive: t(
    "Complete or safely abandon active publication work before trying again.",
    "Zakończ lub bezpiecznie porzuć aktywne publikowanie przed ponowną próbą.",
    "Schließen Sie die aktive Veröffentlichung ab oder brechen Sie sie sicher ab, bevor Sie es erneut versuchen.",
    "Hoàn tất hoặc hủy an toàn công việc xuất bản đang hoạt động trước khi thử lại.",
  ),
  revisionConflict: t(
    "The product changed. Refresh the list and try again.",
    "Produkt uległ zmianie. Odśwież listę i spróbuj ponownie.",
    "Das Produkt wurde geändert. Aktualisieren Sie die Liste und versuchen Sie es erneut.",
    "Sản phẩm đã thay đổi. Hãy làm mới danh sách rồi thử lại.",
  ),
  restoreNotAllowed: t(
    "This archived product cannot be restored.",
    "Tego zarchiwizowanego produktu nie można przywrócić.",
    "Dieses archivierte Produkt kann nicht wiederhergestellt werden.",
    "Không thể khôi phục sản phẩm đã lưu trữ này.",
  ),
  requestConflict: t(
    "This action could not be replayed. Refresh the list and try again.",
    "Nie można ponowić tej operacji. Odśwież listę i spróbuj ponownie.",
    "Diese Aktion konnte nicht wiederholt werden. Aktualisieren Sie die Liste und versuchen Sie es erneut.",
    "Không thể phát lại thao tác này. Hãy làm mới danh sách rồi thử lại.",
  ),
};

export type ProductsScreenProps = {
  request: SellerProductListRequest;
  onRequestChange(request: SellerProductListRequest): void;
  notice?: string;
};

export function ProductsScreen({ request, onRequestChange, notice }: ProductsScreenProps) {
  const listProducts = useServerFn(listMyProducts);
  const archive = useServerFn(archiveMyProduct);
  const restore = useServerFn(restoreMyProduct);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [locallyUnavailable, setLocallyUnavailable] = useState<Set<string>>(new Set());
  const [refreshError, setRefreshError] = useState(false);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const pendingRefreshImageIds = useRef(new Set<string>());
  const replacementPendingImageIds = useRef(new Set<string>());
  const archiveRequestIds = useRef(new Map<string, string>());
  const restoreRequestIds = useRef(new Map<string, string>());

  const query = useQuery({
    queryKey: ["my-products", request.status, request.limit, request.cursor],
    queryFn: () => listProducts({ data: request }),
  });
  const { data, refetch } = query;

  useEffect(() => {
    setLocallyUnavailable(new Set());
    setRefreshError(false);
    refreshInFlight.current = null;
    pendingRefreshImageIds.current.clear();
    replacementPendingImageIds.current.clear();
  }, [request.status, request.limit, request.cursor]);

  const markUnavailable = useCallback((keys: string[]) => {
    if (keys.length === 0) return;
    setLocallyUnavailable((current) => new Set([...current, ...keys]));
  }, []);

  const refreshPrivatePreviews = useCallback(
    (imageIds: string[]) => {
      for (const imageId of imageIds) {
        if (replacementPendingImageIds.current.has(imageId)) {
          markUnavailable([imageId]);
          continue;
        }
        replacementPendingImageIds.current.add(imageId);
        pendingRefreshImageIds.current.add(imageId);
      }
      if (pendingRefreshImageIds.current.size === 0) {
        return refreshInFlight.current ?? Promise.resolve();
      }
      if (refreshInFlight.current) return refreshInFlight.current;

      setRefreshError(false);
      const refresh = refetch()
        .then((result) => {
          if (result.error || !result.data)
            throw result.error ?? new Error("Preview refresh failed.");
        })
        .catch(() => {
          markUnavailable([...pendingRefreshImageIds.current]);
          setRefreshError(true);
        })
        .finally(() => {
          pendingRefreshImageIds.current.clear();
          refreshInFlight.current = null;
        });
      refreshInFlight.current = refresh;
      return refresh;
    },
    [markUnavailable, refetch],
  );

  useEffect(() => {
    const available = (data?.products ?? []).flatMap((product) => {
      const preview = product.preview;
      return preview.source === "private_draft" &&
        preview.deliveryStatus === "available" &&
        preview.imageId &&
        preview.expiresAt &&
        !locallyUnavailable.has(preview.imageId)
        ? [{ imageId: preview.imageId, expiresAt: Date.parse(preview.expiresAt) }]
        : [];
    });
    if (available.length === 0) return;

    const earliestExpiry = Math.min(...available.map((preview) => preview.expiresAt));
    const expiringImageIds = available
      .filter((preview) => preview.expiresAt <= earliestExpiry)
      .map((preview) => preview.imageId);
    const timer = window.setTimeout(
      () => void refreshPrivatePreviews(expiringImageIds),
      Math.min(2_147_483_647, Math.max(0, earliestExpiry - Date.now())),
    );
    return () => window.clearTimeout(timer);
  }, [data, locallyUnavailable, refreshPrivatePreviews]);

  async function handleArchive(id: string, expectedModerationRevision: number) {
    if (!window.confirm(tr(S.archiveConfirm))) return;
    const requestId = operationRequestId(archiveRequestIds.current, id);
    try {
      await archive({ data: { id, expectedModerationRevision, requestId } });
      archiveRequestIds.current.delete(id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-products"] }),
        queryClient.invalidateQueries({ queryKey: ["my-product-summary"] }),
      ]);
      toast.success(tr(S.archiveSuccess));
      if (request.cursor && data?.products.length === 1) {
        onRequestChange({ ...request, cursor: null });
      }
    } catch (error) {
      if (hasStableErrorCode(error)) archiveRequestIds.current.delete(id);
      toast.error(productArchiveErrorMessage(error));
    }
  }

  async function handleRestore(id: string, expectedModerationRevision: number) {
    const requestId = operationRequestId(restoreRequestIds.current, id);
    try {
      const result = await restore({ data: { id, expectedModerationRevision, requestId } });
      restoreRequestIds.current.delete(id);
      await queryClient.invalidateQueries({ queryKey: ["my-products"] });
      toast.success(tr(S.restoreSuccess));
      await navigate({ to: "/seller/products/$id", params: { id: result.productId } });
    } catch (error) {
      if (hasStableErrorCode(error)) restoreRequestIds.current.delete(id);
      toast.error(productArchiveErrorMessage(error));
    }
  }

  async function retryPreviews() {
    setRefreshError(false);
    setLocallyUnavailable(new Set());
    pendingRefreshImageIds.current.clear();
    replacementPendingImageIds.current.clear();
    await refetch();
  }

  return (
    <div className="flex flex-col gap-6">
      <ClassifierAssistedUploadDisabledNotice notice={notice} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{tr(S.products)}</h1>
          <p className="text-sm text-muted-foreground">{tr(S.description)}</p>
        </div>
        <ProductEntryActions />
      </div>

      <div className="flex flex-wrap gap-2" aria-label={tr(S.products)}>
        <button
          type="button"
          aria-pressed={request.status === "active"}
          onClick={() => onRequestChange({ ...request, status: "active", cursor: null })}
          className={productStatusFilterClass(request.status === "active")}
        >
          {tr(S.activeProducts)}
        </button>
        <button
          type="button"
          aria-pressed={request.status === "archived"}
          onClick={() => onRequestChange({ ...request, status: "archived", cursor: null })}
          className={productStatusFilterClass(request.status === "archived")}
        >
          {tr(S.archivedProducts)}
        </button>
      </div>

      {query.isLoading ? (
        <div className="text-sm text-muted-foreground">{tr(S.loading)}</div>
      ) : query.isError ? (
        <Message text={tr(S.listUnavailable)} onRetry={() => void refetch()} />
      ) : (
        <>
          {data?.previewDelivery.status === "unavailable" ? (
            <Message text={tr(S.previewsUnavailable)} onRetry={() => void retryPreviews()} />
          ) : null}
          {refreshError ? (
            <Message text={tr(S.refreshFailed)} onRetry={() => void retryPreviews()} />
          ) : null}
          {query.isFetching ? (
            <p className="text-xs text-muted-foreground">{tr(S.refreshing)}</p>
          ) : null}

          {data?.products.length ? (
            <div className="overflow-x-auto border border-border bg-card/40">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3">{tr(S.preview)}</th>
                    <th className="p-3">{tr(S.title)}</th>
                    <th className="p-3">{tr(productCodeCopy.label)}</th>
                    <th className="p-3">{tr(S.status)}</th>
                    <th className="p-3">{tr(S.price)}</th>
                    <th className="p-3">{tr(S.moq)}</th>
                    <th className="p-3 text-right">{tr(S.actions)}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((product) => (
                    <tr key={product.id} className="border-b border-border/60 last:border-b-0">
                      <td className="p-3">
                        <ProductPreview
                          product={product}
                          locallyUnavailable={locallyUnavailable}
                          onPrivateError={(imageId) => void refreshPrivatePreviews([imageId])}
                          onPublicError={() => markUnavailable([publicPreviewKey(product.id)])}
                          onPrivateLoad={(imageId) =>
                            replacementPendingImageIds.current.delete(imageId)
                          }
                        />
                      </td>
                      <td className="p-3">
                        {product.publicState !== "archived" || product.hasWorkingCopy ? (
                          <Link
                            to="/seller/products/$id"
                            params={{ id: product.id }}
                            className="hover:text-primary"
                          >
                            {product.title.trim() || tr(S.untitled)}
                          </Link>
                        ) : (
                          product.title.trim() || tr(S.untitled)
                        )}
                      </td>
                      <td className="select-text p-3 font-mono text-xs">
                        {product.product_code ?? tr(productCodeCopy.assignedWhenPublishing)}
                      </td>
                      <td className="p-3">
                        <div className="flex min-w-44 flex-col gap-1 text-xs">
                          <StatusAxis
                            label={tr(S.productStatus)}
                            value={localizedPublicState(product.publicState)}
                            className={publicStateClass(product.publicState)}
                          />
                          <StatusAxis
                            label={tr(S.marketplaceStatus)}
                            value={localizedMarketplaceVisibility(product.marketplaceVisibility)}
                            className={marketplaceVisibilityClass(product.marketplaceVisibility)}
                          />
                          <StatusAxis label={tr(S.reviewStatus)} value={reviewState(product)} />
                          <StatusAxis
                            label={tr(S.activationStatus)}
                            value={activationState(product.activation?.displayState ?? null)}
                          />
                        </div>
                      </td>
                      <td className="p-3">
                        {product.price != null
                          ? `${product.currency} ${Number(product.price).toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="p-3">{product.moq ?? "—"}</td>
                      <td className="p-3 text-right">
                        {product.publicState === "archived" ? (
                          product.actions.canEdit ? (
                            <Link
                              to="/seller/products/$id"
                              params={{ id: product.id }}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              {tr(S.continueEditing)}
                            </Link>
                          ) : product.actions.canRestore ? (
                            <button
                              type="button"
                              onClick={() => void handleRestore(product.id, product.actionRevision)}
                              className="text-xs text-primary hover:text-primary/80"
                            >
                              {tr(S.restore)}
                            </button>
                          ) : null
                        ) : (
                          <>
                            {product.actions.canEdit ? (
                              <Link
                                to="/seller/products/$id"
                                params={{ id: product.id }}
                                className="mr-3 text-xs text-muted-foreground hover:text-foreground"
                              >
                                {tr(S.edit)}
                              </Link>
                            ) : null}
                            {product.actions.canArchive ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleArchive(product.id, product.actionRevision)
                                }
                                className="text-xs text-rose-400 hover:text-rose-300"
                              >
                                {tr(S.archive)}
                              </button>
                            ) : null}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border border-dashed border-border/60 p-8 text-center">
              <p className="text-sm text-muted-foreground">{tr(S.noProducts)}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <ProductEntryActions />
              </div>
            </div>
          )}

          {data ? (
            <nav
              aria-label={tr(S.products)}
              className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
            >
              <button
                type="button"
                disabled={!request.cursor || query.isFetching}
                onClick={() => onRequestChange({ ...request, cursor: null })}
                className="border border-border px-3 py-2 text-xs hover:border-primary disabled:opacity-50"
              >
                {tr(S.firstPage)}
              </button>
              <button
                type="button"
                disabled={!data.nextCursor || query.isFetching}
                onClick={() =>
                  data.nextCursor &&
                  onRequestChange({
                    ...request,
                    cursor: data.nextCursor,
                  })
                }
                className="border border-border px-3 py-2 text-xs hover:border-primary disabled:opacity-50"
              >
                {tr(S.nextPage)}
              </button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

function ProductEntryActions() {
  const classifierAssistedUploadEnabled = useClassifierAssistedUploadEnabled();
  return (
    <div className="flex flex-wrap gap-3">
      <Link
        to="/seller/products/new"
        className="bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {tr(S.addManually)}
      </Link>
      {classifierAssistedUploadEnabled ? (
        <Link
          to="/seller/classifier-batches/new"
          className="border border-border bg-card px-4 py-2 text-sm font-medium hover:border-primary"
        >
          {tr(S.automaticGrouping)}
        </Link>
      ) : null}
    </div>
  );
}

function productArchiveErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "product_not_found") return tr(S.productNotFound);
    if (error.code === "product_archive_not_allowed") return tr(S.archiveNotAllowed);
    if (error.code === "product_restore_not_allowed") return tr(S.restoreNotAllowed);
    if (
      error.code === "product_archive_moderation_active" ||
      error.code === "product_restore_moderation_active"
    ) {
      return tr(S.moderationActive);
    }
    if (error.code === "product_moderation_revision_conflict") {
      return tr(S.revisionConflict);
    }
    if (
      error.code === "product_archive_request_conflict" ||
      error.code === "product_restore_request_conflict"
    ) {
      return tr(S.requestConflict);
    }
    if (error.code === "product_moderation_activation_unavailable") {
      return tr(S.archiveUnavailable);
    }
  }
  return tr(S.archiveUnavailable);
}

function operationRequestId(requests: Map<string, string>, productId: string): string {
  const existing = requests.get(productId);
  if (existing) return existing;
  const created = crypto.randomUUID();
  requests.set(productId, created);
  return created;
}

function hasStableErrorCode(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error;
}

function productStatusFilterClass(selected: boolean): string {
  return selected
    ? "border border-primary bg-primary px-3 py-2 text-xs text-primary-foreground"
    : "border border-border bg-card px-3 py-2 text-xs hover:border-primary";
}

function ProductPreview({
  product,
  locallyUnavailable,
  onPrivateError,
  onPublicError,
  onPrivateLoad,
}: {
  product: SellerProductListItem;
  locallyUnavailable: Set<string>;
  onPrivateError(imageId: string): void;
  onPublicError(): void;
  onPrivateLoad(imageId: string): void;
}) {
  const preview = product.preview;
  const localKey =
    preview.source === "private_draft" && preview.imageId
      ? preview.imageId
      : publicPreviewKey(product.id);
  const available =
    preview.deliveryStatus === "available" && preview.url && !locallyUnavailable.has(localKey);
  const title = product.title.trim() || tr(S.untitled);

  if (!available) {
    return (
      <div className="flex h-16 w-16 items-center justify-center border border-dashed border-border bg-background p-1 text-center text-[10px] text-muted-foreground">
        {previewLabel(preview, locallyUnavailable.has(localKey))}
      </div>
    );
  }

  return (
    <img
      src={preview.url!}
      alt={title}
      className="h-16 w-16 border border-border object-cover"
      onLoad={() => {
        if (preview.source === "private_draft" && preview.imageId) {
          onPrivateLoad(preview.imageId);
        }
      }}
      onError={() => {
        if (preview.source === "private_draft" && preview.imageId) {
          onPrivateError(preview.imageId);
        } else {
          onPublicError();
        }
      }}
    />
  );
}

function Message({ text, onRetry }: { text: string; onRetry(): void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
      <span>{text}</span>
      <button
        type="button"
        onClick={onRetry}
        className="border border-border px-3 py-1.5 text-xs hover:border-primary"
      >
        {tr(S.retry)}
      </button>
    </div>
  );
}

function previewLabel(preview: SellerProductPreview, locallyUnavailable: boolean): string {
  if (preview.source === "none") return tr(S.noImage);
  if (locallyUnavailable || preview.deliveryStatus === "unavailable") return tr(S.unavailable);
  if (preview.deliveryStatus === "pending") return tr(S.pending);
  if (preview.deliveryStatus === "failed") return tr(S.failed);
  if (preview.deliveryStatus === "missing") return tr(S.missing);
  return tr(S.unavailable);
}

function localizedPublicState(status: SellerProductListItem["publicState"]): string {
  if (status === "published") return tr(S.published);
  if (status === "archived") return tr(S.archived);
  return tr(S.draft);
}

function publicStateClass(status: SellerProductListItem["publicState"]): string {
  if (status === "published") return "text-emerald-400";
  if (status === "draft") return "text-amber-400";
  return "text-muted-foreground";
}

function localizedMarketplaceVisibility(status: ProductMarketplaceVisibility): string {
  if (status === "visible") {
    return tr(t("Visible", "Widoczny", "Sichtbar", "Đang hiển thị"));
  }
  if (status === "storefront_disabled") {
    return tr(t("Storefront disabled", "Sklep wyłączony", "Shop deaktiviert", "Gian hàng bị tắt"));
  }
  if (status === "seller_approval_required") {
    return tr(
      t(
        "Seller approval required",
        "Wymagane zatwierdzenie sprzedawcy",
        "Verkäufergenehmigung erforderlich",
        "Cần duyệt người bán",
      ),
    );
  }
  return tr(t("Not visible", "Niewidoczny", "Nicht sichtbar", "Chưa hiển thị"));
}

function marketplaceVisibilityClass(status: ProductMarketplaceVisibility): string {
  if (status === "visible") return "text-emerald-400";
  if (status === "storefront_disabled") return "text-amber-400";
  if (status === "seller_approval_required") return "text-destructive";
  return "text-muted-foreground";
}

function reviewState(product: SellerProductListItem): string {
  const status = product.review?.status;
  if (!status) return product.hasWorkingCopy ? tr(S.draftChanges) : tr(S.notSubmitted);
  if (status === "pending") return tr(S.pendingReview);
  if (status === "changes_requested") return tr(S.changesRequested);
  if (status === "rejected") return tr(S.rejected);
  if (status === "withdrawn") return tr(S.withdrawn);
  if (product.hasWorkingCopy && product.activation?.displayState === "completed") {
    return tr(S.draftChanges);
  }
  return tr(S.approved);
}

function activationState(state: ProductActivationDisplayState | null): string {
  if (!state) return tr(S.notStarted);
  if (state === "waiting_for_dispatch") return tr(S.waitingForDispatch);
  if (state === "dispatch_failed") return tr(S.dispatchFailed);
  if (state === "publishing") return tr(S.publishing);
  if (state === "activation_failed") return tr(S.activationFailed);
  if (state === "abandonment_cleanup") return tr(S.abandonmentCleanup);
  if (state === "abandonment_cleanup_required") return tr(S.abandonmentCleanupRequired);
  if (state === "public_cleanup") return tr(S.publicCleanup);
  if (state === "public_cleanup_required") return tr(S.publicCleanupRequired);
  if (state === "completed") return tr(S.completed);
  return tr(S.abandoned);
}

function StatusAxis({
  label,
  value,
  className = "text-foreground",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <span>
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className={className}>{value}</span>
    </span>
  );
}

function publicPreviewKey(productId: string): string {
  return `public:${productId}`;
}
