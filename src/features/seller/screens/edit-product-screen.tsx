import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductDraftDescriptionEditorState } from "@/features/product-draft-descriptions/components/product-draft-description-editor";
import {
  SellerProductDraftDescriptionSection,
  type DescriptionGenerationRefreshScope,
} from "@/features/product-draft-descriptions/components/seller-product-draft-description-section";
import {
  ProductDraftFactsEditor,
  type ProductDraftFactsEditorState,
} from "@/features/product-draft-facts/components/product-draft-facts-editor";
import type { ProductDraftTitleSnapshot } from "@/features/product-draft-title/product-draft-title.types";
import { listProductCategories } from "@/features/seller/categories.functions";
import {
  abandonMyFailedProductActivation,
  beginMyProductEditing,
  retryMyProductAbandonmentCleanup,
  submitMyProductForModeration,
  withdrawMyProductModerationSubmission,
} from "@/features/seller/product-moderation.functions";
import { productModerationErrorCode } from "@/features/seller/product-moderation.types";
import {
  useProductModerationMutationCoordinator,
  type ProductModerationMutationCoordinator,
} from "@/features/seller/product-moderation-mutation-coordinator";
import type { ProductModerationStatusDetail } from "@/features/seller/product-moderation-status.types";
import { useProductModerationStatusRefresh } from "@/features/seller/product-moderation-status-refresh";
import {
  archiveMyProduct,
  getMyProduct,
  getMyProductModerationStatus,
  restoreMyProduct,
} from "@/features/seller/products.functions";
import { t, tr } from "@/lib/i18n";

import { ProductDraftImageGallery } from "../components/product-draft-image-gallery";
import {
  ProductEditor,
  type ProductEditorCoordinationState,
  type ProductEditorGalleryState,
  type ProductEditorTitleReplacement,
  type SavedProductSnapshot,
} from "../components/product-editor";
import {
  ProductModerationAxes,
  ProductModerationOutcomeNotice,
  ProductModerationSubmittedRevisionView,
} from "../components/product-moderation-status-view";

const cleanProductState: ProductEditorCoordinationState = {
  dirty: false,
  saving: false,
  publicationActive: false,
};
const cleanEditorState = { dirty: false, saving: false };
const emptyGalleryState: ProductEditorGalleryState = {
  activeImageCount: 0,
  hasDurableImages: false,
  hasAvailableCover: false,
  incomplete: false,
};
const cleanGalleryMutation = { active: false, failed: false };

type PrivateEditorCoordination = {
  dirty: boolean;
  active: boolean;
  galleryFailed: boolean;
};

