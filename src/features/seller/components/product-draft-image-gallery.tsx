import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import { supabase } from "@/lib/supabase/client";

import type {
  SellerProductDraftGallery,
  SellerProductDraftGalleryImage,
} from "../product-draft-image-gallery.types";
import {
  finalizeMyProductDraftImageUploads,
  prepareMyProductDraftImageUploads,
  removeMyProductDraftImage,
  retryMyProductDraftImageCleanup,
  updateMyProductDraftImageGallery,
} from "../product-draft-image-lifecycle.functions";
import {
  PRODUCT_DRAFT_IMAGE_MAX_COUNT,
  PRODUCT_DRAFT_IMAGE_MAX_SIZE_BYTES,
  type ProductDraftImageContentType,
} from "../product-draft-image-lifecycle.types";
import type { SellerProductImageSourceMode } from "../server/seller-product-draft-read.service";

const PRODUCT_DRAFT_IMAGE_BUCKET = "product-draft-images";
const BROWSER_UPLOAD_CONCURRENCY = 3;

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
  addPictures: t("Add pictures", "Dodaj zdjęcia", "Bilder hinzufügen", "Thêm hình ảnh"),
  saveDraftFirst: t(
    "Save draft to add pictures",
    "Zapisz szkic, aby dodać zdjęcia",
    "Entwurf speichern, um Bilder hinzuzufügen",
    "Lưu bản nháp để thêm hình ảnh",
  ),
  pictures: t("pictures", "zdjęć", "Bilder", "hình ảnh"),
  makeCover: t("Make cover", "Ustaw jako okładkę", "Als Titelbild", "Đặt làm ảnh bìa"),
  cover: t("Cover", "Okładka", "Titelbild", "Ảnh bìa"),
  moveEarlier: t("Move earlier", "Przesuń wcześniej", "Nach vorne", "Di chuyển lên trước"),
  moveLater: t("Move later", "Przesuń później", "Nach hinten", "Di chuyển ra sau"),
  removePicture: t("Remove picture", "Usuń zdjęcie", "Bild entfernen", "Xóa hình ảnh"),
  removeConfirmation: t(
    "Remove this picture from the product draft?",
    "Usunąć to zdjęcie ze szkicu produktu?",
    "Dieses Bild aus dem Produktentwurf entfernen?",
    "Xóa hình ảnh này khỏi bản nháp sản phẩm?",
  ),
  retryFinalize: t(
    "Check upload again",
    "Sprawdź przesyłanie ponownie",
    "Upload erneut prüfen",
    "Kiểm tra lại tải lên",
  ),
  retryUpload: t(
    "Select file again",
    "Wybierz plik ponownie",
    "Datei erneut auswählen",
    "Chọn lại tệp",
  ),
  retryCleanup: t(
    "Retry cleanup",
    "Ponów czyszczenie",
    "Bereinigung wiederholen",
    "Thử dọn dẹp lại",
  ),
  preparing: t("Preparing", "Przygotowywanie", "Vorbereitung", "Đang chuẩn bị"),
  uploading: t("Uploading", "Przesyłanie", "Hochladen", "Đang tải lên"),
  finalizing: t("Finalizing", "Finalizowanie", "Abschluss", "Đang hoàn tất"),
  completedUpload: t("Completed", "Ukończono", "Abgeschlossen", "Hoàn tất"),
  failedUpload: t("Failed", "Niepowodzenie", "Fehlgeschlagen", "Thất bại"),
  invalidFile: t(
    "Choose non-empty JPEG, PNG, or WebP files no larger than 20 MiB each.",
    "Wybierz niepuste pliki JPEG, PNG lub WebP o rozmiarze do 20 MiB każdy.",
    "Wählen Sie nicht leere JPEG-, PNG- oder WebP-Dateien bis jeweils 20 MiB.",
    "Chọn tệp JPEG, PNG hoặc WebP không trống, tối đa 20 MiB mỗi tệp.",
  ),
  limitExceeded: t(
    "A product draft can contain at most 20 pictures.",
    "Szkic produktu może zawierać maksymalnie 20 zdjęć.",
    "Ein Produktentwurf kann höchstens 20 Bilder enthalten.",
    "Bản nháp sản phẩm có thể chứa tối đa 20 hình ảnh.",
  ),
  retryFileMismatch: t(
    "Select the same file name, type, and size used for the original upload.",
    "Wybierz plik o tej samej nazwie, typie i rozmiarze co pierwotny plik.",
    "Wählen Sie denselben Dateinamen, Typ und dieselbe Größe wie beim ursprünglichen Upload.",
    "Chọn tệp có cùng tên, loại và kích thước như lần tải lên ban đầu.",
  ),
  staleGallery: t(
    "The gallery changed. It was refreshed; repeat the action.",
    "Galeria uległa zmianie. Odświeżono ją; powtórz działanie.",
    "Die Galerie wurde geändert und aktualisiert. Wiederholen Sie die Aktion.",
    "Thư viện đã thay đổi và được làm mới. Hãy lặp lại thao tác.",
  ),
  galleryActionFailed: t(
    "The image action could not be completed. Try again.",
    "Nie udało się wykonać operacji na zdjęciu. Spróbuj ponownie.",
    "Die Bildaktion konnte nicht abgeschlossen werden. Versuchen Sie es erneut.",
    "Không thể hoàn tất thao tác hình ảnh. Hãy thử lại.",
  ),
};

