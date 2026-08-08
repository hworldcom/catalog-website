import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ProductDraftFields } from "@/components/product/product-draft-fields";
import { ProductPublicationStatus } from "@/components/product/product-publication-status";
import { isActiveProductPublication } from "@/components/product/product-publication-status.utils";
import { productCodeCopy } from "@/features/product-code/product-code.copy";
import type { ProductDraftDescriptionEditorState } from "@/features/product-draft-descriptions/components/product-draft-description-editor";
import { PRODUCT_DRAFT_DESCRIPTION_MAX_LENGTH } from "@/features/product-draft-descriptions/product-draft-descriptions.types";
import type { ProductDraftFactsEditorState } from "@/features/product-draft-facts/components/product-draft-facts-editor";
import type { ProductDraftTitleSnapshot } from "@/features/product-draft-title/product-draft-title.types";
import { t, tr } from "@/lib/i18n";
import { listProductCategories } from "@/features/seller/categories.functions";
import {
  getMyProductPublication,
  publishMyProduct,
  retryMyProductPublication,
} from "@/features/seller/product-publication.functions";
import type {
  SellerProductImagePublicationMode,
  SellerProductPublicationSnapshot,
} from "@/features/seller/seller-product-publication.types";
import type { SellerProductImageSourceMode } from "@/features/seller/server/seller-product-draft-read.service";
import { saveMyProduct } from "@/features/seller/products.functions";

import { Field } from "./field";