export function EditProductScreen({ productId }: { productId: string }) {
  const getStatus = useServerFn(getMyProductModerationStatus);
  const statusQuery = useQuery({
    queryKey: ["my-product-moderation", productId],
    queryFn: () => getStatus({ data: { id: productId } }),
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  if (statusQuery.isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        {tr(t("Loading…", "Ładowanie…", "Wird geladen…", "Đang tải…"))}
      </div>
    );
  }
  if (statusQuery.isError || !statusQuery.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {tr(
              t(
                "Product could not be loaded",
                "Nie można załadować produktu",
                "Produkt konnte nicht geladen werden",
                "Không thể tải sản phẩm",
              ),
            )}
          </CardTitle>
          <CardDescription>
            {tr(
              t(
                "Product moderation status is temporarily unavailable.",
                "Status weryfikacji produktu jest tymczasowo niedostępny.",
                "Der Produktprüfungsstatus ist vorübergehend nicht verfügbar.",
                "Trạng thái duyệt sản phẩm tạm thời không khả dụng.",
              ),
            )}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <ProductModerationProductPage
      key={productId}
      initialStatus={statusQuery.data}
      productId={productId}
      readStatus={() => getStatus({ data: { id: productId } })}
    />
  );
}

function ProductModerationProductPage({
  productId,
  initialStatus,
  readStatus,
}: {
  productId: string;
  initialStatus: ProductModerationStatusDetail;
  readStatus(): Promise<ProductModerationStatusDetail>;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [coordination, setCoordination] = useState<PrivateEditorCoordination>({
    dirty: false,
    active: false,
    galleryFailed: false,
  });
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [staleEditor, setStaleEditor] = useState(false);
  const statusRef = useRef(status);
  const queryClient = useQueryClient();
  const beginEditing = useServerFn(beginMyProductEditing);
  const submit = useServerFn(submitMyProductForModeration);
  const withdraw = useServerFn(withdrawMyProductModerationSubmission);
  const abandon = useServerFn(abandonMyFailedProductActivation);
  const retryCleanup = useServerFn(retryMyProductAbandonmentCleanup);
  const archive = useServerFn(archiveMyProduct);
  const restore = useServerFn(restoreMyProduct);
  const listCategories = useServerFn(listProductCategories);
  const coordinator = useProductModerationMutationCoordinator(
    initialStatus.actionRevision,
    (revision) => {
      setStatus((current) => ({ ...current, actionRevision: revision }));
      queryClient.setQueryData<ProductModerationStatusDetail>(
        ["my-product-moderation", productId],
        (current) => (current ? { ...current, actionRevision: revision } : current),
      );
    },
  );
  const coordinationRef = useRef(coordination);
  const coordinatorRef = useRef(coordinator);
  const staleEditorRef = useRef(staleEditor);
  coordinationRef.current = coordination;
  coordinatorRef.current = coordinator;
  staleEditorRef.current = staleEditor;
  statusRef.current = status;
  const categories = useQuery({
    queryKey: ["product-categories"],
    queryFn: () => listCategories(),
    enabled: Boolean(status.submittedRevision),
    retry: false,
  });

  const applyReadStatus = useCallback(
    (next: ProductModerationStatusDetail) => {
      const previous = statusRef.current;
      const currentCoordination = coordinationRef.current;
      const currentCoordinator = coordinatorRef.current;
      if (
        currentCoordination.dirty &&
        (!privateEditorEligible(next) || next.actionRevision !== currentCoordinator.revision)
      ) {
        staleEditorRef.current = true;
        setStaleEditor(true);
      }
      notifyProductModerationTransition(previous, next);
      statusRef.current = next;
      setStatus(next);
      queryClient.setQueryData(["my-product-moderation", productId], next);
      if (
        !staleEditorRef.current &&
        !currentCoordination.dirty &&
        !currentCoordination.active &&
        !currentCoordinator.busy
      ) {
        currentCoordinator.replaceRevision(next.actionRevision);
      }
    },
    [productId, queryClient],
  );
  const statusRefresh = useProductModerationStatusRefresh({
    status,
    readStatus,
    onStatus: applyReadStatus,
  });

  const privateEditorVisible = staleEditor || privateEditorEligible(status);
  const categoryName = categoryLabel(status, categories.data?.categories ?? []);
  const submitBlocked =
    coordination.dirty ||
    coordination.active ||
    coordination.galleryFailed ||
    coordinator.busy ||
    actionBusy ||
    staleEditor;

  function replaceStatus(next: ProductModerationStatusDetail) {
    statusRef.current = next;
    setStatus(next);
    coordinator.replaceRevision(next.actionRevision);
    queryClient.setQueryData(["my-product-moderation", productId], next);
  }

  async function rereadStatus(): Promise<ProductModerationStatusDetail> {
    return statusRefresh.refreshStatus();
  }

  async function runAction(operation: () => Promise<void>) {
    if (actionBusy || staleEditor) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await operation();
    } catch (error) {
      if (
        moderationErrorCode(error) === "product_moderation_working_revision_conflict" ||
        moderationErrorCode(error) === "product_moderation_revision_conflict"
      ) {
        await rereadStatus().catch(() => undefined);
      }
      setActionError(moderationErrorMessage(error));
    } finally {
      setActionBusy(false);
    }
  }

  const begin = () =>
    runAction(async () => {
      await beginEditing({ data: { productId } });
      const next = await rereadStatus();
      if (!next.hasWorkingCopy || !next.actions.canEdit) {
        throw new Error("product_moderation_product_not_editable");
      }
    });

  const submitForReview = () =>
    runAction(async () => {
      if (submitBlocked) throw new Error("product_moderation_unsaved_changes");
      const result = await submit({
        data: {
          productId,
          expectedModerationRevision: coordinator.revision,
          requestId: crypto.randomUUID(),
        },
      });
      replaceStatus(result.moderationStatus);
      toast.success(
        tr(
          t(
            "Submitted for review.",
            "Wysłano do weryfikacji.",
            "Zur Prüfung eingereicht.",
            "Đã gửi để duyệt.",
          ),
        ),
      );
    });

  const withdrawSubmission = () =>
    runAction(async () => {
      if (!status.review) return;
      const result = await withdraw({
        data: {
          productId,
          submissionId: status.review.submissionId,
          expectedModerationRevision: coordinator.revision,
          requestId: crypto.randomUUID(),
        },
      });
      replaceStatus(result.moderationStatus);
    });

  const abandonFailedActivation = () =>
    runAction(async () => {
      if (!status.activation) return;
      const result = await abandon({
        data: {
          productId,
          runId: status.activation.runId,
          expectedDispatchGeneration: status.activation.dispatchGeneration,
          requestId: crypto.randomUUID(),
        },
      });
      replaceStatus(result.moderationStatus);
    });

  const retryAbandonmentCleanup = () =>
    runAction(async () => {
      if (!status.activation) return;
      const result = await retryCleanup({
        data: {
          productId,
          runId: status.activation.runId,
          expectedDispatchGeneration: status.activation.dispatchGeneration,
          requestId: crypto.randomUUID(),
        },
      });
      replaceStatus(result.moderationStatus);
    });

  const archiveProduct = () =>
    runAction(async () => {
      if (!window.confirm(archiveConfirmation(status))) return;
      await archive({
        data: {
          id: productId,
          expectedModerationRevision: coordinator.revision,
          requestId: crypto.randomUUID(),
        },
      });
      await rereadStatus();
    });

  const restoreProduct = () =>
    runAction(async () => {
      await restore({
        data: {
          id: productId,
          expectedModerationRevision: coordinator.revision,
          requestId: crypto.randomUUID(),
        },
      });
      const next = await rereadStatus();
      if (!next.hasWorkingCopy || !next.actions.canEdit || next.publicState !== "archived") {
        throw new Error("product_restore_not_allowed");
      }
    });

  const reloadAndDiscard = () => {
    if (
      !window.confirm(
        tr(
          t(
            "Reload this product and discard your unsaved changes?",
            "Odświeżyć produkt i odrzucić niezapisane zmiany?",
            "Produkt neu laden und nicht gespeicherte Änderungen verwerfen?",
            "Tải lại sản phẩm và hủy các thay đổi chưa lưu?",
          ),
        ),
      )
    ) {
      return;
    }
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {tr(
              t("Product moderation", "Weryfikacja produktu", "Produktprüfung", "Duyệt sản phẩm"),
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tr(
              t(
                "Save private changes, submit an immutable revision, and follow its approval and publication state.",
                "Zapisz prywatne zmiany, wyślij niezmienną wersję i śledź jej zatwierdzenie oraz publikację.",
                "Speichern Sie private Änderungen, reichen Sie eine unveränderliche Version ein und verfolgen Sie Prüfung und Veröffentlichung.",
                "Lưu thay đổi riêng tư, gửi phiên bản cố định và theo dõi duyệt cũng như xuất bản.",
              ),
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={statusRefresh.refreshing}
            onClick={() => void statusRefresh.refreshStatus().catch(() => undefined)}
          >
            {statusRefresh.refreshing
              ? tr(t("Refreshing…", "Odświeżanie…", "Wird aktualisiert…", "Đang làm mới…"))
              : tr(
                  t("Refresh status", "Odśwież stan", "Status aktualisieren", "Làm mới trạng thái"),
                )}
          </Button>
          <Link
            to="/seller/products"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ←{" "}
            {tr(
              t(
                "Back to products",
                "Wróć do produktów",
                "Zurück zu Produkten",
                "Quay lại sản phẩm",
              ),
            )}
          </Link>
        </div>
      </div>

      <ProductModerationAxes status={status} />
      <ProductModerationOutcomeNotice status={status} />
      {statusRefresh.readWarning ? (
        <Card className="border-amber-300">
          <CardContent className="pt-6 text-sm">
            {tr(
              t(
                "Product status could not be refreshed. The last known state is still shown.",
                "Nie udało się odświeżyć stanu produktu. Nadal wyświetlany jest ostatni znany stan.",
                "Der Produktstatus konnte nicht aktualisiert werden. Der zuletzt bekannte Stand wird weiterhin angezeigt.",
                "Không thể làm mới trạng thái sản phẩm. Trạng thái gần nhất vẫn được hiển thị.",
              ),
            )}
          </CardContent>
        </Card>
      ) : null}
      {staleEditor ? (
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle className="text-base">
              {tr(
                t(
                  "Unsaved changes are out of date",
                  "Niezapisane zmiany są nieaktualne",
                  "Nicht gespeicherte Änderungen sind veraltet",
                  "Các thay đổi chưa lưu đã lỗi thời",
                ),
              )}
            </CardTitle>
            <CardDescription>
              {tr(
                t(
                  "This product changed elsewhere. Your local fields are preserved, but saving is disabled until you reload.",
                  "Ten produkt został zmieniony w innym miejscu. Lokalne pola zostały zachowane, ale zapis jest wyłączony do czasu odświeżenia.",
                  "Dieses Produkt wurde an anderer Stelle geändert. Ihre lokalen Felder bleiben erhalten, aber Speichern ist bis zum Neuladen deaktiviert.",
                  "Sản phẩm này đã thay đổi ở nơi khác. Các trường cục bộ vẫn được giữ, nhưng không thể lưu cho đến khi tải lại.",
                ),
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" onClick={reloadAndDiscard}>
              {tr(
                t(
                  "Reload and discard unsaved changes",
                  "Odśwież i odrzuć niezapisane zmiany",
                  "Neu laden und nicht gespeicherte Änderungen verwerfen",
                  "Tải lại và hủy thay đổi chưa lưu",
                ),
              )}
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {actionError ? (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{actionError}</CardContent>
        </Card>
      ) : null}

      {privateEditorVisible ? (
        <>
          {status.submittedRevision ? (
            <ProductModerationSubmittedRevisionView
              status={status}
              categoryName={categoryName}
              failedCredentialIdentities={statusRefresh.failedCredentialIdentities}
              onImageError={statusRefresh.handleImageError}
            />
          ) : null}
          <PrivateProductEditor
            productId={productId}
            coordinator={coordinator}
            onCoordinationChange={setCoordination}
            disabled={staleEditor}
          />
        </>
      ) : (
        <ProductModerationSubmittedRevisionView
          status={status}
          categoryName={categoryName}
          failedCredentialIdentities={statusRefresh.failedCredentialIdentities}
          onImageError={statusRefresh.handleImageError}
        />
      )}

      {status.activation?.displayState === "public_cleanup_required" ? (
        <Card>
          <CardContent className="pt-6 text-sm">
            {tr(
              t(
                "The approved version is public. An administrator must finish cleanup; no seller retry is available.",
                "Zatwierdzona wersja jest publiczna. Administrator musi zakończyć czyszczenie; sprzedawca nie może go ponowić.",
                "Die genehmigte Version ist öffentlich. Ein Administrator muss die Bereinigung abschließen; eine Wiederholung durch den Verkäufer ist nicht möglich.",
                "Phiên bản đã duyệt đang công khai. Quản trị viên phải hoàn tất dọn dẹp; người bán không thể thử lại.",
              ),
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status.publicState === "published" && !status.hasWorkingCopy && status.actions.canEdit ? (
          <Button type="button" onClick={() => void begin()} disabled={actionBusy || staleEditor}>
            {tr(
              t(
                "Edit private draft",
                "Edytuj prywatny szkic",
                "Privaten Entwurf bearbeiten",
                "Chỉnh sửa bản nháp riêng",
              ),
            )}
          </Button>
        ) : null}
        {privateEditorVisible && status.actions.canSubmit ? (
          <Button type="button" onClick={() => void submitForReview()} disabled={submitBlocked}>
            {tr(
              t(
                "Submit for review",
                "Wyślij do weryfikacji",
                "Zur Prüfung einreichen",
                "Gửi để duyệt",
              ),
            )}
          </Button>
        ) : null}
        {status.actions.canWithdraw && status.review ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void withdrawSubmission()}
            disabled={actionBusy || staleEditor}
          >
            {tr(
              t(
                "Withdraw submission",
                "Wycofaj zgłoszenie",
                "Einreichung zurückziehen",
                "Rút bản gửi",
              ),
            )}
          </Button>
        ) : null}
        {status.actions.canAbandonFailedActivation && status.activation ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void abandonFailedActivation()}
            disabled={actionBusy || staleEditor}
          >
            {status.review?.kind === "update"
              ? tr(
                  t(
                    "Abandon failed update",
                    "Porzuć nieudaną aktualizację",
                    "Fehlgeschlagenes Update verwerfen",
                    "Hủy cập nhật thất bại",
                  ),
                )
              : tr(
                  t(
                    "Abandon failed publication",
                    "Porzuć nieudaną publikację",
                    "Fehlgeschlagene Veröffentlichung verwerfen",
                    "Hủy lần xuất bản thất bại",
                  ),
                )}
          </Button>
        ) : null}
        {status.actions.canRetryAbandonmentCleanup && status.activation ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void retryAbandonmentCleanup()}
            disabled={actionBusy || staleEditor}
          >
            {tr(
              t("Retry cleanup", "Ponów czyszczenie", "Bereinigung wiederholen", "Thử dọn dẹp lại"),
            )}
          </Button>
        ) : null}
        {status.actions.canArchive ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void archiveProduct()}
            disabled={actionBusy || staleEditor}
          >
            {tr(t("Archive", "Archiwizuj", "Archivieren", "Lưu trữ"))}
          </Button>
        ) : null}
        {status.actions.canRestore ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void restoreProduct()}
            disabled={actionBusy || staleEditor}
          >
            {tr(t("Restore", "Przywróć", "Wiederherstellen", "Khôi phục"))}
          </Button>
        ) : null}
      </div>
      {privateEditorVisible && submitBlocked ? (
        <p className="text-sm text-muted-foreground">
          {tr(
            t(
              "Save all changes and finish image operations before submitting for review.",
              "Zapisz wszystkie zmiany i zakończ operacje na zdjęciach przed wysłaniem do weryfikacji.",
              "Speichern Sie alle Änderungen und schließen Sie Bildvorgänge ab, bevor Sie zur Prüfung einreichen.",
              "Lưu mọi thay đổi và hoàn tất thao tác hình ảnh trước khi gửi duyệt.",
            ),
          )}
        </p>
      ) : null}
    </div>
  );
}

function PrivateProductEditor({
  productId,
  coordinator,
  onCoordinationChange,
  disabled: externallyDisabled,
}: {
  productId: string;
  coordinator: ProductModerationMutationCoordinator;
  onCoordinationChange(state: PrivateEditorCoordination): void;
  disabled: boolean;
}) {
  const [productState, setProductState] = useState(cleanProductState);
  const [factsState, setFactsState] = useState<ProductDraftFactsEditorState>(cleanEditorState);
  const [descriptionState, setDescriptionState] =
    useState<ProductDraftDescriptionEditorState>(cleanEditorState);
  const [generationActive, setGenerationActive] = useState(false);
  const [descriptionRefreshRequest, setDescriptionRefreshRequest] = useState(0);
  const [factsRefreshRequest, setFactsRefreshRequest] = useState(0);
  const [displayTitle, setDisplayTitle] = useState<string | null>(null);
  const [titleReplacement, setTitleReplacement] = useState<ProductEditorTitleReplacement | null>(
    null,
  );
  const [galleryState, setGalleryState] = useState<ProductEditorGalleryState>(emptyGalleryState);
  const [galleryMutation, setGalleryMutation] = useState(cleanGalleryMutation);
  const get = useServerFn(getMyProduct);
  const queryClient = useQueryClient();
  const productQuery = useQuery({
    queryKey: ["my-product-private", productId],
    queryFn: () => get({ data: { id: productId } }),
    retry: false,
  });

  const refreshGallery = useCallback(async () => {
    const refreshed = await get({ data: { id: productId } });
    if (!refreshed.product || !refreshed.gallery)
      throw new Error("ProductDraft gallery is unavailable.");
    queryClient.setQueryData(["my-product-private", productId], refreshed);
    return refreshed.gallery;
  }, [get, productId, queryClient]);

  const refreshProduct = useCallback(async () => {
    const refreshed = await get({ data: { id: productId } });
    queryClient.setQueryData(["my-product-private", productId], refreshed);
    if (refreshed.product) setDisplayTitle(refreshed.product.title);
  }, [get, productId, queryClient]);

  const refreshGenerationContext = useCallback(
    async (scope: DescriptionGenerationRefreshScope) => {
      await refreshProduct();
      if (scope === "product_and_facts") setFactsRefreshRequest((value) => value + 1);
    },
    [refreshProduct],
  );

  const handleGenerated = useCallback((result: { titleSnapshot: ProductDraftTitleSnapshot }) => {
    setDisplayTitle(result.titleSnapshot.title);
    setTitleReplacement((current) => ({
      version: (current?.version ?? 0) + 1,
      snapshot: result.titleSnapshot,
    }));
  }, []);

  const handleProductSaved = useCallback((snapshot: SavedProductSnapshot) => {
    setDisplayTitle(snapshot.title);
    setDescriptionRefreshRequest((value) => value + 1);
  }, []);

  const handleGalleryChange = useCallback(
    (gallery: NonNullable<Awaited<ReturnType<typeof refreshGallery>>>) => {
      const activeImages = gallery.images.filter(
        (image) => image.sourceKind === "seller_upload" && image.durableStatus !== "deleting",
      );
      setGalleryState({
        activeImageCount: activeImages.length,
        hasDurableImages: gallery.images.some((image) => image.sourceKind === "seller_upload"),
        hasAvailableCover: gallery.images.some(
          (image) => image.isSourceCover && image.durableStatus === "available",
        ),
        incomplete:
          gallery.status !== "available" ||
          gallery.images.some((image) => image.durableStatus !== "available"),
      });
    },
    [],
  );

  useEffect(() => {
    onCoordinationChange({
      dirty: productState.dirty || factsState.dirty || descriptionState.dirty,
      active:
        productState.saving ||
        factsState.saving ||
        descriptionState.saving ||
        generationActive ||
        galleryMutation.active ||
        coordinator.busy ||
        galleryState.incomplete,
      galleryFailed: galleryMutation.failed,
    });
  }, [
    coordinator.busy,
    descriptionState,
    factsState,
    galleryMutation,
    galleryState.incomplete,
    generationActive,
    onCoordinationChange,
    productState,
  ]);

  useEffect(
    () => () => onCoordinationChange({ dirty: false, active: false, galleryFailed: false }),
    [onCoordinationChange],
  );

  if (productQuery.isLoading)
    return (
      <div className="text-sm text-muted-foreground">
        {tr(
          t(
            "Loading private draft…",
            "Ładowanie prywatnego szkicu…",
            "Privater Entwurf wird geladen…",
            "Đang tải bản nháp riêng…",
          ),
        )}
      </div>
    );
  if (productQuery.isError || !productQuery.data?.product) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          {tr(
            t(
              "The private draft could not be loaded.",
              "Nie można załadować prywatnego szkicu.",
              "Der private Entwurf konnte nicht geladen werden.",
              "Không thể tải bản nháp riêng.",
            ),
          )}
        </CardContent>
      </Card>
    );
  }

  const data = productQuery.data;
  const currentTitle = displayTitle ?? data.product.title;
  const disabled = externallyDisabled || generationActive || coordinator.busy;

  return (
    <div className="space-y-8">
      {data.gallery ? (
        <ProductDraftImageGallery
          initialGallery={data.gallery}
          productTitle={currentTitle}
          refresh={refreshGallery}
          productDraftId={productId}
          imageSourceMode={data.product.imageSourceMode}
          productStatus={data.product.status}
          moderationEditable={data.product.moderation_editable}
          disabled={disabled}
          mutationCoordinator={coordinator}
          onGalleryChange={handleGalleryChange}
          onMutationStateChange={setGalleryMutation}
        />
      ) : null}
      <ProductEditor
        initial={data.product}
        disabled={disabled}
        titleReplacement={titleReplacement}
        moderationRevisionOverride={coordinator.revision}
        mutationCoordinator={coordinator}
        onStateChange={setProductState}
        onDisplayTitleChange={setDisplayTitle}
        onProductSaved={handleProductSaved}
      />
      <ProductDraftFactsEditor
        productDraftId={productId}
        disabled={disabled}
        refreshRequest={factsRefreshRequest}
        mutationCoordinator={coordinator}
        onStateChange={setFactsState}
        onSaved={() => setDescriptionRefreshRequest((value) => value + 1)}
      />
      <SellerProductDraftDescriptionSection
        productDraftId={productId}
        title={currentTitle}
        coordination={{ product: productState, facts: factsState }}
        refreshRequest={descriptionRefreshRequest}
        mutationCoordinator={coordinator}
        onDescriptionStateChange={setDescriptionState}
        onGenerationStateChange={setGenerationActive}
        onGenerated={handleGenerated}
        onRefreshContext={refreshGenerationContext}
      />
    </div>
  );
}

