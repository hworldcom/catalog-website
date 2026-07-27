import { useCallback, useEffect, useRef, useState } from "react";

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
import { t, tr } from "@/lib/i18n";

import type {
  SellerProductDraftGallery,
  SellerProductDraftGalleryImage,
} from "../product-draft-image-gallery.types";

const S = {
  title: t("Product images", "Zdjęcia produktu", "Produktbilder", "Hình ảnh sản phẩm"),
  description: t(
    "Private draft images are available through short-lived links.",
    "Prywatne zdjęcia szkicu są dostępne przez krótkotrwałe odnośniki.",
    "Private Entwurfsbilder sind über kurzlebige Links verfügbar.",
    "Ảnh bản nháp riêng tư được cung cấp qua liên kết có thời hạn ngắn.",
  ),
  empty: t(
    "This product draft has no images.",
    "Ten szkic produktu nie ma zdjęć.",
    "Dieser Produktentwurf hat keine Bilder.",
    "Bản nháp sản phẩm này không có ảnh.",
  ),
  sourceCover: t("Source cover", "Okładka źródłowa", "Quell-Titelbild", "Ảnh bìa nguồn"),
  position: t("Position", "Pozycja", "Position", "Vị trí"),
  pending: t("Image pending", "Zdjęcie oczekuje", "Bild ausstehend", "Ảnh đang chờ"),
  failed: t("Image failed", "Błąd zdjęcia", "Bild fehlgeschlagen", "Ảnh bị lỗi"),
  missing: t("Image missing", "Brak zdjęcia", "Bild fehlt", "Thiếu ảnh"),
  unavailable: t(
    "Image unavailable",
    "Zdjęcie niedostępne",
    "Bild nicht verfügbar",
    "Ảnh không khả dụng",
  ),
  galleryUnavailable: t(
    "Product images are temporarily unavailable. You can continue editing the product.",
    "Zdjęcia produktu są tymczasowo niedostępne. Możesz nadal edytować produkt.",
    "Produktbilder sind vorübergehend nicht verfügbar. Sie können das Produkt weiter bearbeiten.",
    "Hình ảnh sản phẩm tạm thời không khả dụng. Bạn vẫn có thể tiếp tục chỉnh sửa sản phẩm.",
  ),
  refreshFailed: t(
    "One or more image links could not be refreshed.",
    "Nie udało się odświeżyć co najmniej jednego odnośnika do zdjęcia.",
    "Mindestens ein Bildlink konnte nicht aktualisiert werden.",
    "Không thể làm mới một hoặc nhiều liên kết ảnh.",
  ),
  retry: t("Try again", "Spróbuj ponownie", "Erneut versuchen", "Thử lại"),
  enlarge: t("Enlarge image", "Powiększ zdjęcie", "Bild vergrößern", "Phóng to ảnh"),
  dialogDescription: t(
    "Enlarged private product-draft image.",
    "Powiększone prywatne zdjęcie szkicu produktu.",
    "Vergrößertes privates Produktentwurfsbild.",
    "Ảnh bản nháp sản phẩm riêng tư được phóng to.",
  ),
  close: t("Close", "Zamknij", "Schließen", "Đóng"),
};

export type ProductDraftImageGalleryProps = {
  initialGallery: SellerProductDraftGallery;
  productTitle: string;
  refresh(): Promise<SellerProductDraftGallery>;
};