export type ProductDraftImageGalleryProps = {
  initialGallery: SellerProductDraftGallery;
  productTitle: string;
  refresh(): Promise<SellerProductDraftGallery>;
  productDraftId?: string;
  imageSourceMode?: SellerProductImageSourceMode;
  productStatus?: "draft" | "published" | "archived";
  moderationEditable?: boolean;
  disabled?: boolean;
  onGalleryChange?(gallery: SellerProductDraftGallery): void;
};

export function ProductDraftImageGallery({
  initialGallery,
  productTitle,
  refresh,
  productDraftId,
  imageSourceMode,
  productStatus,
  moderationEditable,
  disabled = false,
  onGalleryChange,
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
    onGalleryChange?.(gallery);
  }, [gallery, onGalleryChange]);

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
  const editable = Boolean(
    productDraftId &&
    (moderationEditable ?? (imageSourceMode === "seller_upload" && productStatus === "draft")),
  );
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
          {editable && productDraftId ? (
            <EditableGallery
              productDraftId={productDraftId}
              gallery={gallery}
              title={title}
              disabled={disabled}
              refresh={async () => {
                const nextGallery = await refresh();
                if (nextGallery.status !== "available") {
                  throw new Error("ProductDraft image gallery refresh was unavailable.");
                }
                setGallery(nextGallery);
                galleryRef.current = nextGallery;
                setLocallyUnavailable(new Set());
                replacementPendingImageIds.current.clear();
                return nextGallery;
              }}
              locallyUnavailable={locallyUnavailable}
              onLoad={(imageId) => replacementPendingImageIds.current.delete(imageId)}
              onError={(imageId) => void refreshGallery([imageId])}
              onOpen={(imageId, trigger) => {
                dialogTriggerRef.current = trigger;
                setDialogImageId(imageId);
              }}
            />
          ) : gallery.images.length === 0 ? (
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
                  actions={null}
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

type BrowserUploadState = "preparing" | "uploading" | "finalizing" | "completed" | "failed";

type BrowserUpload = {
  clientUploadId: string;
  filename: string;
  state: BrowserUploadState;
};

type ValidatedUpload = {
  clientUploadId: string;
  file: File;
  contentType: ProductDraftImageContentType;
};

function EditableGallery({
  productDraftId,
  gallery,
  title,
  disabled,
  refresh,
  locallyUnavailable,
  onLoad,
  onError,
  onOpen,
}: {
  productDraftId: string;
  gallery: SellerProductDraftGallery;
  title: string;
  disabled: boolean;
  refresh(): Promise<SellerProductDraftGallery>;
  locallyUnavailable: Set<string>;
  onLoad(imageId: string): void;
  onError(imageId: string): void;
  onOpen(imageId: string, trigger: HTMLButtonElement): void;
}) {
  const prepare = useServerFn(prepareMyProductDraftImageUploads);
  const finalize = useServerFn(finalizeMyProductDraftImageUploads);
  const updateGallery = useServerFn(updateMyProductDraftImageGallery);
  const removeImage = useServerFn(removeMyProductDraftImage);
  const retryCleanup = useServerFn(retryMyProductDraftImageCleanup);
  const addInputRef = useRef<HTMLInputElement>(null);
  const retryInputRef = useRef<HTMLInputElement>(null);
  const retryImageRef = useRef<SellerProductDraftGalleryImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState<BrowserUpload[]>([]);

  const sellerImages = [...gallery.images].sort(
    (left, right) => left.sourcePosition - right.sourcePosition,
  );
  const availableImages = sellerImages.filter((image) => image.durableStatus === "available");
  const activeCount = sellerImages.filter((image) => image.durableStatus !== "deleting").length;
  const galleryIncomplete = sellerImages.some((image) => image.durableStatus !== "available");
  const controlsDisabled = disabled || busy || gallery.status !== "available";
  const orderingDisabled = controlsDisabled || galleryIncomplete;

  async function handleNewSelection(fileList: FileList | null) {
    const files = fileList ? [...fileList] : [];
    if (addInputRef.current) addInputRef.current.value = "";
    if (files.length === 0) return;
    if (activeCount + files.length > PRODUCT_DRAFT_IMAGE_MAX_COUNT) {
      toast.error(tr(S.limitExceeded));
      return;
    }
    const validated = validateFiles(files);
    if (!validated) {
      toast.error(tr(S.invalidFile));
      return;
    }
    await uploadFiles(validated.map((file) => ({ ...file, clientUploadId: crypto.randomUUID() })));
  }

  async function handleRetrySelection(fileList: FileList | null) {
    const selected = fileList?.[0];
    const image = retryImageRef.current;
    retryImageRef.current = null;
    if (retryInputRef.current) retryInputRef.current.value = "";
    if (!selected || !image?.clientUploadId) return;
    const validated = validateFiles([selected])?.[0];
    if (
      !validated ||
      selected.name !== image.originalFilename ||
      validated.contentType !== image.contentType ||
      selected.size !== image.sizeBytes
    ) {
      toast.error(tr(S.retryFileMismatch));
      return;
    }
    await uploadFiles([{ ...validated, clientUploadId: image.clientUploadId }]);
  }

  async function uploadFiles(files: ValidatedUpload[]) {
    setBusy(true);
    setUploads(
      files.map((entry) => ({
        clientUploadId: entry.clientUploadId,
        filename: entry.file.name,
        state: "preparing",
      })),
    );
    try {
      const prepared = await prepare({
        data: {
          productDraftId,
          expectedModerationRevision: gallery.moderationRevision,
          expectedGalleryRevision: gallery.galleryRevision,
          files: files.map((entry) => ({
            clientUploadId: entry.clientUploadId,
            originalFilename: entry.file.name,
            contentType: entry.contentType,
            sizeBytes: entry.file.size,
          })),
        },
      });
      const fileByClientId = new Map(files.map((entry) => [entry.clientUploadId, entry]));
      const pending = prepared.images.filter((image) => image.durableStatus === "pending");
      const completedClientIds = prepared.images
        .filter((image) => image.durableStatus === "available")
        .map((image) => image.clientUploadId);
      setUploadStates(completedClientIds, "completed");
      setUploadStates(
        pending.map((image) => image.clientUploadId),
        "uploading",
      );

      await runWithConcurrency(pending, BROWSER_UPLOAD_CONCURRENCY, async (image) => {
        const entry = fileByClientId.get(image.clientUploadId);
        if (!entry || !image.uploadPath || !image.uploadToken) return;
        const response = await supabase.storage
          .from(PRODUCT_DRAFT_IMAGE_BUCKET)
          .uploadToSignedUrl(image.uploadPath, image.uploadToken, entry.file, {
            contentType: entry.contentType,
            upsert: false,
          });
        if (response.error) {
          setUploadStates([image.clientUploadId], "failed");
        }
      });

      setUploadStates(
        pending.map((image) => image.clientUploadId),
        "finalizing",
      );
      const finalized = await finalize({
        data: {
          productDraftId,
          expectedModerationRevision: prepared.moderationRevision,
          imageIds: prepared.images.map((image) => image.imageId),
        },
      });
      const preparedByImageId = new Map(prepared.images.map((image) => [image.imageId, image]));
      for (const image of finalized.images) {
        const clientUploadId = preparedByImageId.get(image.imageId)?.clientUploadId;
        if (!clientUploadId) continue;
        setUploadStates(
          [clientUploadId],
          image.durableStatus === "available" ? "completed" : "failed",
        );
      }
      await refresh();
    } catch (error) {
      setUploads((current) =>
        current.map((entry) =>
          entry.state === "completed" ? entry : { ...entry, state: "failed" },
        ),
      );
      await handleMutationError(error, refresh);
    } finally {
      setBusy(false);
    }
  }

  function setUploadStates(clientUploadIds: string[], state: BrowserUploadState) {
    if (clientUploadIds.length === 0) return;
    const selected = new Set(clientUploadIds);
    setUploads((current) =>
      current.map((entry) => (selected.has(entry.clientUploadId) ? { ...entry, state } : entry)),
    );
  }

  async function mutate(operation: () => Promise<unknown>) {
    setBusy(true);
    try {
      await operation();
      await refresh();
    } catch (error) {
      await handleMutationError(error, refresh);
    } finally {
      setBusy(false);
    }
  }

  function updateOrder(nextImages: SellerProductDraftGalleryImage[], coverImageId: string) {
    return mutate(() =>
      updateGallery({
        data: {
          productDraftId,
          expectedModerationRevision: gallery.moderationRevision,
          expectedGalleryRevision: gallery.galleryRevision,
          orderedAvailableImageIds: nextImages.map((image) => image.imageId),
          coverImageId,
        },
      }),
    );
  }

  function moveImage(imageId: string, offset: -1 | 1) {
    const index = availableImages.findIndex((image) => image.imageId === imageId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= availableImages.length) return;
    const next = [...availableImages];
    [next[index], next[target]] = [next[target]!, next[index]!];
    const coverImageId =
      availableImages.find((image) => image.isSourceCover)?.imageId ?? next[0]!.imageId;
    void updateOrder(next, coverImageId);
  }

  function makeCover(imageId: string) {
    void updateOrder(availableImages, imageId);
  }

  function remove(image: SellerProductDraftGalleryImage) {
    if (!window.confirm(tr(S.removeConfirmation))) return;
    void mutate(() =>
      removeImage({
        data: {
          productDraftId,
          imageId: image.imageId,
          expectedModerationRevision: gallery.moderationRevision,
          expectedGalleryRevision: gallery.galleryRevision,
        },
      }),
    );
  }

  function recover(image: SellerProductDraftGalleryImage) {
    if (image.recoveryAction === "retry_finalize") {
      void mutate(() =>
        finalize({
          data: {
            productDraftId,
            expectedModerationRevision: gallery.moderationRevision,
            imageIds: [image.imageId],
          },
        }),
      );
      return;
    }
    if (image.recoveryAction === "retry_upload") {
      retryImageRef.current = image;
      retryInputRef.current?.click();
      return;
    }
    if (image.recoveryAction === "retry_cleanup" && image.durableStatus === "deleting") {
      void mutate(() =>
        removeImage({
          data: {
            productDraftId,
            imageId: image.imageId,
            expectedModerationRevision: gallery.moderationRevision,
            expectedGalleryRevision: gallery.galleryRevision,
          },
        }),
      );
      return;
    }
    if (image.recoveryAction === "retry_cleanup") {
      void mutate(() =>
        retryCleanup({
          data: {
            productDraftId,
            imageId: image.imageId,
            expectedModerationRevision: gallery.moderationRevision,
          },
        }),
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {activeCount} of {PRODUCT_DRAFT_IMAGE_MAX_COUNT} {tr(S.pictures)}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={controlsDisabled || activeCount >= PRODUCT_DRAFT_IMAGE_MAX_COUNT}
          onClick={() => addInputRef.current?.click()}
        >
          {tr(S.addPictures)}
        </Button>
        <input
          ref={addInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(event) => void handleNewSelection(event.target.files)}
        />
        <input
          ref={retryInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => void handleRetrySelection(event.target.files)}
        />
      </div>

      {uploads.length > 0 ? (
        <ul aria-label="Image upload progress" className="space-y-1 text-sm">
          {uploads.map((upload) => (
            <li key={upload.clientUploadId} className="flex justify-between gap-4">
              <span className="truncate">{upload.filename}</span>
              <span className="text-muted-foreground">{tr(uploadStateLabel(upload.state))}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {sellerImages.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tr(S.empty)}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sellerImages.map((image, index) => (
            <GalleryImage
              key={image.imageId}
              image={image}
              title={title}
              locallyUnavailable={locallyUnavailable.has(image.imageId)}
              onLoad={() => onLoad(image.imageId)}
              onError={() => onError(image.imageId)}
              onOpen={(trigger) => onOpen(image.imageId, trigger)}
              actions={
                <>
                  {image.durableStatus === "available" ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={orderingDisabled || image.isSourceCover}
                        onClick={() => makeCover(image.imageId)}
                      >
                        {image.isSourceCover ? tr(S.cover) : tr(S.makeCover)}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`${tr(S.moveEarlier)}: ${image.originalFilename ?? title}`}
                        disabled={orderingDisabled || index === 0}
                        onClick={() => moveImage(image.imageId, -1)}
                      >
                        {tr(S.moveEarlier)}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`${tr(S.moveLater)}: ${image.originalFilename ?? title}`}
                        disabled={orderingDisabled || index === availableImages.length - 1}
                        onClick={() => moveImage(image.imageId, 1)}
                      >
                        {tr(S.moveLater)}
                      </Button>
                    </>
                  ) : null}
                  {image.recoveryAction ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={controlsDisabled}
                      onClick={() => recover(image)}
                    >
                      {tr(recoveryLabel(image.recoveryAction))}
                    </Button>
                  ) : null}
                  {image.canRemove && image.durableStatus !== "deleting" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={controlsDisabled}
                      onClick={() => remove(image)}
                    >
                      {tr(S.removePicture)}
                    </Button>
                  ) : null}
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function validateFiles(
  files: File[],
): Array<{ file: File; contentType: ProductDraftImageContentType }> | null {
  const supported = new Set<ProductDraftImageContentType>([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  const validated = files.map((file) => ({
    file,
    contentType: file.type as ProductDraftImageContentType,
  }));
  return validated.every(
    ({ file, contentType }) =>
      supported.has(contentType) &&
      file.size > 0 &&
      file.size <= PRODUCT_DRAFT_IMAGE_MAX_SIZE_BYTES,
  )
    ? validated
    : null;
}

async function handleMutationError(
  error: unknown,
  refresh: () => Promise<SellerProductDraftGallery>,
) {
  try {
    await refresh();
  } catch {
    // Preserve the last gallery. The operation error remains the actionable message.
  }
  if (lifecycleErrorCode(error) === "product_draft_image_gallery_stale") {
    toast.error(tr(S.staleGallery));
    return;
  }
  toast.error(lifecycleErrorMessage(error));
}

function lifecycleErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function lifecycleErrorMessage(error: unknown): string {
  switch (lifecycleErrorCode(error)) {
    case "product_draft_image_upload_limit_exceeded":
      return tr(S.limitExceeded);
    case "product_draft_image_upload_invalid":
    case "product_draft_image_upload_conflict":
      return tr(S.invalidFile);
    default:
      return error instanceof Error && error.message ? error.message : tr(S.galleryActionFailed);
  }
}

function recoveryLabel(action: NonNullable<SellerProductDraftGalleryImage["recoveryAction"]>) {
  if (action === "retry_finalize") return S.retryFinalize;
  if (action === "retry_upload") return S.retryUpload;
  return S.retryCleanup;
}

function uploadStateLabel(state: BrowserUploadState) {
  if (state === "preparing") return S.preparing;
  if (state === "uploading") return S.uploading;
  if (state === "finalizing") return S.finalizing;
  if (state === "completed") return S.completedUpload;
  return S.failedUpload;
}

async function runWithConcurrency<T>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<void>,
) {
  let next = 0;
  const run = async () => {
    while (next < values.length) {
      const index = next++;
      await worker(values[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
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
  actions,
}: {
  image: SellerProductDraftGalleryImage;
  title: string;
  locallyUnavailable: boolean;
  onLoad(): void;
  onError(): void;
  onOpen(trigger: HTMLButtonElement): void;
  actions: ReactNode;
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
      {actions ? <div className="flex flex-wrap gap-2 border-t p-3">{actions}</div> : null}
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