function privateEditorEligible(status: ProductModerationStatusDetail) {
  return (
    status.actions.canEdit &&
    (status.hasWorkingCopy ||
      (status.publicState === "draft" && status.review?.status !== "approved"))
  );
}

function categoryLabel(
  status: ProductModerationStatusDetail,
  categories: Array<{ id: string; name: string }>,
) {
  const categoryId = status.submittedRevision?.snapshot.categoryId;
  if (!categoryId) return tr(t("Not set", "Nie ustawiono", "Nicht festgelegt", "Chưa đặt"));
  return (
    categories.find((category) => category.id === categoryId)?.name ??
    tr(
      t(
        "Category unavailable",
        "Kategoria niedostępna",
        "Kategorie nicht verfügbar",
        "Danh mục không khả dụng",
      ),
    )
  );
}

function archiveConfirmation(status: ProductModerationStatusDetail) {
  if (status.review?.status === "pending") {
    return tr(
      t(
        "Archive this product? Its pending submission will be withdrawn and the retained private draft will be discarded.",
        "Zarchiwizować produkt? Oczekujące zgłoszenie zostanie wycofane, a zachowany prywatny szkic usunięty.",
        "Produkt archivieren? Die ausstehende Einreichung wird zurückgezogen und der private Entwurf verworfen.",
        "Lưu trữ sản phẩm? Bản gửi đang chờ sẽ bị rút và bản nháp riêng được giữ lại sẽ bị hủy.",
      ),
    );
  }
  if (status.hasWorkingCopy) {
    return tr(
      t(
        "Archive this product and discard its unsent private changes?",
        "Zarchiwizować produkt i odrzucić niewysłane prywatne zmiany?",
        "Produkt archivieren und nicht eingereichte private Änderungen verwerfen?",
        "Lưu trữ sản phẩm và hủy các thay đổi riêng chưa gửi?",
      ),
    );
  }
  if (status.publicState === "published") {
    return tr(
      t(
        "Archive this product and remove the current public version from the storefront?",
        "Zarchiwizować produkt i usunąć bieżącą wersję publiczną ze sklepu?",
        "Produkt archivieren und die öffentliche Version aus dem Shop entfernen?",
        "Lưu trữ sản phẩm và gỡ phiên bản công khai khỏi cửa hàng?",
      ),
    );
  }
  return tr(
    t(
      "Archive this never-approved draft? It cannot be restored because it has no approved public revision.",
      "Zarchiwizować ten nigdy niezatwierdzony szkic? Nie będzie można go przywrócić, ponieważ nie ma zatwierdzonej wersji publicznej.",
      "Diesen nie genehmigten Entwurf archivieren? Er kann ohne genehmigte öffentliche Version nicht wiederhergestellt werden.",
      "Lưu trữ bản nháp chưa từng được duyệt? Không thể khôi phục vì chưa có phiên bản công khai được duyệt.",
    ),
  );
}