export function ProductDraftImageGallery({
  initialGallery,
  productTitle,
  refresh,
}: ProductDraftImageGalleryProps) {
  const [gallery, setGallery] = useState(initialGallery);
  const galleryRef = useRef(initialGallery);
  const [refreshError, setRefreshError] = useState(false);
  const [locallyUnavailable, setLocallyUnavailable] = useState<Set<string>>(new Set());
  const [dialogImageId, setDialogImageId] = useState<string | null>(null);
  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const pendingRefreshImageIds = useRef(new Set<string>());
  const replacementPendingImageIds = useRef(new Set<string>());

  useEffect(() => {
    galleryRef.current = gallery;
  }, [gallery]);

  useEffect(() => {
    setGallery(initialGallery);
    galleryRef.current = initialGallery;
    setRefreshError(false);
    setLocallyUnavailable(new Set());
    setDialogImageId(null);
    refreshInFlight.current = null;
    pendingRefreshImageIds.current.clear();
    replacementPendingImageIds.current.clear();
  }, [initialGallery]);

  const markUnavailable = useCallback((imageIds: string[]) => {
    if (imageIds.length === 0) return;
    setLocallyUnavailable((current) => new Set([...current, ...imageIds]));
    setDialogImageId((current) => (current && imageIds.includes(current) ? null : current));
  }, []);

  const refreshGallery = useCallback(
    (imageIds: string[], force = false) => {
      const currentGallery = galleryRef.current;
      const eligible: string[] = [];

      for (const imageId of imageIds) {
        if (!force && replacementPendingImageIds.current.has(imageId)) {
          markUnavailable([imageId]);
          continue;
        }
        if (!currentGallery.images.some((image) => image.imageId === imageId)) continue;
        replacementPendingImageIds.current.add(imageId);
        pendingRefreshImageIds.current.add(imageId);
        eligible.push(imageId);
      }
      if (!force && eligible.length === 0) {
        return refreshInFlight.current ?? Promise.resolve();
      }
      if (refreshInFlight.current) return refreshInFlight.current;

      setRefreshError(false);
      const request = refresh()
        .then((nextGallery) => {
          if (nextGallery.status !== "available") {
            throw new Error("ProductDraft image gallery refresh was unavailable.");
          }
          if (force) {
            setLocallyUnavailable(new Set());
            replacementPendingImageIds.current.clear();
          }
          setGallery(nextGallery);
          galleryRef.current = nextGallery;
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
    [markUnavailable, refresh],
  );

  useEffect(() => {
    const available = gallery.images.filter(
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
      () => void refreshGallery(expiringImageIds),
      Math.min(2_147_483_647, Math.max(0, earliestExpiry - Date.now())),
    );
    return () => window.clearTimeout(timer);
  }, [gallery, locallyUnavailable, refreshGallery]);

  const dialogImage = gallery.images.find((image) => image.imageId === dialogImageId) ?? null;
  const title =
    productTitle.trim() ||
    tr(t("Untitled product", "Produkt bez tytułu", "Unbenanntes Produkt", "Sản phẩm chưa có tên"));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{tr(S.title)}</h2>
          </CardTitle>
          <CardDescription>{tr(S.description)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {gallery.status === "unavailable" ? (
            <GalleryMessage
              text={tr(S.galleryUnavailable)}
              onRetry={() => void refreshGallery([], true)}
            />
          ) : null}
          {refreshError ? (
            <GalleryMessage
              text={tr(S.refreshFailed)}
              onRetry={() => void refreshGallery([], true)}
            />
          ) : null}
          {gallery.images.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr(S.empty)}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {gallery.images.map((image) => (
                <GalleryImage
                  key={image.imageId}
                  image={image}
                  title={title}
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
              alt={`${title}, ${tr(S.position)} ${dialogImage.sourcePosition + 1}`}
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
    </>
  );
}

function GalleryMessage({ text, onRetry }: { text: string; onRetry(): void }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{text}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {tr(S.retry)}
      </Button>
    </div>
  );
}

function GalleryImage({
  image,
  title,
  locallyUnavailable,
  onLoad,
  onError,
  onOpen,
}: {
  image: SellerProductDraftGalleryImage;
  title: string;
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
          aria-label={`${tr(S.enlarge)}: ${title}, ${tr(S.position)} ${image.sourcePosition + 1}`}
          onClick={(event) => onOpen(event.currentTarget)}
        >
          <img
            src={image.url!}
            alt={`${title}, ${tr(S.position)} ${image.sourcePosition + 1}`}
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
          {tr(S.position)} {image.sourcePosition + 1}
        </span>
        {image.isSourceCover ? <Badge variant="secondary">{tr(S.sourceCover)}</Badge> : null}
      </div>
    </article>
  );
}

function ImagePlaceholder({
  image,
  locallyUnavailable,
}: {
  image: SellerProductDraftGalleryImage | null;
  locallyUnavailable: boolean;
}) {
  const status = locallyUnavailable ? "unavailable" : image?.deliveryStatus;
  const label =
    status === "pending"
      ? S.pending
      : status === "failed"
        ? S.failed
        : status === "missing"
          ? S.missing
          : S.unavailable;
  return (
    <div className="flex h-full min-h-40 w-full items-center justify-center bg-muted p-4 text-center text-sm text-muted-foreground">
      {tr(label)}
    </div>
  );
}
