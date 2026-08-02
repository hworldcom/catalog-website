import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ProductDraftFields,
  type ProductDraftFieldsValue,
} from "@/components/product/product-draft-fields";
import { ProductPublicationStatus } from "@/components/product/product-publication-status";
import { isActiveProductPublication } from "@/components/product/product-publication-status.utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ProductDraftDescriptionEditor,
  type ProductDraftDescriptionEditorClient,
  type ProductDraftDescriptionEditorState,
} from "@/features/product-draft-descriptions/components/product-draft-description-editor";
import {
  ProductDraftFactsEditorView,
  type ProductDraftFactsEditorClient,
  type ProductDraftFactsEditorState,
} from "@/features/product-draft-facts/components/product-draft-facts-editor";
import type { ProductDraftFactsPatch } from "@/features/product-draft-facts/product-draft-facts.types";
import { normalizeProductDraftTitle } from "@/features/product-draft-title/product-draft-title.types";
import { ProductDraftImageGallery } from "@/features/seller/components/product-draft-image-gallery";
import type { SellerProductPublicationSnapshot } from "@/features/seller/seller-product-publication.types";
import { t, tr, useLang } from "@/lib/i18n";

import { ClassifierImportShell } from "../components/classifier-import-shell";
import { DelegatedClassifierSellerCard } from "../components/delegated-classifier-seller-card";
import {
  DelegatedActionRequestManager,
  type DelegatedActionRequestRecord,
} from "../delegated-action-request";
import {
  getDelegatedProductDraft,
  getDelegatedProductDraftDescriptions,
  getDelegatedProductDraftFacts,
  getDelegatedProductPublication,
  listDelegatedProductCategories,
  publishDelegatedProduct,
  retryDelegatedProductPublication,
  saveDelegatedProductDraft,
  updateDelegatedProductDraftDescriptions,
  updateDelegatedProductDraftFacts,
} from "../delegated-product-publication.functions";
import {
  delegatedProductFieldsSchema,
  type DelegatedProductCategory,
  type DelegatedProductDraftSnapshot,
  type DelegatedProductFields,
  type DelegatedProductScope,
} from "../delegated-product-publication.types";

export type DelegatedProductPublicationClient = {
  get(scope: DelegatedProductScope): Promise<DelegatedProductDraftSnapshot>;
  save(
    scope: DelegatedProductScope & DelegatedProductFields,
  ): Promise<DelegatedProductDraftSnapshot>;
  listCategories(workflowId: string): Promise<{ categories: DelegatedProductCategory[] }>;
  getFacts(scope: DelegatedProductScope): ReturnType<ProductDraftFactsEditorClient["get"]>;
  updateFacts(
    scope: DelegatedProductScope,
    patch: ProductDraftFactsPatch,
  ): ReturnType<ProductDraftFactsEditorClient["update"]>;
  getDescriptions(
    scope: DelegatedProductScope,
  ): ReturnType<ProductDraftDescriptionEditorClient["get"]>;
  updateDescriptions(
    scope: DelegatedProductScope,
    descriptions: Parameters<ProductDraftDescriptionEditorClient["update"]>[1],
  ): ReturnType<ProductDraftDescriptionEditorClient["update"]>;
  getPublication(scope: DelegatedProductScope): Promise<SellerProductPublicationSnapshot>;
  publish(
    scope: DelegatedProductScope & DelegatedProductFields & { requestId: string },
  ): Promise<SellerProductPublicationSnapshot>;
  retry(
    scope: DelegatedProductScope & { requestId: string },
  ): Promise<SellerProductPublicationSnapshot>;
};