function notifyProductModerationTransition(
  previous: ProductModerationStatusDetail,
  next: ProductModerationStatusDetail,
) {
  if (previous.publicState !== "published" && next.publicState === "published") {
    notifyPublicationVisibility(next, false);
    return;
  }

  if (
    previous.activation?.displayState !== "completed" &&
    next.activation?.displayState === "completed" &&
    next.review?.kind === "update"
  ) {
    notifyPublicationVisibility(next, true);
    return;
  }

  const previousReview = previous.review?.status ?? null;
  const nextReview = next.review?.status ?? null;
  if (previousReview !== nextReview) {
    if (nextReview === "approved") {
      toast.success(
        tr(
          t(
            "Product approved. Publication is starting.",
            "Produkt zatwierdzony. Rozpoczyna się publikacja.",
            "Produkt genehmigt. Die Veröffentlichung beginnt.",
            "Sản phẩm đã duyệt. Đang bắt đầu xuất bản.",
          ),
        ),
      );
      return;
    }
    if (nextReview === "changes_requested") {
      toast.warning(
        tr(
          t(
            "The administrator requested product changes.",
            "Administrator poprosił o zmiany produktu.",
            "Der Administrator hat Produktänderungen angefordert.",
            "Quản trị viên yêu cầu thay đổi sản phẩm.",
          ),
        ),
      );
      return;
    }
    if (nextReview === "rejected") {
      toast.error(
        tr(
          t(
            "The product was rejected.",
            "Produkt został odrzucony.",
            "Das Produkt wurde abgelehnt.",
            "Sản phẩm đã bị từ chối.",
          ),
        ),
      );
      return;
    }
  }

  const previousActivation = previous.activation?.displayState ?? null;
  const nextActivation = next.activation?.displayState ?? null;
  if (
    previousActivation !== nextActivation &&
    (nextActivation === "dispatch_failed" ||
      nextActivation === "activation_failed" ||
      nextActivation === "abandonment_cleanup_required")
  ) {
    toast.error(
      tr(
        t(
          "Product publication failed.",
          "Publikacja produktu nie powiodła się.",
          "Die Produktveröffentlichung ist fehlgeschlagen.",
          "Xuất bản sản phẩm thất bại.",
        ),
      ),
    );
  }
}

