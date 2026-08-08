import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { archiveMyProduct, listMyProducts } from "@/features/seller/products.functions";
import { productCodeCopy } from "@/features/product-code/product-code.copy";
import type {
  SellerProductListItem,
  SellerProductListRequest,
  SellerProductPreview,
} from "@/features/seller/seller-product-list.types";
import { t, tr } from "@/lib/i18n";

const S = {
  products: t("Products", "Produkty", "Produkte", "Sản phẩm"),
  description: t(
    "Draft products aren't visible until you publish them.",
    "Szkice produktów nie są widoczne do czasu ich opublikowania.",
    "Produktentwürfe sind erst nach der Veröffentlichung sichtbar.",
    "Sản phẩm nháp chưa hiển thị cho đến khi bạn xuất bản.",
  ),
  newProduct: t("+ New product", "+ Nowy produkt", "+ Neues Produkt", "+ Sản phẩm mới"),
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
    "Archive this product? It will disappear from your product list and cannot be restored.",
    "Zarchiwizować ten produkt? Zniknie z listy produktów i nie będzie można go przywrócić.",
    "Dieses Produkt archivieren? Es verschwindet aus Ihrer Produktliste und kann nicht wiederhergestellt werden.",
    "Lưu trữ sản phẩm này? Sản phẩm sẽ biến mất khỏi danh sách và không thể khôi phục.",
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
    "Product archival is temporarily unavailable.",
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
  addFirst: t(
    "Add your first product",
    "Dodaj pierwszy produkt",
    "Erstes Produkt hinzufügen",
    "Thêm sản phẩm đầu tiên",
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
};

export type ProductsScreenProps = {
  request: SellerProductListRequest;
  onRequestChange(request: SellerProductListRequest): void;
};

export function ProductsScreen({ request, onRequestChange }: ProductsScreenProps) {
  const listProducts = useServerFn(listMyProducts);
  const archive = useServerFn(archiveMyProduct);
  const queryClient = useQueryClient();
  const [locallyUnavailable, setLocallyUnavailable] = useState<Set<string>>(new Set());
  const [refreshError, setRefreshError] = useState(false);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const pendingRefreshImageIds = useRef(new Set<string>());
  const replacementPendingImageIds = useRef(new Set<string>());

  const query = useQuery({
    queryKey: ["my-products", request.limit, request.cursor],
    queryFn: () => listProducts({ data: request }),
  });
  const { data, refetch } = query;

  useEffect(() => {
    setLocallyUnavailable(new Set());
    setRefreshError(false);
    refreshInFlight.current = null;
    pendingRefreshImageIds.current.clear();
    replacementPendingImageIds.current.clear();
  }, [request.limit, request.cursor]);

  const markUnavailable = useCallback((keys: string[]) => {
    if (keys.length === 0) return;
    setLocallyUnavailable((current) => new Set([...current, ...keys]));
  }, []);

  const refreshImportedPreviews = useCallback(
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
      return preview.source === "imported_private" &&
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
      () => void refreshImportedPreviews(expiringImageIds),
      Math.min(2_147_483_647, Math.max(0, earliestExpiry - Date.now())),
    );
    return () => window.clearTimeout(timer);
  }, [data, locallyUnavailable, refreshImportedPreviews]);

  async function handleArchive(id: string) {
    if (!window.confirm(tr(S.archiveConfirm))) return;
    try {
      await archive({ data: { id } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-products"] }),
        queryClient.invalidateQueries({ queryKey: ["my-product-summary"] }),
      ]);
      toast.success(tr(S.archiveSuccess));
      if (request.cursor && data?.products.length === 1) {
        onRequestChange({ ...request, cursor: null });
      }
    } catch (error) {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{tr(S.products)}</h1>
          <p className="text-sm text-muted-foreground">{tr(S.description)}</p>
        </div>
        <Link
          to="/seller/products/new"
          className="bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {tr(S.newProduct)}
        </Link>
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
                          onImportedError={(imageId) => void refreshImportedPreviews([imageId])}
                          onPublicError={() => markUnavailable([publicPreviewKey(product.id)])}
                          onImportedLoad={(imageId) =>
                            replacementPendingImageIds.current.delete(imageId)
                          }
                        />
                      </td>
                      <td className="p-3">
                        <Link
                          to="/seller/products/$id"
                          params={{ id: product.id }}
                          className="hover:text-primary"
                        >
                          {product.title.trim() || tr(S.untitled)}
                        </Link>
                      </td>
                      <td className="select-text p-3 font-mono text-xs">
                        {product.product_code ?? tr(productCodeCopy.assignedWhenPublishing)}
                      </td>
                      <td className="p-3">
                        <span className={statusClass(product.status)}>
                          {localizedStatus(product.status)}
                        </span>
                      </td>
                      <td className="p-3">
                        {product.price != null
                          ? `${product.currency} ${Number(product.price).toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="p-3">{product.moq ?? "—"}</td>
                      <td className="p-3 text-right">
                        <Link
                          to="/seller/products/$id"
                          params={{ id: product.id }}
                          className="mr-3 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {tr(S.edit)}
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleArchive(product.id)}
                          className="text-xs text-rose-400 hover:text-rose-300"
                        >
                          {tr(S.archive)}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border border-dashed border-border/60 p-8 text-center">
              <p className="text-sm text-muted-foreground">{tr(S.noProducts)}</p>
              <Link
                to="/seller/products/new"
                className="mt-3 inline-flex bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {tr(S.addFirst)}
              </Link>
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

function productArchiveErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "product_not_found") return tr(S.productNotFound);
    if (error.code === "product_archive_not_allowed") return tr(S.archiveNotAllowed);
    if (error.code === "product_archive_unavailable") return tr(S.archiveUnavailable);
  }
  return tr(S.archiveUnavailable);
}

function ProductPreview({
  product,
  locallyUnavailable,
  onImportedError,
  onPublicError,
  onImportedLoad,
}: {
  product: SellerProductListItem;
  locallyUnavailable: Set<string>;
  onImportedError(imageId: string): void;
  onPublicError(): void;
  onImportedLoad(imageId: string): void;
}) {
  const preview = product.preview;
  const localKey =
    preview.source === "imported_private" && preview.imageId
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
        if (preview.source === "imported_private" && preview.imageId) {
          onImportedLoad(preview.imageId);
        }
      }}
      onError={() => {
        if (preview.source === "imported_private" && preview.imageId) {
          onImportedError(preview.imageId);
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

function localizedStatus(status: SellerProductListItem["status"]): string {
  if (status === "published") return tr(S.published);
  if (status === "archived") return tr(S.archived);
  return tr(S.draft);
}

function statusClass(status: SellerProductListItem["status"]): string {
  if (status === "published") return "text-emerald-400";
  if (status === "draft") return "text-amber-400";
  return "text-muted-foreground";
}

function publicPreviewKey(productId: string): string {
  return `public:${productId}`;
}