const S = {
  publication: t(
    "Product publication",
    "Publikacja produktu",
    "Produktveröffentlichung",
    "Xuất bản sản phẩm",
  ),
  publishing: t(
    "Publishing product and images",
    "Publikowanie produktu i zdjęć",
    "Produkt und Bilder werden veröffentlicht",
    "Đang xuất bản sản phẩm và hình ảnh",
  ),
  published: t(
    "Product published",
    "Produkt opublikowany",
    "Produkt veröffentlicht",
    "Sản phẩm đã được xuất bản",
  ),
  failed: t(
    "Publication failed",
    "Publikowanie nie powiodło się",
    "Veröffentlichung fehlgeschlagen",
    "Xuất bản thất bại",
  ),
  cleanup: t(
    "Publication cleanup required",
    "Wymagane czyszczenie publikacji",
    "Bereinigung der Veröffentlichung erforderlich",
    "Cần dọn dẹp quá trình xuất bản",
  ),
  pending: t(
    "Publication is queued and will start shortly.",
    "Publikacja jest w kolejce i rozpocznie się wkrótce.",
    "Die Veröffentlichung ist eingereiht und beginnt in Kürze.",
    "Quá trình xuất bản đang trong hàng đợi và sẽ sớm bắt đầu.",
  ),
  running: t(
    "The public product images are being prepared.",
    "Publiczne zdjęcia produktu są przygotowywane.",
    "Die öffentlichen Produktbilder werden vorbereitet.",
    "Hình ảnh công khai của sản phẩm đang được chuẩn bị.",
  ),
  completed: t(
    "The product and its images are publicly available.",
    "Produkt i jego zdjęcia są dostępne publicznie.",
    "Das Produkt und seine Bilder sind öffentlich verfügbar.",
    "Sản phẩm và hình ảnh hiện đã được công khai.",
  ),
  introduction: t(
    "Publishing creates stable public copies of the approved imported images.",
    "Publikowanie tworzy trwałe publiczne kopie zatwierdzonych importowanych zdjęć.",
    "Beim Veröffentlichen werden dauerhafte öffentliche Kopien der genehmigten importierten Bilder erstellt.",
    "Việc xuất bản tạo các bản sao công khai ổn định của hình ảnh nhập đã được phê duyệt.",
  ),
  cleanupGuidance: t(
    "Temporary public-image files must be cleaned up before publication can be retried.",
    "Tymczasowe publiczne pliki zdjęć muszą zostać usunięte przed ponowną próbą publikacji.",
    "Temporäre öffentliche Bilddateien müssen vor einem erneuten Veröffentlichungsversuch bereinigt werden.",
    "Các tệp hình ảnh công khai tạm thời phải được dọn dẹp trước khi có thể thử xuất bản lại.",
  ),
  retry: t(
    "Retry publication",
    "Ponów publikację",
    "Veröffentlichung erneut versuchen",
    "Thử xuất bản lại",
  ),
  publish: t("Publish", "Opublikuj", "Veröffentlichen", "Xuất bản"),
  support: t(
    "Contact support before trying to publish this product again.",
    "Skontaktuj się z pomocą techniczną przed ponowną próbą publikacji tego produktu.",
    "Wenden Sie sich an den Support, bevor Sie dieses Produkt erneut veröffentlichen.",
    "Hãy liên hệ bộ phận hỗ trợ trước khi thử xuất bản lại sản phẩm này.",
  ),
  refreshFailed: t(
    "Publication status could not be refreshed. The last known state is preserved.",
    "Nie udało się odświeżyć stanu publikacji. Zachowano ostatni znany stan.",
    "Der Veröffentlichungsstatus konnte nicht aktualisiert werden. Der letzte bekannte Stand bleibt erhalten.",
    "Không thể làm mới trạng thái xuất bản. Trạng thái gần nhất vẫn được giữ lại.",
  ),
  refresh: t("Refresh status", "Odśwież stan", "Status aktualisieren", "Làm mới trạng thái"),
  viewPublished: t(
    "View published product",
    "Zobacz opublikowany produkt",
    "Veröffentlichtes Produkt ansehen",
    "Xem sản phẩm đã xuất bản",
  ),
  publicationStarted: t(
    "Publication started.",
    "Publikowanie rozpoczęte.",
    "Veröffentlichung gestartet.",
    "Đã bắt đầu xuất bản.",
  ),
  publicationRetryStarted: t(
    "Publication retry started.",
    "Ponowne publikowanie rozpoczęte.",
    "Erneuter Veröffentlichungsversuch gestartet.",
    "Đã bắt đầu thử xuất bản lại.",
  ),
  refreshesAutomatically: t(
    "Publication status refreshes automatically.",
    "Stan publikacji odświeża się automatycznie.",
    "Der Veröffentlichungsstatus wird automatisch aktualisiert.",
    "Trạng thái xuất bản tự động làm mới.",
  ),
  invalid: t(
    "Check the product fields and try again.",
    "Sprawdź pola produktu i spróbuj ponownie.",
    "Prüfen Sie die Produktfelder und versuchen Sie es erneut.",
    "Kiểm tra các trường sản phẩm và thử lại.",
  ),
  authenticationRequired: t(
    "Sign in again before publishing this product.",
    "Zaloguj się ponownie przed opublikowaniem tego produktu.",
    "Melden Sie sich erneut an, bevor Sie dieses Produkt veröffentlichen.",
    "Đăng nhập lại trước khi xuất bản sản phẩm này.",
  ),
  notFound: t(
    "The product was not found.",
    "Nie znaleziono produktu.",
    "Das Produkt wurde nicht gefunden.",
    "Không tìm thấy sản phẩm.",
  ),
  inProgress: t(
    "Another publication is already running. Your submitted changes were not saved.",
    "Inna publikacja jest już w toku. Przesłane zmiany nie zostały zapisane.",
    "Eine andere Veröffentlichung läuft bereits. Ihre übermittelten Änderungen wurden nicht gespeichert.",
    "Một quá trình xuất bản khác đang chạy. Các thay đổi đã gửi chưa được lưu.",
  ),
  notAllowed: t(
    "The product cannot be published in its current state.",
    "Produktu nie można opublikować w jego obecnym stanie.",
    "Das Produkt kann in seinem aktuellen Zustand nicht veröffentlicht werden.",
    "Không thể xuất bản sản phẩm ở trạng thái hiện tại.",
  ),
  notEditable: t(
    "This product was archived and can no longer be edited.",
    "Ten produkt został zarchiwizowany i nie można go już edytować.",
    "Dieses Produkt wurde archiviert und kann nicht mehr bearbeitet werden.",
    "Sản phẩm này đã được lưu trữ và không thể chỉnh sửa nữa.",
  ),
  configurationInvalid: t(
    "Product publication is temporarily misconfigured.",
    "Publikacja produktu jest tymczasowo nieprawidłowo skonfigurowana.",
    "Die Produktveröffentlichung ist vorübergehend falsch konfiguriert.",
    "Cấu hình xuất bản sản phẩm hiện không hợp lệ.",
  ),
  unavailable: t(
    "Product publication is temporarily unavailable. Try again.",
    "Publikacja produktu jest tymczasowo niedostępna. Spróbuj ponownie.",
    "Die Produktveröffentlichung ist vorübergehend nicht verfügbar. Versuchen Sie es erneut.",
    "Tính năng xuất bản sản phẩm tạm thời không khả dụng. Hãy thử lại.",
  ),
  publishFailed: t(
    "Product could not be published.",
    "Nie udało się opublikować produktu.",
    "Das Produkt konnte nicht veröffentlicht werden.",
    "Không thể xuất bản sản phẩm.",
  ),
  retryFailed: t(
    "Publication could not be retried.",
    "Nie udało się ponowić publikacji.",
    "Die Veröffentlichung konnte nicht erneut versucht werden.",
    "Không thể thử xuất bản lại.",
  ),
  titleRequired: t(
    "Enter and save a product title before publishing.",
    "Wprowadź i zapisz tytuł produktu przed publikacją.",
    "Geben Sie vor der Veröffentlichung einen Produkttitel ein und speichern Sie ihn.",
    "Nhập và lưu tên sản phẩm trước khi xuất bản.",
  ),
  titleInvalid: t(
    "Enter a product title with at most 50 characters.",
    "Wprowadź tytuł produktu zawierający maksymalnie 50 znaków.",
    "Geben Sie einen Produkttitel mit höchstens 50 Zeichen ein.",
    "Nhập tên sản phẩm có tối đa 50 ký tự.",
  ),
  categoryRequired: t(
    "Select a product category before publishing.",
    "Wybierz kategorię produktu przed publikacją.",
    "Wählen Sie vor der Veröffentlichung eine Produktkategorie.",
    "Chọn danh mục sản phẩm trước khi xuất bản.",
  ),
  publicationFieldsRequired: t(
    "Enter a title and select a category before publishing. You can save the product as a draft without them.",
    "Przed publikacją wprowadź tytuł i wybierz kategorię. Produkt można zapisać jako szkic bez tych danych.",
    "Geben Sie vor der Veröffentlichung einen Titel ein und wählen Sie eine Kategorie. Ohne diese Angaben können Sie das Produkt als Entwurf speichern.",
    "Nhập tên và chọn danh mục trước khi xuất bản. Bạn vẫn có thể lưu sản phẩm dưới dạng bản nháp khi chưa có các thông tin này.",
  ),
  descriptionInvalid: t(
    "Enter product descriptions with at most 300 characters each.",
    "Każdy opis produktu może zawierać maksymalnie 300 znaków.",
    "Geben Sie Produktbeschreibungen mit jeweils höchstens 300 Zeichen ein.",
    "Nhập mỗi mô tả sản phẩm tối đa 300 ký tự.",
  ),
  imageRequired: t(
    "Add at least one product picture before publishing.",
    "Dodaj co najmniej jedno zdjęcie produktu przed publikacją.",
    "Fügen Sie vor der Veröffentlichung mindestens ein Produktbild hinzu.",
    "Thêm ít nhất một hình ảnh sản phẩm trước khi xuất bản.",
  ),
  imagesNotReady: t(
    "Resolve pending, failed, or deleting product pictures before publishing.",
    "Rozwiąż problemy z oczekującymi, nieudanymi lub usuwanymi zdjęciami przed publikacją.",
    "Beheben Sie ausstehende, fehlgeschlagene oder zu löschende Produktbilder vor der Veröffentlichung.",
    "Xử lý hình ảnh đang chờ, thất bại hoặc đang xóa trước khi xuất bản.",
  ),
  dispatchFailed: t(
    "Publication could not be started. Try again.",
    "Nie udało się rozpocząć publikacji. Spróbuj ponownie.",
    "Die Veröffentlichung konnte nicht gestartet werden. Versuchen Sie es erneut.",
    "Không thể bắt đầu xuất bản. Hãy thử lại.",
  ),
  sourceUnavailable: t(
    "One or more product pictures could not be read. Try again. If the problem continues, contact support.",
    "Nie udało się odczytać co najmniej jednego zdjęcia produktu. Spróbuj ponownie. Jeśli problem będzie się powtarzał, skontaktuj się z pomocą techniczną.",
    "Mindestens ein Produktbild konnte nicht gelesen werden. Versuchen Sie es erneut. Wenn das Problem weiterhin besteht, wenden Sie sich an den Support.",
    "Không thể đọc một hoặc nhiều hình ảnh sản phẩm. Hãy thử lại. Nếu sự cố tiếp diễn, hãy liên hệ bộ phận hỗ trợ.",
  ),
  sourceChanged: t(
    "A product picture changed after publication was prepared. Contact support before publishing again.",
    "Zdjęcie produktu zmieniło się po przygotowaniu publikacji. Skontaktuj się z pomocą techniczną przed ponowną publikacją.",
    "Ein Produktbild wurde nach der Vorbereitung der Veröffentlichung geändert. Wenden Sie sich vor einer erneuten Veröffentlichung an den Support.",
    "Một hình ảnh sản phẩm đã thay đổi sau khi chuẩn bị xuất bản. Hãy liên hệ bộ phận hỗ trợ trước khi xuất bản lại.",
  ),
  destinationConflict: t(
    "A public product picture conflicts with an existing file. Contact support before publishing again.",
    "Publiczne zdjęcie produktu koliduje z istniejącym plikiem. Skontaktuj się z pomocą techniczną przed ponowną publikacją.",
    "Ein öffentliches Produktbild steht im Konflikt mit einer vorhandenen Datei. Wenden Sie sich vor einer erneuten Veröffentlichung an den Support.",
    "Một hình ảnh sản phẩm công khai xung đột với tệp hiện có. Hãy liên hệ bộ phận hỗ trợ trước khi xuất bản lại.",
  ),
  transferFailed: t(
    "One or more product pictures could not be copied for publication. Try again.",
    "Nie udało się skopiować co najmniej jednego zdjęcia produktu do publikacji. Spróbuj ponownie.",
    "Mindestens ein Produktbild konnte nicht zur Veröffentlichung kopiert werden. Versuchen Sie es erneut.",
    "Không thể sao chép một hoặc nhiều hình ảnh sản phẩm để xuất bản. Hãy thử lại.",
  ),
  verificationFailed: t(
    "A copied product picture could not be verified. Try again.",
    "Nie udało się zweryfikować skopiowanego zdjęcia produktu. Spróbuj ponownie.",
    "Ein kopiertes Produktbild konnte nicht überprüft werden. Versuchen Sie es erneut.",
    "Không thể xác minh hình ảnh sản phẩm đã sao chép. Hãy thử lại.",
  ),
  finalizationFailed: t(
    "The product could not be finalized after its pictures were prepared. Check the product fields, save any corrections, and try again.",
    "Nie udało się sfinalizować produktu po przygotowaniu zdjęć. Sprawdź pola produktu, zapisz poprawki i spróbuj ponownie.",
    "Das Produkt konnte nach der Vorbereitung seiner Bilder nicht abgeschlossen werden. Prüfen Sie die Produktfelder, speichern Sie Korrekturen und versuchen Sie es erneut.",
    "Không thể hoàn tất sản phẩm sau khi chuẩn bị hình ảnh. Kiểm tra các trường sản phẩm, lưu chỉnh sửa và thử lại.",
  ),
  unknownFailure: t(
    "Product publication encountered an unexpected problem. Try again or contact support if it continues.",
    "Podczas publikowania produktu wystąpił nieoczekiwany problem. Spróbuj ponownie lub skontaktuj się z pomocą techniczną, jeśli problem będzie się powtarzał.",
    "Bei der Produktveröffentlichung ist ein unerwartetes Problem aufgetreten. Versuchen Sie es erneut oder wenden Sie sich an den Support, wenn es weiterhin besteht.",
    "Đã xảy ra sự cố không mong muốn khi xuất bản sản phẩm. Hãy thử lại hoặc liên hệ bộ phận hỗ trợ nếu sự cố tiếp diễn.",
  ),
};