const S = {
  title: t(
    "Complete and publish product for seller",
    "Uzupełnij i opublikuj produkt dla sprzedawcy",
    "Produkt für Verkäufer vervollständigen und veröffentlichen",
    "Hoàn thiện và xuất bản sản phẩm cho nhà bán",
  ),
  description: t(
    "Review the seller-owned draft, save any corrections, and publish this product when it is ready.",
    "Sprawdź szkic należący do sprzedawcy, zapisz poprawki i opublikuj produkt, gdy będzie gotowy.",
    "Prüfen Sie den verkäufereigenen Entwurf, speichern Sie Korrekturen und veröffentlichen Sie das Produkt, sobald es fertig ist.",
    "Xem lại bản nháp thuộc nhà bán, lưu các chỉnh sửa và xuất bản sản phẩm khi đã sẵn sàng.",
  ),
  back: t("Back to import", "Wróć do importu", "Zurück zum Import", "Quay lại nhập dữ liệu"),
  loading: t(
    "Loading seller ProductDraft…",
    "Ładowanie szkicu produktu sprzedawcy…",
    "Verkäufer-Produktentwurf wird geladen…",
    "Đang tải bản nháp sản phẩm của nhà bán…",
  ),
  loadFailed: t(
    "ProductDraft could not be loaded",
    "Nie można załadować szkicu produktu",
    "Produktentwurf konnte nicht geladen werden",
    "Không thể tải bản nháp sản phẩm",
  ),
  retry: t("Try again", "Spróbuj ponownie", "Erneut versuchen", "Thử lại"),
  notFound: t(
    "This ProductDraft is not part of the delegated workflow.",
    "Ten szkic produktu nie należy do delegowanego procesu.",
    "Dieser Produktentwurf gehört nicht zum delegierten Ablauf.",
    "Bản nháp sản phẩm này không thuộc quy trình được ủy quyền.",
  ),
  administratorRequired: t(
    "Administrator access is required for this workflow.",
    "Dostęp administratora jest wymagany dla tego procesu.",
    "Für diesen Ablauf ist Administratorzugriff erforderlich.",
    "Quy trình này yêu cầu quyền quản trị viên.",
  ),
  unavailable: t(
    "The delegated ProductDraft is temporarily unavailable.",
    "Delegowany szkic produktu jest tymczasowo niedostępny.",
    "Der delegierte Produktentwurf ist vorübergehend nicht verfügbar.",
    "Bản nháp sản phẩm được ủy quyền tạm thời không khả dụng.",
  ),
  source: t("Classifier source", "Źródło klasyfikatora", "Klassifikatorquelle", "Nguồn phân loại"),
  workflow: t("Workflow", "Proces", "Ablauf", "Quy trình"),
  organization: t(
    "Classifier organization",
    "Organizacja klasyfikatora",
    "Klassifikatororganisation",
    "Tổ chức phân loại",
  ),
  batch: t("Classifier batch", "Partia klasyfikatora", "Klassifikatorstapel", "Lô phân loại"),
  group: t("Classifier group", "Grupa klasyfikatora", "Klassifikatorgruppe", "Nhóm phân loại"),
  selectedCover: t(
    "Selected cover",
    "Wybrana okładka",
    "Ausgewähltes Titelbild",
    "Ảnh bìa đã chọn",
  ),
  noCover: t("Not selected", "Nie wybrano", "Nicht ausgewählt", "Chưa chọn"),
  productFields: t("Product fields", "Pola produktu", "Produktfelder", "Trường sản phẩm"),
  productFieldsDescription: t(
    "These values belong to the destination seller. Seller attribution and the imported cover cannot be changed here.",
    "Te wartości należą do sprzedawcy docelowego. Nie można tutaj zmienić sprzedawcy ani importowanej okładki.",
    "Diese Werte gehören dem Zielverkäufer. Verkäuferzuordnung und importiertes Titelbild können hier nicht geändert werden.",
    "Các giá trị này thuộc nhà bán đích. Không thể thay đổi nhà bán hoặc ảnh bìa đã nhập tại đây.",
  ),
  save: t("Save draft", "Zapisz szkic", "Entwurf speichern", "Lưu bản nháp"),
  saving: t("Saving…", "Zapisywanie…", "Wird gespeichert…", "Đang lưu…"),
  saved: t(
    "ProductDraft changes were saved.",
    "Zmiany szkicu produktu zostały zapisane.",
    "Änderungen am Produktentwurf wurden gespeichert.",
    "Đã lưu thay đổi bản nháp sản phẩm.",
  ),
  saveFailed: t(
    "ProductDraft changes could not be saved.",
    "Nie można zapisać zmian szkicu produktu.",
    "Änderungen am Produktentwurf konnten nicht gespeichert werden.",
    "Không thể lưu thay đổi bản nháp sản phẩm.",
  ),
  invalidFields: t(
    "Check the product fields and try again.",
    "Sprawdź pola produktu i spróbuj ponownie.",
    "Prüfen Sie die Produktfelder und versuchen Sie es erneut.",
    "Kiểm tra các trường sản phẩm rồi thử lại.",
  ),
  unsavedEditors: t(
    "Save product facts and descriptions before publishing.",
    "Zapisz dane i opisy produktu przed publikacją.",
    "Speichern Sie Produktfakten und Beschreibungen vor der Veröffentlichung.",
    "Lưu thông tin và mô tả sản phẩm trước khi xuất bản.",
  ),
  publish: t(
    "Publish for seller",
    "Opublikuj dla sprzedawcy",
    "Für Verkäufer veröffentlichen",
    "Xuất bản cho nhà bán",
  ),
  confirmTitle: t(
    "Publish this product for the destination seller?",
    "Opublikować ten produkt dla sprzedawcy docelowego?",
    "Dieses Produkt für den Zielverkäufer veröffentlichen?",
    "Xuất bản sản phẩm này cho nhà bán đích?",
  ),
  confirmDescription: t(
    "This publishes the product and its approved imported images on the seller's storefront.",
    "Spowoduje to opublikowanie produktu i zatwierdzonych importowanych zdjęć w sklepie sprzedawcy.",
    "Dadurch werden das Produkt und seine genehmigten importierten Bilder im Shop des Verkäufers veröffentlicht.",
    "Thao tác này sẽ xuất bản sản phẩm và các ảnh nhập đã được phê duyệt trên gian hàng của nhà bán.",
  ),
  cancel: t("Cancel", "Anuluj", "Abbrechen", "Hủy"),
  publishing: t(
    "Starting publication…",
    "Rozpoczynanie publikacji…",
    "Veröffentlichung wird gestartet…",
    "Đang bắt đầu xuất bản…",
  ),
  publicationStarted: t(
    "Publication was accepted. Progress is shown below.",
    "Publikacja została przyjęta. Postęp jest widoczny poniżej.",
    "Die Veröffentlichung wurde angenommen. Der Fortschritt wird unten angezeigt.",
    "Yêu cầu xuất bản đã được chấp nhận. Tiến trình được hiển thị bên dưới.",
  ),
  publicationFailed: t(
    "Product publication could not be started.",
    "Nie można rozpocząć publikacji produktu.",
    "Produktveröffentlichung konnte nicht gestartet werden.",
    "Không thể bắt đầu xuất bản sản phẩm.",
  ),
  uncertainTitle: t(
    "A previous publication response is uncertain",
    "Wynik poprzedniej publikacji jest niepewny",
    "Das Ergebnis einer vorherigen Veröffentlichung ist ungewiss",
    "Phản hồi xuất bản trước đó chưa chắc chắn",
  ),
  uncertainDescription: t(
    "Resume the stored action with its original values, or explicitly submit the current values as a new action.",
    "Wznów zapisaną czynność z pierwotnymi wartościami albo wyraźnie prześlij bieżące wartości jako nową czynność.",
    "Setzen Sie die gespeicherte Aktion mit ihren ursprünglichen Werten fort oder senden Sie die aktuellen Werte ausdrücklich als neue Aktion.",
    "Tiếp tục thao tác đã lưu với các giá trị ban đầu hoặc gửi rõ ràng các giá trị hiện tại như một thao tác mới.",
  ),
  resume: t(
    "Resume previous publication",
    "Wznów poprzednią publikację",
    "Vorherige Veröffentlichung fortsetzen",
    "Tiếp tục lần xuất bản trước",
  ),
  submitNew: t(
    "Submit current values as a new action",
    "Prześlij bieżące wartości jako nową czynność",
    "Aktuelle Werte als neue Aktion senden",
    "Gửi giá trị hiện tại như một thao tác mới",
  ),
  retryUncertainTitle: t(
    "A previous publication retry is uncertain",
    "Wynik poprzedniej ponownej publikacji jest niepewny",
    "Das Ergebnis eines vorherigen Veröffentlichungsversuchs ist ungewiss",
    "Lần thử xuất bản lại trước đó chưa chắc chắn",
  ),
  resumeRetry: t(
    "Resume previous retry",
    "Wznów poprzednią próbę",
    "Vorherigen Versuch fortsetzen",
    "Tiếp tục lần thử trước",
  ),
  newRetry: t(
    "Start a new retry",
    "Rozpocznij nową próbę",
    "Neuen Versuch starten",
    "Bắt đầu lần thử mới",
  ),
  actionInProgress: t(
    "This administrator action is already being reconciled. Observe its status or resume it later.",
    "Ta czynność administratora jest już uzgadniana. Obserwuj jej stan lub wznów ją później.",
    "Diese Administratoraktion wird bereits abgeglichen. Beobachten Sie den Status oder setzen Sie sie später fort.",
    "Thao tác quản trị này đang được đối soát. Theo dõi trạng thái hoặc tiếp tục sau.",
  ),
  requestConflict: t(
    "The stored request belongs to different product values. Submit the current values as a new action.",
    "Zapisane żądanie należy do innych wartości produktu. Prześlij bieżące wartości jako nową czynność.",
    "Die gespeicherte Anfrage gehört zu anderen Produktwerten. Senden Sie die aktuellen Werte als neue Aktion.",
    "Yêu cầu đã lưu thuộc về các giá trị sản phẩm khác. Gửi giá trị hiện tại như một thao tác mới.",
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
  descriptionInvalid: t(
    "Enter product descriptions with at most 300 characters each.",
    "Każdy opis produktu może zawierać maksymalnie 300 znaków.",
    "Geben Sie Produktbeschreibungen mit jeweils höchstens 300 Zeichen ein.",
    "Nhập mỗi mô tả sản phẩm tối đa 300 ký tự.",
  ),
  categoryRequired: t(
    "Select a category before publishing.",
    "Wybierz kategorię przed publikacją.",
    "Wählen Sie vor der Veröffentlichung eine Kategorie.",
    "Chọn danh mục trước khi xuất bản.",
  ),
  imagesNotReady: t(
    "One or more imported product pictures are not ready yet.",
    "Co najmniej jedno importowane zdjęcie produktu nie jest jeszcze gotowe.",
    "Mindestens ein importiertes Produktbild ist noch nicht bereit.",
    "Một hoặc nhiều ảnh sản phẩm đã nhập chưa sẵn sàng.",
  ),
  notEditable: t(
    "This ProductDraft is no longer editable. The latest state has been loaded.",
    "Tego szkicu produktu nie można już edytować. Załadowano najnowszy stan.",
    "Dieser Produktentwurf kann nicht mehr bearbeitet werden. Der aktuelle Stand wurde geladen.",
    "Bản nháp sản phẩm này không còn chỉnh sửa được. Trạng thái mới nhất đã được tải.",
  ),
  publicationInProgress: t(
    "Another publication is already running. Its current state is shown below.",
    "Inna publikacja jest już uruchomiona. Jej bieżący stan jest widoczny poniżej.",
    "Eine andere Veröffentlichung läuft bereits. Der aktuelle Stand wird unten angezeigt.",
    "Một quá trình xuất bản khác đang chạy. Trạng thái hiện tại được hiển thị bên dưới.",
  ),
};

const cleanEditorState = { dirty: false, saving: false };

export function DelegatedProductPublicationScreen({
  workflowId,
  productDraftId,
}: {
  workflowId: string;
  productDraftId: string;
}) {
  const get = useServerFn(getDelegatedProductDraft);
  const save = useServerFn(saveDelegatedProductDraft);
  const listCategories = useServerFn(listDelegatedProductCategories);
  const getFacts = useServerFn(getDelegatedProductDraftFacts);
  const updateFacts = useServerFn(updateDelegatedProductDraftFacts);
  const getDescriptions = useServerFn(getDelegatedProductDraftDescriptions);
  const updateDescriptions = useServerFn(updateDelegatedProductDraftDescriptions);
  const getPublication = useServerFn(getDelegatedProductPublication);
  const publish = useServerFn(publishDelegatedProduct);
  const retry = useServerFn(retryDelegatedProductPublication);

  const client = useMemo<DelegatedProductPublicationClient>(
    () => ({
      get: (scope) => get({ data: scope }),
      save: (input) => save({ data: input }),
      listCategories: (id) => listCategories({ data: { workflowId: id } }),
      getFacts: (scope) => getFacts({ data: scope }),
      updateFacts: (scope, patch) => updateFacts({ data: { ...scope, patch } }),
      getDescriptions: (scope) => getDescriptions({ data: scope }),
      updateDescriptions: (scope, descriptions) =>
        updateDescriptions({ data: { ...scope, descriptions } }),
      getPublication: (scope) => getPublication({ data: scope }),
      publish: (input) => publish({ data: input }),
      retry: (input) => retry({ data: input }),
    }),
    [
      get,
      getDescriptions,
      getFacts,
      getPublication,
      listCategories,
      publish,
      retry,
      save,
      updateDescriptions,
      updateFacts,
    ],
  );

  return (
    <DelegatedProductPublicationScreenView
      workflowId={workflowId}
      productDraftId={productDraftId}
      client={client}
    />
  );
}

export function DelegatedProductPublicationScreenView({
  workflowId,
  productDraftId,
  client,
  requestManager: suppliedRequestManager,
}: {
  workflowId: string;
  productDraftId: string;
  client: DelegatedProductPublicationClient;
  requestManager?: DelegatedActionRequestManager;
}) {
  const lang = useLang();
  const scope = useMemo(() => ({ workflowId, productDraftId }), [productDraftId, workflowId]);
  const requestManager = useMemo(
    () => suppliedRequestManager ?? new DelegatedActionRequestManager(),
    [suppliedRequestManager],
  );
  const publishAction = useMemo(
    () => ({
      workflowId,
      actionType: "publish_product_draft" as const,
      target: productDraftId,
    }),
    [productDraftId, workflowId],
  );
  const retryAction = useMemo(
    () => ({
      workflowId,
      actionType: "retry_product_publication" as const,
      target: productDraftId,
    }),
    [productDraftId, workflowId],
  );

  const [snapshot, setSnapshot] = useState<DelegatedProductDraftSnapshot | null>(null);
  const [form, setForm] = useState<ProductDraftFieldsValue | null>(null);
  const [categories, setCategories] = useState<DelegatedProductCategory[]>([]);
  const [publication, setPublication] = useState<SellerProductPublicationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<PageError | null>(null);
  const [statusReadFailed, setStatusReadFailed] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadRequest, setLoadRequest] = useState(0);
  const [factsState, setFactsState] = useState<ProductDraftFactsEditorState>(cleanEditorState);
  const [descriptionState, setDescriptionState] =
    useState<ProductDraftDescriptionEditorState>(cleanEditorState);
  const [pendingPublish, setPendingPublish] =
    useState<DelegatedActionRequestRecord<DelegatedProductFields> | null>(null);
  const [pendingRetry, setPendingRetry] = useState<DelegatedActionRequestRecord | null>(null);

  const refreshPendingActions = useCallback(() => {
    const storedPublish = requestManager.getPending<DelegatedProductFields>(publishAction);
    if (
      storedPublish &&
      !delegatedProductFieldsSchema.safeParse(storedPublish.normalizedPayload).success
    ) {
      requestManager.discardPending(publishAction);
      setPendingPublish(null);
    } else {
      setPendingPublish(storedPublish);
    }

    const storedRetry = requestManager.getPending(retryAction);
    if (storedRetry?.normalizedPayload !== null) {
      requestManager.discardPending(retryAction);
      setPendingRetry(null);
    } else {
      setPendingRetry(storedRetry);
    }
  }, [publishAction, requestManager, retryAction]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPageError(null);
    setFieldError(null);
    setActionError(null);
    setActionSuccess(null);

    void Promise.all([client.get(scope), client.listCategories(workflowId)])
      .then(([nextSnapshot, categoryResult]) => {
        if (cancelled) return;
        setSnapshot(nextSnapshot);
        setForm(formFromSnapshot(nextSnapshot));
        setCategories(categoryResult.categories);
        refreshPendingActions();
      })
      .catch((error) => {
        if (!cancelled) setPageError(pageErrorFrom(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    void client
      .getPublication(scope)
      .then((nextPublication) => {
        if (cancelled) return;
        setPublication(nextPublication);
        setStatusReadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setStatusReadFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [client, loadRequest, refreshPendingActions, scope, workflowId]);

  const refreshPublication = useCallback(async () => {
    try {
      const next = await client.getPublication(scope);
      setPublication(next);
      setStatusReadFailed(false);
      if (next.publicationStatus === "completed") {
        const canonical = await client.get(scope);
        setSnapshot(canonical);
        setForm(formFromSnapshot(canonical));
      }
      return next;
    } catch {
      setStatusReadFailed(true);
      return null;
    }
  }, [client, scope]);

  useEffect(() => {
    if (!isActiveProductPublication(publication?.publicationStatus)) return;
    let cancelled = false;
    let timer: number | null = null;

    const poll = async () => {
      const next = await refreshPublication();
      if (!cancelled && (!next || isActiveProductPublication(next.publicationStatus))) {
        timer = window.setTimeout(() => void poll(), 2_000);
      }
    };

    timer = window.setTimeout(() => void poll(), 2_000);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [publication?.publicationStatus, refreshPublication]);

  const factsClient = useMemo<ProductDraftFactsEditorClient>(
    () => ({
      get: (id) => client.getFacts({ workflowId, productDraftId: id }),
      update: (id, patch) => client.updateFacts({ workflowId, productDraftId: id }, patch),
    }),
    [client, workflowId],
  );
  const descriptionClient = useMemo<ProductDraftDescriptionEditorClient>(
    () => ({
      get: (id) => client.getDescriptions({ workflowId, productDraftId: id }),
      update: (id, descriptions) =>
        client.updateDescriptions({ workflowId, productDraftId: id }, descriptions),
    }),
    [client, workflowId],
  );

  const publicationActive = isActiveProductPublication(publication?.publicationStatus);
  const published =
    publication?.publicationStatus === "completed" ||
    snapshot?.product.status === "published" ||
    snapshot?.product.status === "archived";
  const editorsDisabled = Boolean(!snapshot?.product.editable || publicationActive || published);
  const coordinatedEditorBusy =
    factsState.dirty || factsState.saving || descriptionState.dirty || descriptionState.saving;
  const normalizedForm = form ? tryNormalizeForm(form).value : null;
  const formDirty =
    snapshot !== null &&
    normalizedForm !== null &&
    !samePayload(normalizedForm, fieldsFromSnapshot(snapshot));
  const pendingPublishPayload = delegatedProductFieldsSchema.safeParse(
    pendingPublish?.normalizedPayload,
  );
  const pendingPublishDiffers =
    pendingPublish !== null &&
    normalizedForm !== null &&
    pendingPublishPayload.success &&
    !samePayload(normalizedForm, pendingPublishPayload.data);

  async function saveFields() {
    if (!form || busy || editorsDisabled) return;
    const normalized = tryNormalizeForm(form);
    if (!normalized.value) {
      setFieldError(normalized.error);
      return;
    }
    setBusy(true);
    setFieldError(null);
    setActionError(null);
    setActionSuccess(null);
    try {
      const next = await client.save({ ...scope, ...normalized.value });
      setSnapshot(next);
      setForm(formFromSnapshot(next));
      setActionSuccess(tr(S.saved));
    } catch (error) {
      setActionError(actionErrorMessage(error, tr(S.saveFailed)));
      if (errorCode(error) === "delegated_product_draft_not_editable") {
        await refreshCanonical();
      }
    } finally {
      setBusy(false);
    }
  }

  async function publishProduct(mode: "default" | "resume" | "new" = "default") {
    if (!form || busy || editorsDisabled || coordinatedEditorBusy) return;
    const normalized = tryNormalizeForm(form);
    if (!normalized.value) {
      setFieldError(normalized.error);
      return;
    }
    if (mode === "default" && pendingPublish) return;

    setBusy(true);
    setFieldError(null);
    setActionError(null);
    setActionSuccess(null);
    try {
      const next = await requestManager.run({
        ...publishAction,
        newRequest: mode === "new",
        normalizedPayload: normalized.value,
        execute: (requestId, storedPayload) => {
          const parsed = delegatedProductFieldsSchema.safeParse(storedPayload);
          if (!parsed.success) throw new Error("Stored publication payload is invalid.");
          return client.publish({ ...scope, ...parsed.data, requestId });
        },
      });
      setPublication(next);
      setActionSuccess(tr(S.publicationStarted));
      if (next.publicationStatus === "completed") await refreshCanonical();
    } catch (error) {
      setActionError(actionErrorMessage(error, tr(S.publicationFailed)));
      if (errorCode(error) === "product_publication_in_progress") {
        await refreshPublication();
      }
      if (errorCode(error) === "delegated_product_draft_not_editable") {
        await refreshCanonical();
      }
    } finally {
      refreshPendingActions();
      setBusy(false);
    }
  }

  async function retryPublication(mode: "resume" | "new" = "new") {
    if (busy || publicationActive) return;
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const next = await requestManager.run({
        ...retryAction,
        newRequest: mode === "new",
        normalizedPayload: null,
        execute: (requestId) => client.retry({ ...scope, requestId }),
      });
      setPublication(next);
      setActionSuccess(tr(S.publicationStarted));
      if (next.publicationStatus === "completed") await refreshCanonical();
    } catch (error) {
      setActionError(actionErrorMessage(error, tr(S.publicationFailed)));
    } finally {
      refreshPendingActions();
      setBusy(false);
    }
  }

  async function refreshCanonical() {
    try {
      const canonical = await client.get(scope);
      setSnapshot(canonical);
      setForm(formFromSnapshot(canonical));
    } catch {
      setActionError(tr(S.unavailable));
    }
  }

  async function refreshGallery() {
    const next = await client.get(scope);
    setSnapshot((current) =>
      current
        ? {
            ...current,
            seller: next.seller,
            source: next.source,
            product: {
              ...current.product,
              status: next.product.status,
              editable: next.product.editable,
              coverImageId: next.product.coverImageId,
            },
            gallery: next.gallery,
          }
        : next,
    );
    return next.gallery;
  }

  return (
    <ClassifierImportShell>
      <div className="space-y-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="font-display text-2xl font-semibold">{tr(S.title)}</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{tr(S.description)}</p>
          </div>
          <Button asChild variant="outline">
            <Link
              to="/admin/classifier-uploads/$workflowId/import"
              params={{ workflowId }}
              search={{ lang }}
            >
              {tr(S.back)}
            </Link>
          </Button>
        </header>

        {pageError ? (
          <Alert variant="destructive">
            <AlertTitle>{tr(S.loadFailed)}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{pageError.message}</p>
              {pageError.retryable ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLoadRequest((value) => value + 1)}
                >
                  {tr(S.retry)}
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {!snapshot && loading ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">{tr(S.loading)}</CardContent>
          </Card>
        ) : null}

        {snapshot && form ? (
          <>
            <DelegatedClassifierSellerCard
              seller={{
                sellerId: snapshot.seller.id,
                name: snapshot.seller.name,
                slug: snapshot.seller.slug,
                published: snapshot.seller.storefrontPublished,
              }}
            />

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{tr(S.source)}</CardTitle>
                    <CardDescription className="mt-2 break-all font-mono">
                      {productDraftId}
                    </CardDescription>
                  </div>
                  <Badge variant={published ? "outline" : "secondary"}>
                    {snapshot.product.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <Definition label={tr(S.workflow)} value={workflowId} />
                  <Definition
                    label={tr(S.organization)}
                    value={snapshot.source.classifierOrganizationId}
                  />
                  <Definition label={tr(S.batch)} value={snapshot.source.classifierBatchId} />
                  <Definition label={tr(S.group)} value={snapshot.source.classifierGroupId} />
                  <Definition
                    label={tr(S.selectedCover)}
                    value={snapshot.product.coverImageId ?? tr(S.noCover)}
                  />
                </dl>
              </CardContent>
            </Card>

            <ProductDraftImageGallery
              initialGallery={snapshot.gallery}
              productTitle={form.title}
              refresh={refreshGallery}
            />

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{tr(S.productFields)}</h2>
                </CardTitle>
                <CardDescription>{tr(S.productFieldsDescription)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ProductDraftFields
                  value={form}
                  categories={categories}
                  titleSource={snapshot.product.titleSource}
                  disabled={editorsDisabled || busy}
                  onChange={(next) => {
                    setForm(next);
                    setFieldError(null);
                    setActionError(null);
                    setActionSuccess(null);
                  }}
                />
                {fieldError ? (
                  <Alert variant="destructive">
                    <AlertDescription>{fieldError}</AlertDescription>
                  </Alert>
                ) : null}
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!formDirty || editorsDisabled || busy}
                    onClick={() => void saveFields()}
                  >
                    {busy ? tr(S.saving) : tr(S.save)}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <ProductDraftFactsEditorView
              productDraftId={productDraftId}
              client={factsClient}
              disabled={editorsDisabled}
              onStateChange={setFactsState}
            />

            <ProductDraftDescriptionEditor
              productDraftId={productDraftId}
              client={descriptionClient}
              disabled={editorsDisabled}
              onStateChange={setDescriptionState}
            />

            <ProductPublicationStatus
              snapshot={publication}
              statusReadFailed={statusReadFailed}
              busy={busy}
              onRefresh={() => void refreshPublication()}
              onRetry={() => void retryPublication(pendingRetry ? "resume" : "new")}
            />

            {pendingPublish ? (
              <Alert>
                <AlertTitle>{tr(S.uncertainTitle)}</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{tr(S.uncertainDescription)}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void publishProduct("resume")}
                    >
                      {tr(S.resume)}
                    </Button>
                    {pendingPublishDiffers ? (
                      <Button
                        type="button"
                        disabled={busy || coordinatedEditorBusy}
                        onClick={() => void publishProduct("new")}
                      >
                        {tr(S.submitNew)}
                      </Button>
                    ) : null}
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            {pendingRetry ? (
              <Alert>
                <AlertTitle>{tr(S.retryUncertainTitle)}</AlertTitle>
                <AlertDescription className="flex flex-wrap gap-2 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void retryPublication("resume")}
                  >
                    {tr(S.resumeRetry)}
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      requestManager.discardPending(retryAction);
                      setPendingRetry(null);
                      void retryPublication("new");
                    }}
                  >
                    {tr(S.newRetry)}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}

            {actionError ? (
              <Alert variant="destructive">
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            ) : null}
            {actionSuccess ? (
              <Alert role="status">
                <AlertDescription>{actionSuccess}</AlertDescription>
              </Alert>
            ) : null}

            {coordinatedEditorBusy && !published ? (
              <p className="text-sm text-amber-700">{tr(S.unsavedEditors)}</p>
            ) : null}

            {!published ? (
              <div className="flex justify-end">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      disabled={
                        busy ||
                        publicationActive ||
                        coordinatedEditorBusy ||
                        Boolean(pendingPublish)
                      }
                    >
                      {busy ? tr(S.publishing) : tr(S.publish)}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{tr(S.confirmTitle)}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {snapshot.seller.name}. {tr(S.confirmDescription)}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{tr(S.cancel)}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void publishProduct()}>
                        {tr(S.publish)}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </ClassifierImportShell>
  );
}

function formFromSnapshot(snapshot: DelegatedProductDraftSnapshot): ProductDraftFieldsValue {
  return {
    title: snapshot.product.title,
    categoryId: snapshot.product.categoryId ?? "",
    minimumOrderQuantity:
      snapshot.product.minimumOrderQuantity === null
        ? ""
        : String(snapshot.product.minimumOrderQuantity),
    packSize: snapshot.product.packSize ?? "",
    price: snapshot.product.price === null ? "" : String(snapshot.product.price),
    currency: snapshot.product.currency,
    stock: snapshot.product.stock,
    trending: snapshot.product.trending,
  };
}

function fieldsFromSnapshot(snapshot: DelegatedProductDraftSnapshot): DelegatedProductFields {
  return {
    title: snapshot.product.title,
    categoryId: snapshot.product.categoryId,
    minimumOrderQuantity: snapshot.product.minimumOrderQuantity,
    packSize: snapshot.product.packSize,
    price: snapshot.product.price,
    currency: snapshot.product.currency,
    stock: snapshot.product.stock,
    trending: snapshot.product.trending,
  };
}

function tryNormalizeForm(form: ProductDraftFieldsValue): {
  value: DelegatedProductFields | null;
  error: string | null;
} {
  try {
    const minimumOrderQuantity = nullableNumber(form.minimumOrderQuantity, true);
    const price = nullableNumber(form.price, false);
    const candidate = {
      title: normalizeProductDraftTitle(form.title),
      categoryId: form.categoryId || null,
      minimumOrderQuantity,
      packSize: form.packSize.trim() || null,
      price,
      currency: form.currency.trim(),
      stock: form.stock,
      trending: form.trending,
    };
    const parsed = delegatedProductFieldsSchema.safeParse(candidate);
    return parsed.success
      ? { value: parsed.data, error: null }
      : { value: null, error: tr(S.invalidFields) };
  } catch {
    return { value: null, error: tr(S.invalidFields) };
  }
}

function nullableNumber(value: string, integer: boolean): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number))) {
    throw new Error("Invalid numeric product field.");
  }
  return number;
}

function samePayload(left: DelegatedProductFields, right: DelegatedProductFields): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function Definition({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs">{value}</dd>
    </div>
  );
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

type PageError = {
  message: string;
  retryable: boolean;
};

function pageErrorFrom(error: unknown): PageError {
  switch (errorCode(error)) {
    case "delegated_product_draft_not_found":
      return { message: tr(S.notFound), retryable: false };
    case "prototype_administrator_required":
      return { message: tr(S.administratorRequired), retryable: false };
    default:
      return { message: tr(S.unavailable), retryable: true };
  }
}

function actionErrorMessage(error: unknown, fallback: string): string {
  switch (errorCode(error)) {
    case "delegated_product_draft_invalid":
    case "product_publication_invalid":
      return tr(S.invalidFields);
    case "delegated_product_draft_not_found":
      return tr(S.notFound);
    case "delegated_product_draft_not_editable":
    case "product_publication_not_allowed":
      return tr(S.notEditable);
    case "product_publication_title_required":
      return tr(S.titleRequired);
    case "product_publication_title_invalid":
      return tr(S.titleInvalid);
    case "product_publication_description_invalid":
      return tr(S.descriptionInvalid);
    case "product_publication_category_required":
      return tr(S.categoryRequired);
    case "product_publication_image_required":
    case "product_publication_images_not_ready":
      return tr(S.imagesNotReady);
    case "product_publication_in_progress":
      return tr(S.publicationInProgress);
    case "delegated_action_in_progress":
      return tr(S.actionInProgress);
    case "delegated_action_request_conflict":
      return tr(S.requestConflict);
    case "prototype_administrator_required":
      return tr(S.administratorRequired);
    case "delegated_product_draft_unavailable":
    case "product_publication_configuration_invalid":
    case "product_publication_unavailable":
      return tr(S.unavailable);
    default:
      return fallback;
  }
}
