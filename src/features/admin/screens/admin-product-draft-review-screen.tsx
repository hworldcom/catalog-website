import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProductDraftFactsEditor } from "@/features/product-draft-facts/components/product-draft-facts-editor";
import { productCodeCopy } from "@/features/product-code/product-code.copy";
import { ProductDraftTitleEditor } from "@/features/product-draft-title/components/product-draft-title-editor";
import { t, tr, useLang, type Lang, type T } from "@/lib/i18n";

import { mergeReviewGallery } from "../admin-product-draft-review.gallery";
import { getAdminProductDraftReview } from "../admin-product-draft-review.functions";
import type {
  AdminProductDraftReview,
  AdminProductDraftReviewImage,
} from "../admin-product-draft-review.types";
import { ClassifierImportShell } from "../components/classifier-import-shell";

export type AdminProductDraftReviewClient = {
  get(productDraftId: string): Promise<AdminProductDraftReview>;
};

type AdminProductDraftReviewScreenProps = {
  productDraftId: string;
  backHref: string;
  client?: AdminProductDraftReviewClient;
  factsEditor?: ReactNode;
  titleEditor?: ReactNode;
};

const S = {
  title: t(
    "Review ProductDraft",
    "Sprawdź szkic produktu",
    "Produktentwurf prüfen",
    "Xem lại bản nháp sản phẩm",
  ),
  description: t(
    "Review private images and structured product facts before publication.",
    "Sprawdź prywatne zdjęcia i ustrukturyzowane dane produktu przed publikacją.",
    "Prüfen Sie private Bilder und strukturierte Produktfakten vor der Veröffentlichung.",
    "Xem lại ảnh riêng tư và thông tin sản phẩm có cấu trúc trước khi xuất bản.",
  ),
  back: t(
    "Back to ProductDrafts",
    "Wróć do szkiców produktów",
    "Zurück zu Produktentwürfen",
    "Quay lại bản nháp sản phẩm",
  ),
  loading: t(
    "Loading ProductDraft review…",
    "Ładowanie podglądu szkicu produktu…",
    "Produktentwurf wird geladen…",
    "Đang tải bản xem lại sản phẩm…",
  ),
  loadErrorTitle: t(
    "ProductDraft review could not be loaded",
    "Nie można załadować podglądu szkicu produktu",
    "Produktentwurf konnte nicht geladen werden",
    "Không thể tải bản xem lại sản phẩm",
  ),
  retry: t("Try again", "Spróbuj ponownie", "Erneut versuchen", "Thử lại"),
  notFound: t(
    "This ProductDraft was not found.",
    "Nie znaleziono tego szkicu produktu.",
    "Dieser Produktentwurf wurde nicht gefunden.",
    "Không tìm thấy bản nháp sản phẩm này.",
  ),
  administratorRequired: t(
    "Prototype administrator access is required.",
    "Wymagany jest dostęp administratora prototypu.",
    "Prototyp-Administratorzugriff ist erforderlich.",
    "Cần quyền quản trị viên nguyên mẫu.",
  ),
  notEnabled: t(
    "Administrator ProductDraft review is not enabled.",
    "Przegląd szkiców produktów przez administratora nie jest włączony.",
    "Die Administratorprüfung von Produktentwürfen ist nicht aktiviert.",
    "Chức năng quản trị viên xem lại bản nháp sản phẩm chưa được bật.",
  ),
  sourceInconsistent: t(
    "The ProductDraft classifier source is inconsistent.",
    "Źródło klasyfikatora szkicu produktu jest niespójne.",
    "Die Klassifikatorquelle des Produktentwurfs ist inkonsistent.",
    "Nguồn phân loại của bản nháp sản phẩm không nhất quán.",
  ),
  unavailable: t(
    "The ProductDraft review is temporarily unavailable.",
    "Przegląd szkicu produktu jest tymczasowo niedostępny.",
    "Die Produktentwurfsprüfung ist vorübergehend nicht verfügbar.",
    "Bản xem lại sản phẩm tạm thời không khả dụng.",
  ),
  untitled: t(
    "Untitled product",
    "Produkt bez tytułu",
    "Unbenanntes Produkt",
    "Sản phẩm chưa có tên",
  ),
  summary: t("Product summary", "Podsumowanie produktu", "Produktübersicht", "Tóm tắt sản phẩm"),
  seller: t("Destination seller", "Sprzedawca docelowy", "Zielverkäufer", "Nhà bán đích"),
  sellerId: t("Seller ID", "ID sprzedawcy", "Verkäufer-ID", "Mã nhà bán"),
  category: t("Category", "Kategoria", "Kategorie", "Danh mục"),
  noCategory: t("Not assigned", "Nie przypisano", "Nicht zugewiesen", "Chưa gán"),
  sourceOrganization: t(
    "Classifier organization",
    "Organizacja klasyfikatora",
    "Klassifikator-Organisation",
    "Tổ chức phân loại",
  ),
  sourceBatch: t(
    "Classifier batch",
    "Partia klasyfikatora",
    "Klassifikator-Stapel",
    "Lô phân loại",
  ),
  sourceGroup: t(
    "Classifier group",
    "Grupa klasyfikatora",
    "Klassifikator-Gruppe",
    "Nhóm phân loại",
  ),
  noSource: t(
    "No classifier source",
    "Brak źródła klasyfikatora",
    "Keine Klassifikatorquelle",
    "Không có nguồn phân loại",
  ),
  created: t("Created", "Utworzono", "Erstellt", "Đã tạo"),
  updated: t("Updated", "Zaktualizowano", "Aktualisiert", "Đã cập nhật"),
  gallery: t(
    "Private image gallery",
    "Prywatna galeria zdjęć",
    "Private Bildergalerie",
    "Thư viện ảnh riêng tư",
  ),
  galleryDescription: t(
    "Images are delivered through short-lived private links.",
    "Zdjęcia są dostarczane przez krótkotrwałe prywatne odnośniki.",
    "Bilder werden über kurzlebige private Links bereitgestellt.",
    "Ảnh được cung cấp qua liên kết riêng tư có thời hạn ngắn.",
  ),
  emptyGallery: t(
    "This ProductDraft has no images.",
    "Ten szkic produktu nie ma zdjęć.",
    "Dieser Produktentwurf hat keine Bilder.",
    "Bản nháp sản phẩm này không có ảnh.",
  ),
  cover: t("Cover", "Okładka", "Titelbild", "Ảnh bìa"),
  preview: t("Display preview", "Podgląd", "Anzeigevorschau", "Ảnh xem trước"),
  imagePosition: t("Position", "Pozycja", "Position", "Vị trí"),
  imagePending: t("Image pending", "Zdjęcie oczekuje", "Bild ausstehend", "Ảnh đang chờ"),
  imageFailed: t("Image failed", "Błąd zdjęcia", "Bild fehlgeschlagen", "Ảnh bị lỗi"),
  imageMissing: t("Image missing", "Brak zdjęcia", "Bild fehlt", "Thiếu ảnh"),
  imageUnavailable: t(
    "Image unavailable",
    "Zdjęcie niedostępne",
    "Bild nicht verfügbar",
    "Ảnh không khả dụng",
  ),
  refreshFailed: t(
    "One or more image links could not be refreshed.",
    "Nie udało się odświeżyć co najmniej jednego odnośnika do zdjęcia.",
    "Mindestens ein Bildlink konnte nicht aktualisiert werden.",
    "Không thể làm mới một hoặc nhiều liên kết ảnh.",
  ),
  enlarge: t("Enlarge image", "Powiększ zdjęcie", "Bild vergrößern", "Phóng to ảnh"),
  dialogDescription: t(
    "Enlarged private ProductDraft image.",
    "Powiększone prywatne zdjęcie szkicu produktu.",
    "Vergrößertes privates Bild des Produktentwurfs.",
    "Ảnh riêng tư phóng to của bản nháp sản phẩm.",
  ),
  close: t("Close", "Zamknij", "Schließen", "Đóng"),
  descriptions: t("Descriptions", "Opisy", "Beschreibungen", "Mô tả"),
  descriptionsReserved: t(
    "Description review will use this section in the next implementation step.",
    "W następnym etapie ta sekcja będzie służyć do sprawdzania opisów.",
    "Die Beschreibungsprüfung wird diesen Bereich im nächsten Schritt verwenden.",
    "Phần xem lại mô tả sẽ sử dụng khu vực này trong bước triển khai tiếp theo.",
  ),
  facts: t(
    "Structured facts",
    "Dane strukturalne",
    "Strukturierte Fakten",
    "Thông tin có cấu trúc",
  ),
  productTitle: t("Product title", "Tytuł produktu", "Produkttitel", "Tên sản phẩm"),
  draft: t("Draft", "Szkic", "Entwurf", "Bản nháp"),
  published: t("Published", "Opublikowany", "Veröffentlicht", "Đã xuất bản"),
  archived: t("Archived", "Zarchiwizowany", "Archiviert", "Đã lưu trữ"),
};