type ProductInitial = {
  id: string;
  title: string;
  product_code: string | null;
  title_source: "human" | "model" | null;
  description: string | null;
  category_id: string | null;
  moq: number | null;
  pack_size: string | null;
  price: number | string | null;
  currency: string;
  stock: "in_stock" | "low_stock" | "out_of_stock" | "made_to_order";
  cover_image_url: string | null;
  trending: boolean;
  status: "draft" | "published" | "archived";
  imagePublicationMode?: SellerProductImagePublicationMode;
  imageSourceMode?: SellerProductImageSourceMode;
} | null;

type ProductForm = {
  id: string | undefined;
  title: string;
  description: string;
  category_id: string;
  moq: string;
  pack_size: string;
  price: string;
  currency: string;
  stock: "in_stock" | "low_stock" | "out_of_stock" | "made_to_order";
  cover_image_url: string;
  trending: boolean;
};

const cleanFactsState: ProductDraftFactsEditorState = {
  dirty: false,
  saving: false,
};

const cleanDescriptionState: ProductDraftDescriptionEditorState = {
  dirty: false,
  saving: false,
};

export type ProductEditorCoordinationState = {
  dirty: boolean;
  saving: boolean;
  publicationActive: boolean;
};

export type ProductEditorTitleReplacement = {
  version: number;
  snapshot: ProductDraftTitleSnapshot;
};