function notifyPublicationVisibility(status: ProductModerationStatusDetail, isUpdate: boolean) {
  if (status.marketplaceVisibility === "visible") {
    toast.success(
      tr(
        isUpdate
          ? t(
              "Product update published.",
              "Aktualizacja produktu została opublikowana.",
              "Produktupdate veröffentlicht.",
              "Bản cập nhật sản phẩm đã được xuất bản.",
            )
          : t(
              "Product published.",
              "Produkt został opublikowany.",
              "Produkt veröffentlicht.",
              "Sản phẩm đã được xuất bản.",
            ),
      ),
    );
    return;
  }

  if (status.marketplaceVisibility === "storefront_disabled") {
    toast.warning(
      tr(
        t(
          "Product publication completed. Enable your storefront to show it in the marketplace.",
          "Publikacja produktu zakończona. Włącz sklep, aby pokazać produkt na rynku.",
          "Die Produktveröffentlichung ist abgeschlossen. Aktivieren Sie Ihren Shop, damit das Produkt auf dem Marktplatz erscheint.",
          "Đã hoàn tất xuất bản sản phẩm. Hãy bật gian hàng để hiển thị sản phẩm trên marketplace.",
        ),
      ),
    );
    return;
  }

  toast.warning(
    tr(
      t(
        "Product publication completed, but seller approval is required before it can appear in the marketplace.",
        "Publikacja produktu zakończona, ale zanim pojawi się on na rynku, wymagane jest zatwierdzenie sprzedawcy.",
        "Die Produktveröffentlichung ist abgeschlossen, aber vor der Anzeige auf dem Marktplatz ist eine Verkäufergenehmigung erforderlich.",
        "Đã hoàn tất xuất bản sản phẩm, nhưng cần duyệt người bán trước khi sản phẩm xuất hiện trên marketplace.",
      ),
    ),
  );
}