const statusLabels: Record<AdminProductDraftReview["status"], T> = {
  draft: S.draft,
  published: S.published,
  archived: S.archived,
};

export function AdminProductDraftReviewScreen(props: AdminProductDraftReviewScreenProps) {
  const getReview = useServerFn(getAdminProductDraftReview);
  const client = useMemo<AdminProductDraftReviewClient>(
    () => ({
      get: (productDraftId) => getReview({ data: { productDraftId } }),
    }),
    [getReview],
  );
  return <AdminProductDraftReviewScreenView {...props} client={props.client ?? client} />;
}

export function AdminProductDraftReviewScreenView({
  productDraftId,
  backHref,
  client,
  factsEditor,
  titleEditor,
}: Required<Pick<AdminProductDraftReviewScreenProps, "productDraftId" | "backHref" | "client">> &
  Pick<AdminProductDraftReviewScreenProps, "factsEditor" | "titleEditor">) {
  const lang = useLang();
  const [review, setReview] = useState<AdminProductDraftReview | null>(null);
  const reviewRef = useRef<AdminProductDraftReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadRequest, setLoadRequest] = useState(0);
  const [refreshError, setRefreshError] = useState(false);
  const [locallyUnavailable, setLocallyUnavailable] = useState<Set<string>>(new Set());
  const [dialogImageId, setDialogImageId] = useState<string | null>(null);
  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const pendingRefreshImageIds = useRef(new Set<string>());
  const replacementPendingImageIds = useRef(new Set<string>());

  useEffect(() => {
    reviewRef.current = review;
  }, [review]);

  useEffect(() => {
    let cancelled = false;
    setReview(null);
    reviewRef.current = null;
    setLoading(true);
    setLoadError(null);
    setRefreshError(false);
    setLocallyUnavailable(new Set());
    setDialogImageId(null);
    refreshInFlight.current = null;
    pendingRefreshImageIds.current.clear();
    replacementPendingImageIds.current.clear();

    void client
      .get(productDraftId)
      .then((nextReview) => {
        if (!cancelled) setReview(nextReview);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(adminProductDraftReviewErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, loadRequest, productDraftId]);

  const markUnavailable = useCallback((imageIds: string[]) => {
    if (imageIds.length === 0) return;
    setLocallyUnavailable((current) => new Set([...current, ...imageIds]));
    setDialogImageId((current) => (current && imageIds.includes(current) ? null : current));
  }, []);

  const refreshGallery = useCallback(
    (imageIds: string[]) => {
      const currentReview = reviewRef.current;
      if (!currentReview) return Promise.resolve();

      const eligible: string[] = [];
      for (const imageId of imageIds) {
        if (replacementPendingImageIds.current.has(imageId)) {
          markUnavailable([imageId]);
          continue;
        }
        if (!currentReview.images.some((image) => image.imageId === imageId)) continue;
        replacementPendingImageIds.current.add(imageId);
        pendingRefreshImageIds.current.add(imageId);
        eligible.push(imageId);
      }
      if (eligible.length === 0) return refreshInFlight.current ?? Promise.resolve();
      if (refreshInFlight.current) return refreshInFlight.current;

      setRefreshError(false);
      const request = client
        .get(productDraftId)
        .then((nextReview) => {
          setReview((current) => (current ? mergeReviewGallery(current, nextReview) : current));
        })
        .catch(() => {
          markUnavailable([...pendingRefreshImageIds.current]);
          setRefreshError(true);
        })
        .finally(() => {
          pendingRefreshImageIds.current.clear();
          refreshInFlight.current = null;
        });
      refreshInFlight.current = request;
      return request;
    },
    [client, markUnavailable, productDraftId],
  );

  useEffect(() => {
    if (!review) return;
    const available = review.images.filter(
      (image) =>
        image.deliveryStatus === "available" &&
        image.expiresAt &&
        !locallyUnavailable.has(image.imageId),
    );
    if (available.length === 0) return;
    const earliestExpiry = Math.min(...available.map((image) => Date.parse(image.expiresAt!)));
    const expiringImageIds = available
      .filter((image) => Date.parse(image.expiresAt!) <= earliestExpiry)
      .map((image) => image.imageId);
    const timer = window.setTimeout(
      () => {
        void refreshGallery(expiringImageIds);
      },
      Math.min(2_147_483_647, Math.max(0, earliestExpiry - Date.now())),
    );
    return () => window.clearTimeout(timer);
  }, [locallyUnavailable, refreshGallery, review]);

  const dialogImage = review?.images.find((image) => image.imageId === dialogImageId) ?? null;
  const title = review?.title.trim() || tr(S.untitled);

  return (
    <ClassifierImportShell>
      <div className="space-y-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="font-display text-2xl font-semibold">{tr(S.title)}</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{tr(S.description)}</p>
          </div>
          <Button asChild variant="outline">
            <a href={backHref}>{tr(S.back)}</a>
          </Button>
        </header>

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

        {!review && loading ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">{tr(S.loading)}</CardContent>
          </Card>
        ) : null}

        {review ? (
          <>
            <ProductSummary review={review} title={title} lang={lang} />

            {refreshError ? (
              <p role="status" className="text-sm text-muted-foreground">
                {tr(S.refreshFailed)}
              </p>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{tr(S.gallery)}</h2>
                </CardTitle>
                <CardDescription>{tr(S.galleryDescription)}</CardDescription>
              </CardHeader>
              <CardContent>
                {review.images.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tr(S.emptyGallery)}</p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {review.images.map((image) => (
                      <GalleryImage
                        key={image.imageId}
                        image={image}
                        title={title}
                        isPreview={review.previewImageId === image.imageId}
                        locallyUnavailable={locallyUnavailable.has(image.imageId)}
                        onLoad={() => replacementPendingImageIds.current.delete(image.imageId)}
                        onError={() => void refreshGallery([image.imageId])}
                        onOpen={(trigger) => {
                          dialogTriggerRef.current = trigger;
                          setDialogImageId(image.imageId);
                        }}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <section aria-label={tr(S.productTitle)}>
              {titleEditor ?? (
                <ProductDraftTitleEditor
                  productDraftId={productDraftId}
                  onSnapshot={(titleSnapshot) =>
                    setReview((current) =>
                      current
                        ? {
                            ...current,
                            title: titleSnapshot.title,
                            titleSource: titleSnapshot.titleSource,
                            status: titleSnapshot.productStatus,
                          }
                        : current,
                    )
                  }
                />
              )}
            </section>

            <section aria-label={tr(S.facts)}>
              {factsEditor ?? <ProductDraftFactsEditor productDraftId={productDraftId} />}
            </section>

            <section data-product-draft-description-review-slot>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2>{tr(S.descriptions)}</h2>
                  </CardTitle>
                  <CardDescription>{tr(S.descriptionsReserved)}</CardDescription>
                </CardHeader>
              </Card>
            </section>
          </>
        ) : null}
      </div>

      <Dialog
        open={Boolean(dialogImage)}
        onOpenChange={(open) => {
          if (!open) setDialogImageId(null);
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-5xl overflow-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            dialogTriggerRef.current?.focus();
          }}
        >
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{tr(S.dialogDescription)}</DialogDescription>
          {dialogImage?.deliveryStatus === "available" &&
          dialogImage.url &&
          !locallyUnavailable.has(dialogImage.imageId) ? (
            <img
              src={dialogImage.url}
              alt={`${title} ${tr(S.enlarge)}`}
              className="max-h-[70vh] w-full object-contain"
              onLoad={() => replacementPendingImageIds.current.delete(dialogImage.imageId)}
              onError={() => void refreshGallery([dialogImage.imageId])}
            />
          ) : (
            <ImagePlaceholder image={dialogImage} locallyUnavailable />
          )}
          <div className="flex justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {tr(S.close)}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </ClassifierImportShell>
  );
}

function ProductSummary({
  review,
  title,
  lang,
}: {
  review: AdminProductDraftReview;
  title: string;
  lang: Lang;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-2 break-all font-mono">
              {review.productDraftId}
            </CardDescription>
          </div>
          <Badge variant={review.status === "draft" ? "secondary" : "outline"}>
            {tr(statusLabels[review.status])}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Definition
            label={tr(S.seller)}
            value={`${review.seller.name} (${review.seller.slug})`}
          />
          <Definition label={tr(S.sellerId)} value={review.seller.id} mono />
          <Definition label={tr(productCodeCopy.label)} value={review.productCode} mono />
          <Definition
            label={tr(S.category)}
            value={
              review.category
                ? `${review.category.name} (${review.category.slug})`
                : tr(S.noCategory)
            }
          />
          {review.source ? (
            <>
              <Definition
                label={tr(S.sourceOrganization)}
                value={review.source.classifierOrganizationId}
                mono
              />
              <Definition label={tr(S.sourceBatch)} value={review.source.classifierBatchId} mono />
              <Definition label={tr(S.sourceGroup)} value={review.source.classifierGroupId} mono />
            </>
          ) : (
            <Definition label={tr(S.sourceOrganization)} value={tr(S.noSource)} />
          )}
          <Definition label={tr(S.created)} value={formatDate(review.createdAt, lang)} />
          <Definition label={tr(S.updated)} value={formatDate(review.updatedAt, lang)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function GalleryImage({
  image,
  title,
  isPreview,
  locallyUnavailable,
  onLoad,
  onError,
  onOpen,
}: {
  image: AdminProductDraftReviewImage;
  title: string;
  isPreview: boolean;
  locallyUnavailable: boolean;
  onLoad(): void;
  onError(): void;
  onOpen(trigger: HTMLButtonElement): void;
}) {
  const available =
    image.deliveryStatus === "available" && image.url !== null && !locallyUnavailable;
  return (
    <article className="overflow-hidden rounded-lg border bg-background">
      {available ? (
        <button
          type="button"
          className="block aspect-square w-full cursor-zoom-in bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label={`${tr(S.enlarge)}: ${title}, ${tr(S.imagePosition)} ${image.sourcePosition + 1}`}
          onClick={(event) => onOpen(event.currentTarget)}
        >
          <img
            src={image.url!}
            alt={`${title}, ${tr(S.imagePosition)} ${image.sourcePosition + 1}`}
            className="h-full w-full object-cover"
            onLoad={onLoad}
            onError={onError}
          />
        </button>
      ) : (
        <div className="aspect-square">
          <ImagePlaceholder image={image} locallyUnavailable={locallyUnavailable} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 p-3 text-xs text-muted-foreground">
        <span>
          {tr(S.imagePosition)} {image.sourcePosition + 1}
        </span>
        {image.isCover ? <Badge variant="secondary">{tr(S.cover)}</Badge> : null}
        {isPreview ? <Badge variant="outline">{tr(S.preview)}</Badge> : null}
      </div>
    </article>
  );
}

function ImagePlaceholder({
  image,
  locallyUnavailable,
}: {
  image: AdminProductDraftReviewImage | null;
  locallyUnavailable: boolean;
}) {
  const status = locallyUnavailable ? "unavailable" : image?.deliveryStatus;
  const label =
    status === "pending"
      ? S.imagePending
      : status === "failed"
        ? S.imageFailed
        : status === "missing"
          ? S.imageMissing
          : S.imageUnavailable;
  return (
    <div className="flex h-full min-h-40 w-full items-center justify-center bg-muted p-4 text-center text-sm text-muted-foreground">
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
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-words ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function formatDate(value: string, lang: Lang): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const locale: Record<Lang, string> = {
    EN: "en",
    PL: "pl",
    DE: "de",
    VI: "vi",
  };
  return new Intl.DateTimeFormat(locale[lang], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function adminProductDraftReviewErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : null;
  switch (code) {
    case "product_draft_not_found":
      return tr(S.notFound);
    case "prototype_administrator_required":
      return tr(S.administratorRequired);
    case "admin_product_drafts_not_enabled":
      return tr(S.notEnabled);
    case "product_draft_source_inconsistent":
      return tr(S.sourceInconsistent);
    default:
      return tr(S.unavailable);
  }
}