export type ProductEditorGalleryState = {
  activeImageCount: number;
  hasDurableImages: boolean;
  hasAvailableCover: boolean;
  incomplete: boolean;
};

export type SavedProductSnapshot = {
  id: string;
  title: string;
  titleSource: "human" | "model" | null;
  status: "draft" | "published" | "archived";
};

export function ProductEditor({
  initial,
  factsState = cleanFactsState,
  descriptionState = cleanDescriptionState,
  disabled = false,
  titleReplacement = null,
  onSaved,
  onProductSaved,
  onStateChange,
  onDisplayTitleChange,
  galleryState,
}: {
  initial: ProductInitial;
  factsState?: ProductDraftFactsEditorState;
  descriptionState?: ProductDraftDescriptionEditorState;
  disabled?: boolean;
  titleReplacement?: ProductEditorTitleReplacement | null;
  onSaved?: (id: string) => void;
  onProductSaved?: (snapshot: SavedProductSnapshot) => void;
  onStateChange?: (state: ProductEditorCoordinationState) => void;
  onDisplayTitleChange?: (title: string) => void;
  galleryState?: ProductEditorGalleryState;
}) {
  const save = useServerFn(saveMyProduct);
  const publish = useServerFn(publishMyProduct);
  const getPublication = useServerFn(getMyProductPublication);
  const retryPublication = useServerFn(retryMyProductPublication);
  const listCats = useServerFn(listProductCategories);
  const queryClient = useQueryClient();
  const cats = useQuery({ queryKey: ["product-categories"], queryFn: () => listCats() });

  const [form, setForm] = useState<ProductForm>(() => productForm(initial));
  const [savedForm, setSavedForm] = useState<ProductForm>(() => productForm(initial));
  const [busy, setBusy] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [titleSource, setTitleSource] = useState(initial?.title_source ?? null);
  const [publicationSnapshot, setPublicationSnapshot] =
    useState<SellerProductPublicationSnapshot | null>(null);
  const completionHandled = useRef(initial?.status === "published");

  const productId = initial?.id ?? null;
  const imagePublicationMode = initial?.imagePublicationMode ?? "direct";
  const imageSourceMode = initial?.imageSourceMode ?? "seller_upload";
  const resolvedGalleryState = galleryState ?? {
    activeImageCount: imagePublicationMode === "imported" ? 1 : 0,
    hasDurableImages: imagePublicationMode === "imported",
    hasAvailableCover: imagePublicationMode === "imported",
    incomplete: false,
  };
  const usesDurablePublication =
    imageSourceMode === "classifier_import" || resolvedGalleryState.hasDurableImages;
  const isPublished = initial?.status === "published";
  const publicationQuery = useQuery({
    queryKey: ["my-product-publication", productId],
    queryFn: () => getPublication({ data: { productDraftId: productId! } }),
    enabled: Boolean(productId && usesDurablePublication),
    retry: false,
    refetchInterval: (query) =>
      isActiveProductPublication(query.state.data?.publicationStatus) ? 2_000 : false,
  });
  const currentPublication = publicationSnapshot ?? publicationQuery.data ?? null;
  const publicationActive = isActiveProductPublication(currentPublication?.publicationStatus);
  const dirty = !sameProductForm(form, savedForm);

  useEffect(() => {
    if (!initial) return;
    const next = productForm(initial);
    setForm(next);
    setSavedForm(next);
    setTitleTouched(false);
    setDescriptionTouched(false);
    setTitleSource(initial.title_source);
  }, [initial]);

  useEffect(() => {
    if (!titleReplacement) return;
    setForm((current) => ({ ...current, title: titleReplacement.snapshot.title }));
    setSavedForm((current) => ({ ...current, title: titleReplacement.snapshot.title }));
    setTitleTouched(false);
    setTitleSource(titleReplacement.snapshot.titleSource);
  }, [titleReplacement]);

  useEffect(() => {
    onStateChange?.({ dirty, saving: busy, publicationActive });
  }, [busy, dirty, onStateChange, publicationActive]);

  useEffect(
    () => () => onStateChange?.({ dirty: false, saving: false, publicationActive: false }),
    [onStateChange],
  );

  useEffect(() => {
    if (publicationQuery.data) setPublicationSnapshot(publicationQuery.data);
  }, [publicationQuery.data]);

  useEffect(() => {
    const completed =
      currentPublication?.publicationStatus === "completed" ||
      (currentPublication?.publicationStatus === "not_required" &&
        currentPublication.productStatus === "published");
    if (!completed || completionHandled.current || !productId) return;
    completionHandled.current = true;

    void refreshCompletedProduct(queryClient, productId).then(() => {
      toast.success("Product and images were published.");
    });
  }, [currentPublication, productId, queryClient]);

  async function submitDraft() {
    setBusy(true);
    try {
      const res = await save({
        data: {
          ...productFields(form, {
            includeCover: false,
            titleTouched,
            descriptionTouched,
          }),
          id: form.id,
          publish: isPublished,
        },
      });
      applySavedProduct(res);
      await refreshSavedProduct(queryClient, form.id, initial?.status, res.status);
      toast.success(isPublished ? "Changes saved" : "Draft saved");
      if (!form.id && onSaved) onSaved(res.id);
    } catch (error) {
      if (publicationErrorCode(error) === "product_publication_not_allowed" && form.id) {
        await queryClient.invalidateQueries({ queryKey: ["my-product", form.id] });
      }
      toast.error(publicationErrorMessage(error, "Product could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function submitPublication() {
    if (!form.id) return;
    if (
      factsState.dirty ||
      factsState.saving ||
      descriptionState.dirty ||
      descriptionState.saving
    ) {
      return;
    }

    setBusy(true);
    try {
      const snapshot = await publish({
        data: {
          ...productFields(form, {
            includeCover: false,
            titleTouched,
            descriptionTouched,
          }),
          id: form.id,
        },
      });
      replacePublicationSnapshot(snapshot);
      if (snapshot.publicationStatus === "pending" || snapshot.publicationStatus === "running") {
        toast.success(tr(S.publicationStarted));
      }
    } catch (error) {
      const code = publicationErrorCode(error);
      if (code === "product_publication_in_progress") {
        await observeCurrentPublication();
      }
      if (code === "product_publication_not_allowed") {
        await queryClient.invalidateQueries({ queryKey: ["my-product", form.id] });
      }
      toast.error(publicationErrorMessage(error, tr(S.publishFailed)));
    } finally {
      setBusy(false);
    }
  }

  async function observeCurrentPublication() {
    if (!form.id) return;
    const result = await publicationQuery.refetch();
    if (result.data) replacePublicationSnapshot(result.data);
  }

  async function retryDurablePublication() {
    if (!form.id) return;
    setBusy(true);
    try {
      const snapshot = await retryPublication({
        data: { productDraftId: form.id },
      });
      replacePublicationSnapshot(snapshot);
      toast.success(tr(S.publicationRetryStarted));
    } catch (error) {
      toast.error(publicationErrorMessage(error, tr(S.retryFailed)));
    } finally {
      setBusy(false);
    }
  }

  function applySavedProduct(saved: SavedProductSnapshot) {
    const nextForm = { ...form, title: saved.title };
    setForm(nextForm);
    setSavedForm(nextForm);
    setTitleTouched(false);
    setDescriptionTouched(false);
    setTitleSource(saved.titleSource);
    onDisplayTitleChange?.(saved.title);
    onProductSaved?.(saved);
  }

  function replacePublicationSnapshot(snapshot: SellerProductPublicationSnapshot) {
    setPublicationSnapshot(snapshot);
    queryClient.setQueryData(["my-product-publication", snapshot.productDraftId], snapshot);
  }

  const inputCls = "border border-border bg-background px-3 py-2 text-sm";
  const titleReadOnly = initial?.status === "published" || initial?.status === "archived";
  const descriptionReadOnly = titleReadOnly;
  const publishBlockedByEditors =
    factsState.dirty || factsState.saving || descriptionState.dirty || descriptionState.saving;
  const publishBlockedByRequiredFields = form.title.trim() === "" || form.category_id.trim() === "";
  const publishBlockedByGallery =
    !productId || !resolvedGalleryState.hasAvailableCover || resolvedGalleryState.incomplete;
  const actionsDisabled = disabled || busy || publicationActive;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {initial ? "Edit product" : "New product"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isPublished ? "Live on your storefront." : "Draft — not visible to buyers yet."}
          </p>
          {initial ? (
            <p className="mt-2 text-xs text-muted-foreground">
              <span>{tr(productCodeCopy.label)}: </span>
              <span className="select-text font-mono text-foreground">
                {initial.product_code ?? tr(productCodeCopy.assignedWhenPublishing)}
              </span>
            </p>
          ) : null}
        </div>
        <Link to="/seller/products" className="text-xs text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
      </div>

      {initial && usesDurablePublication ? (
        <ProductPublicationStatus
          snapshot={currentPublication}
          statusReadFailed={publicationQuery.isError}
          busy={busy || disabled}
          onRefresh={() => void observeCurrentPublication()}
          onRetry={() => void retryDurablePublication()}
        />
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submitDraft();
        }}
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        <div className="md:col-span-2">
          <ProductDraftFields
            value={{
              title: form.title,
              categoryId: form.category_id,
              minimumOrderQuantity: form.moq,
              packSize: form.pack_size,
              price: form.price,
              currency: form.currency,
              stock: form.stock,
              trending: form.trending,
            }}
            categories={cats.data?.categories ?? []}
            titleSource={titleSource}
            disabled={disabled || publicationActive}
            titleDisabled={titleReadOnly || disabled || publicationActive}
            onChange={(next) => {
              if (next.title !== form.title) setTitleTouched(true);
              if (next.title !== form.title) onDisplayTitleChange?.(next.title);
              setForm({
                ...form,
                title: next.title,
                category_id: next.categoryId,
                moq: next.minimumOrderQuantity,
                pack_size: next.packSize,
                price: next.price,
                currency: next.currency,
                stock: next.stock,
                trending: next.trending,
              });
            }}
          />
        </div>
        {!initial ? (
          <div className="md:col-span-2">
            <Field label="Description">
              <textarea
                rows={6}
                maxLength={PRODUCT_DRAFT_DESCRIPTION_MAX_LENGTH}
                value={form.description}
                onChange={(event) => {
                  setForm({ ...form, description: event.target.value });
                  setDescriptionTouched(true);
                }}
                className={inputCls}
                disabled={descriptionReadOnly || disabled}
              />
            </Field>
          </div>
        ) : null}
        {publishBlockedByEditors && !isPublished ? (
          <p className="text-sm text-amber-700 md:col-span-2">
            Save product details and descriptions before publishing.
          </p>
        ) : null}

        {publishBlockedByRequiredFields && !isPublished ? (
          <p className="text-sm text-amber-700 md:col-span-2">{tr(S.publicationFieldsRequired)}</p>
        ) : null}

        {publishBlockedByGallery && !isPublished ? (
          <p className="text-sm text-amber-700 md:col-span-2">
            {resolvedGalleryState.incomplete ? tr(S.imagesNotReady) : tr(S.imageRequired)}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button
            type="submit"
            disabled={actionsDisabled}
            className="border border-border bg-card px-4 py-2.5 text-sm font-medium hover:border-primary disabled:opacity-60"
          >
            {isPublished ? "Save changes" : "Save draft"}
          </button>
          {!isPublished ? (
            <button
              type="button"
              disabled={
                actionsDisabled ||
                publishBlockedByEditors ||
                publishBlockedByRequiredFields ||
                publishBlockedByGallery
              }
              onClick={() => void submitPublication()}
              className="bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {tr(S.publish)}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function productForm(initial: ProductInitial): ProductForm {
  return {
    id: initial?.id,
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    category_id: initial?.category_id ?? "",
    moq: initial?.moq != null ? String(initial.moq) : "",
    pack_size: initial?.pack_size ?? "",
    price: initial?.price != null ? String(initial.price) : "",
    currency: initial?.currency ?? "USD",
    stock: initial?.stock ?? "in_stock",
    cover_image_url: initial?.cover_image_url ?? "",
    trending: initial?.trending ?? false,
  };
}

function sameProductForm(left: ProductForm, right: ProductForm): boolean {
  return (
    left.id === right.id &&
    left.title === right.title &&
    left.description === right.description &&
    left.category_id === right.category_id &&
    left.moq === right.moq &&
    left.pack_size === right.pack_size &&
    left.price === right.price &&
    left.currency === right.currency &&
    left.stock === right.stock &&
    left.cover_image_url === right.cover_image_url &&
    left.trending === right.trending
  );
}

function productFields(
  form: ProductForm,
  options: {
    includeCover: boolean;
    titleTouched: boolean;
    descriptionTouched: boolean;
  },
) {
  return {
    ...(!form.id || options.titleTouched ? { title: form.title } : {}),
    ...(!form.id || options.descriptionTouched ? { description: form.description } : {}),
    category_id: form.category_id || null,
    moq: form.moq ? Number(form.moq) : null,
    pack_size: form.pack_size,
    price: form.price ? Number(form.price) : null,
    currency: form.currency,
    stock: form.stock,
    ...(options.includeCover ? { cover_image_url: form.cover_image_url } : {}),
    trending: form.trending,
  };
}

function publicationErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function publicationErrorMessage(error: unknown, fallback: string): string {
  switch (publicationErrorCode(error)) {
    case "product_publication_invalid":
      return tr(S.invalid);
    case "authentication_required":
      return tr(S.authenticationRequired);
    case "product_not_found":
      return tr(S.notFound);
    case "product_publication_title_required":
      return tr(S.titleRequired);
    case "product_publication_title_invalid":
      return tr(S.titleInvalid);
    case "product_publication_category_required":
      return tr(S.categoryRequired);
    case "product_publication_description_invalid":
      return tr(S.descriptionInvalid);
    case "product_publication_image_required":
      return tr(S.imageRequired);
    case "product_publication_images_not_ready":
      return tr(S.imagesNotReady);
    case "product_publication_in_progress":
      return tr(S.inProgress);
    case "product_publication_not_allowed":
      return tr(S.notAllowed);
    case "product_draft_title_not_editable":
      return tr(S.notEditable);
    case "product_publication_configuration_invalid":
      return tr(S.configurationInvalid);
    case "product_publication_unavailable":
      return tr(S.unavailable);
    default:
      return error instanceof Error && error.message ? error.message : fallback;
  }
}

async function refreshSavedProduct(
  queryClient: ReturnType<typeof useQueryClient>,
  productId: string | null | undefined,
  previousStatus: string | null | undefined,
  savedStatus: string,
) {
  await queryClient.invalidateQueries({ queryKey: ["my-products"] });
  if (!productId || previousStatus !== savedStatus) {
    await queryClient.invalidateQueries({ queryKey: ["my-product-summary"] });
  }
  if (productId) {
    await queryClient.invalidateQueries({ queryKey: ["my-product", productId] });
  }
}

async function refreshCompletedProduct(
  queryClient: ReturnType<typeof useQueryClient>,
  productId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["my-products"] }),
    queryClient.invalidateQueries({ queryKey: ["my-product", productId] }),
    queryClient.invalidateQueries({ queryKey: ["my-product-summary"] }),
  ]);
}