function moderationErrorCode(error: unknown): string | null {
  const productCode = productModerationErrorCode(error);
  if (productCode) return productCode;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  )
    return error.code;
  if (error instanceof Error) {
    return moderationErrorCode(error.cause) ?? error.message;
  }
  return null;
}

function moderationErrorMessage(error: unknown) {
  switch (moderationErrorCode(error)) {
    case "product_moderation_edit_invalid":
    case "product_moderation_submission_invalid":
    case "product_activation_dispatch_invalid":
      return tr(
        t(
          "The product request is invalid. Refresh the page and try again.",
          "Żądanie dotyczące produktu jest nieprawidłowe. Odśwież stronę i spróbuj ponownie.",
          "Die Produktanfrage ist ungültig. Aktualisieren Sie die Seite und versuchen Sie es erneut.",
          "Yêu cầu sản phẩm không hợp lệ. Làm mới trang và thử lại.",
        ),
      );
    case "product_moderation_unsaved_changes":
      return tr(
        t(
          "Save all changes before submitting.",
          "Zapisz wszystkie zmiany przed wysłaniem.",
          "Speichern Sie alle Änderungen vor dem Einreichen.",
          "Lưu mọi thay đổi trước khi gửi.",
        ),
      );
    case "product_moderation_seller_approval_required":
      return tr(
        t(
          "Your seller profile must be approved before submitting products.",
          "Profil sprzedawcy musi zostać zatwierdzony przed wysłaniem produktów.",
          "Ihr Verkäuferprofil muss vor dem Einreichen von Produkten genehmigt werden.",
          "Hồ sơ người bán phải được duyệt trước khi gửi sản phẩm.",
        ),
      );
    case "product_moderation_images_not_ready":
      return tr(
        t(
          "Wait for every image and the selected cover to become ready.",
          "Poczekaj, aż wszystkie zdjęcia i wybrana okładka będą gotowe.",
          "Warten Sie, bis alle Bilder und das Titelbild bereit sind.",
          "Chờ mọi hình ảnh và ảnh bìa sẵn sàng.",
        ),
      );
    case "product_moderation_audience_required":
      return tr(
        t(
          "Select at least one audience and save the draft.",
          "Wybierz co najmniej jedną grupę odbiorców i zapisz szkic.",
          "Wählen Sie mindestens eine Zielgruppe und speichern Sie den Entwurf.",
          "Chọn ít nhất một đối tượng và lưu bản nháp.",
        ),
      );
    case "product_moderation_description_outdated":
      return tr(
        t(
          "Update, regenerate, or clear descriptions based on older facts.",
          "Zaktualizuj, wygeneruj ponownie lub usuń opisy oparte na starszych danych.",
          "Aktualisieren, regenerieren oder löschen Sie Beschreibungen auf Basis älterer Fakten.",
          "Cập nhật, tạo lại hoặc xóa mô tả dựa trên thông tin cũ.",
        ),
      );
    case "product_moderation_working_revision_conflict":
    case "product_moderation_revision_conflict":
      return tr(
        t(
          "Another edit or decision won. Status was refreshed and your unsaved fields were kept.",
          "Inna zmiana lub decyzja została zapisana pierwsza. Status odświeżono, a niezapisane pola zachowano.",
          "Eine andere Änderung oder Entscheidung war schneller. Der Status wurde aktualisiert und ungespeicherte Felder blieben erhalten.",
          "Một chỉnh sửa hoặc quyết định khác đã thắng. Trạng thái được làm mới và trường chưa lưu được giữ lại.",
        ),
      );
    case "product_moderation_submission_conflict":
    case "product_moderation_activation_active":
    case "product_archive_moderation_active":
    case "product_restore_moderation_active":
      return tr(
        t(
          "Another review or publication action is active. Finish it before continuing.",
          "Trwa inna weryfikacja lub publikacja. Zakończ ją przed kontynuowaniem.",
          "Eine andere Prüfung oder Veröffentlichung ist aktiv. Schließen Sie sie ab, bevor Sie fortfahren.",
          "Một thao tác duyệt hoặc xuất bản khác đang hoạt động. Hoàn tất trước khi tiếp tục.",
        ),
      );
    case "product_moderation_submission_stale":
      return tr(
        t(
          "This submitted revision is no longer current. Refresh the page before continuing.",
          "Ta wysłana wersja nie jest już aktualna. Odśwież stronę przed kontynuowaniem.",
          "Diese eingereichte Version ist nicht mehr aktuell. Aktualisieren Sie die Seite, bevor Sie fortfahren.",
          "Bản đã gửi này không còn hiện hành. Làm mới trang trước khi tiếp tục.",
        ),
      );
    case "product_moderation_abandonment_not_allowed":
    case "product_activation_dispatch_not_allowed":
    case "product_moderation_activation_not_retryable":
      return tr(
        t(
          "This recovery action is no longer available. Refresh the product status.",
          "Ta operacja odzyskiwania nie jest już dostępna. Odśwież status produktu.",
          "Diese Wiederherstellungsaktion ist nicht mehr verfügbar. Aktualisieren Sie den Produktstatus.",
          "Thao tác khôi phục này không còn khả dụng. Làm mới trạng thái sản phẩm.",
        ),
      );
    case "product_moderation_cleanup_required":
      return tr(
        t(
          "Publication cleanup must finish before another action can start.",
          "Czyszczenie publikacji musi się zakończyć przed rozpoczęciem kolejnej operacji.",
          "Die Veröffentlichungsbereinigung muss abgeschlossen sein, bevor eine weitere Aktion beginnt.",
          "Phải hoàn tất dọn dẹp xuất bản trước khi bắt đầu thao tác khác.",
        ),
      );
    case "product_archive_not_allowed":
    case "product_moderation_product_not_editable":
    case "product_restore_not_allowed":
      return tr(
        t(
          "This product cannot be edited from its current state.",
          "Produktu nie można edytować w bieżącym stanie.",
          "Dieses Produkt kann im aktuellen Zustand nicht bearbeitet werden.",
          "Không thể chỉnh sửa sản phẩm ở trạng thái hiện tại.",
        ),
      );
    case "product_archive_request_conflict":
    case "product_restore_request_conflict":
      return tr(
        t(
          "This action request was already used differently. Refresh the page and try again.",
          "To żądanie zostało już użyte w inny sposób. Odśwież stronę i spróbuj ponownie.",
          "Diese Aktionsanfrage wurde bereits anders verwendet. Aktualisieren Sie die Seite und versuchen Sie es erneut.",
          "Yêu cầu thao tác này đã được dùng theo cách khác. Làm mới trang và thử lại.",
        ),
      );
    case "product_moderation_not_found":
    case "product_not_found":
      return tr(
        t(
          "The product was not found.",
          "Nie znaleziono produktu.",
          "Das Produkt wurde nicht gefunden.",
          "Không tìm thấy sản phẩm.",
        ),
      );
    case "product_moderation_unavailable":
    case "product_moderation_activation_unavailable":
      return tr(
        t(
          "Product moderation is temporarily unavailable. Try again.",
          "Weryfikacja produktu jest tymczasowo niedostępna. Spróbuj ponownie.",
          "Die Produktprüfung ist vorübergehend nicht verfügbar. Versuchen Sie es erneut.",
          "Duyệt sản phẩm tạm thời không khả dụng. Hãy thử lại.",
        ),
      );
    default:
      return tr(
        t(
          "The product action could not be completed. Try again.",
          "Nie udało się wykonać operacji na produkcie. Spróbuj ponownie.",
          "Die Produktaktion konnte nicht abgeschlossen werden. Versuchen Sie es erneut.",
          "Không thể hoàn tất thao tác sản phẩm. Hãy thử lại.",
        ),
      );
  }
}
