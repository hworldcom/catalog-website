import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseAccessToken } from "@/lib/supabase/client";
import { t, tr, useLang } from "@/lib/i18n";

import { approveMyClassifierBatchAndCreateDrafts } from "../seller-classifier-import.functions";
import type { SellerClassifierDraftImportSnapshot } from "../seller-classifier-import.types";
import {
  approveMyClassifierGroup,
  createMyClassifierGroup,
  getMyClassifierReview,
  listSellerClassifierCategories,
  mergeMyClassifierGroups,
  moveMyClassifierImage,
  rejectMyClassifierImage,
  restoreMyClassifierImage,
  selectMyClassifierGroupCategory,
  selectMyClassifierGroupCover,
  setMyClassifierImageDuplicate,
  splitMyClassifierGroup,
} from "../seller-classifier-review.functions";
import type {
  CreateSellerClassifierGroupInput,
  MergeSellerClassifierGroupsInput,
  MoveSellerClassifierImageInput,
  SelectSellerClassifierCategoryInput,
  SelectSellerClassifierCoverInput,
  SellerClassifierCategory,
  SellerClassifierGroupImageInput,
  SellerClassifierGroupInput,
  SellerClassifierReviewGroup,
  SellerClassifierReviewImage,
  SellerClassifierReviewSnapshot,
  SetSellerClassifierDuplicateInput,
  SplitSellerClassifierGroupInput,
} from "../seller-classifier-review.types";

const S = {
  title: t(
    "Review product groups",
    "Sprawdź grupy produktów",
    "Produktgruppen prüfen",
    "Xem xét nhóm sản phẩm",
  ),
  description: t(
    "Correct the proposed groups, choose categories, and approve each product group.",
    "Popraw proponowane grupy, wybierz kategorie i zatwierdź każdą grupę produktów.",
    "Korrigieren Sie die vorgeschlagenen Gruppen, wählen Sie Kategorien und genehmigen Sie jede Produktgruppe.",
    "Chỉnh sửa các nhóm đề xuất, chọn danh mục và phê duyệt từng nhóm sản phẩm.",
  ),
  loading: t(
    "Loading product review…",
    "Ładowanie weryfikacji produktów…",
    "Produktprüfung wird geladen…",
    "Đang tải phần xem xét sản phẩm…",
  ),
  loadErrorTitle: t(
    "Product review could not be loaded",
    "Nie można załadować weryfikacji produktów",
    "Produktprüfung konnte nicht geladen werden",
    "Không thể tải phần xem xét sản phẩm",
  ),
  notFound: t(
    "This classifier workflow was not found.",
    "Nie znaleziono tego procesu klasyfikatora.",
    "Dieser Klassifikator-Ablauf wurde nicht gefunden.",
    "Không tìm thấy quy trình phân loại này.",
  ),
  setupError: t(
    "Classifier review is not configured.",
    "Weryfikacja klasyfikatora nie jest skonfigurowana.",
    "Die Klassifikatorprüfung ist nicht konfiguriert.",
    "Phần xem xét phân loại chưa được cấu hình.",
  ),
  unavailable: t(
    "Classifier review is temporarily unavailable.",
    "Weryfikacja klasyfikatora jest tymczasowo niedostępna.",
    "Die Klassifikatorprüfung ist vorübergehend nicht verfügbar.",
    "Phần xem xét phân loại tạm thời không khả dụng.",
  ),
  retry: t("Try again", "Spróbuj ponownie", "Erneut versuchen", "Thử lại"),
  stage: t("Review stage", "Etap weryfikacji", "Prüfstatus", "Giai đoạn xem xét"),
  pipeline: t(
    "Processing version",
    "Wersja przetwarzania",
    "Verarbeitungsversion",
    "Phiên bản xử lý",
  ),
  groups: t("Product groups", "Grupy produktów", "Produktgruppen", "Nhóm sản phẩm"),
  noGroups: t(
    "No product groups are available for review.",
    "Brak grup produktów do weryfikacji.",
    "Es sind keine Produktgruppen zur Prüfung verfügbar.",
    "Không có nhóm sản phẩm nào để xem xét.",
  ),
  group: t("Group", "Grupa", "Gruppe", "Nhóm"),
  proposed: t("Needs review", "Wymaga weryfikacji", "Prüfung nötig", "Cần xem xét"),
  approved: t("Approved", "Zatwierdzona", "Genehmigt", "Đã phê duyệt"),
  suggestedCategory: t(
    "Suggested category",
    "Sugerowana kategoria",
    "Vorgeschlagene Kategorie",
    "Danh mục đề xuất",
  ),
  approvedCategory: t(
    "Approved category",
    "Zatwierdzona kategoria",
    "Genehmigte Kategorie",
    "Danh mục được phê duyệt",
  ),
  chooseCategory: t(
    "Choose a category",
    "Wybierz kategorię",
    "Kategorie auswählen",
    "Chọn danh mục",
  ),
  inactiveCategory: t(
    "Inactive current category",
    "Nieaktywna bieżąca kategoria",
    "Inaktive aktuelle Kategorie",
    "Danh mục hiện tại không hoạt động",
  ),
  saveCategory: t("Save category", "Zapisz kategorię", "Kategorie speichern", "Lưu danh mục"),
  clearCategory: t("Clear category", "Wyczyść kategorię", "Kategorie löschen", "Xóa danh mục"),
  confidence: t("Confidence", "Pewność", "Konfidenz", "Độ tin cậy"),
  warning: t("Review warning", "Ostrzeżenie", "Prüfhinweis", "Cảnh báo xem xét"),
  imageSelected: t("Select image", "Wybierz obraz", "Bild auswählen", "Chọn ảnh"),
  selected: t("selected", "wybrano", "ausgewählt", "đã chọn"),
  createGroup: t("Create group", "Utwórz grupę", "Gruppe erstellen", "Tạo nhóm"),
  creatingGroupHelp: t(
    "Select one or more images from editable groups.",
    "Wybierz co najmniej jeden obraz z edytowalnych grup.",
    "Wählen Sie mindestens ein Bild aus bearbeitbaren Gruppen.",
    "Chọn một hoặc nhiều ảnh từ các nhóm có thể chỉnh sửa.",
  ),
  mergeGroups: t("Merge groups", "Połącz grupy", "Gruppen zusammenführen", "Gộp nhóm"),
  mergeHelp: t(
    "Choose one target group and one or more source groups.",
    "Wybierz jedną grupę docelową i co najmniej jedną grupę źródłową.",
    "Wählen Sie eine Zielgruppe und mindestens eine Quellgruppe.",
    "Chọn một nhóm đích và một hoặc nhiều nhóm nguồn.",
  ),
  targetGroup: t("Target group", "Grupa docelowa", "Zielgruppe", "Nhóm đích"),
  sourceGroups: t("Source groups", "Grupy źródłowe", "Quellgruppen", "Nhóm nguồn"),
  chooseGroup: t("Choose a group", "Wybierz grupę", "Gruppe auswählen", "Chọn nhóm"),
  merge: t("Merge", "Połącz", "Zusammenführen", "Gộp"),
  split: t(
    "Split into new group",
    "Wydziel do nowej grupy",
    "In neue Gruppe aufteilen",
    "Tách thành nhóm mới",
  ),
  moveTo: t("Move to group", "Przenieś do grupy", "In Gruppe verschieben", "Chuyển sang nhóm"),
  move: t("Move image", "Przenieś obraz", "Bild verschieben", "Chuyển ảnh"),
  setCover: t("Set as cover", "Ustaw jako okładkę", "Als Titelbild festlegen", "Đặt làm ảnh bìa"),
  cover: t("Cover", "Okładka", "Titelbild", "Ảnh bìa"),
  member: t("Member", "Element grupy", "Gruppenbild", "Thành viên"),
  duplicate: t("Duplicate", "Duplikat", "Duplikat", "Ảnh trùng"),
  duplicateOf: t("Duplicate of", "Duplikat obrazu", "Duplikat von", "Trùng với"),
  chooseImage: t("Choose an image", "Wybierz obraz", "Bild auswählen", "Chọn ảnh"),
  markDuplicate: t(
    "Mark duplicate",
    "Oznacz jako duplikat",
    "Als Duplikat markieren",
    "Đánh dấu trùng",
  ),
  clearDuplicate: t(
    "Clear duplicate",
    "Usuń oznaczenie duplikatu",
    "Duplikat aufheben",
    "Bỏ đánh dấu trùng",
  ),
  reject: t("Exclude image", "Wyklucz obraz", "Bild ausschließen", "Loại ảnh"),
  restore: t("Restore image", "Przywróć obraz", "Bild wiederherstellen", "Khôi phục ảnh"),
  rejected: t("Excluded", "Wykluczony", "Ausgeschlossen", "Đã loại"),
  rejectTitle: t(
    "Exclude this image?",
    "Wykluczyć ten obraz?",
    "Dieses Bild ausschließen?",
    "Loại ảnh này?",
  ),
  rejectDescription: t(
    "The image will remain in the review but will not be used when creating the product draft.",
    "Obraz pozostanie w weryfikacji, ale nie zostanie użyty podczas tworzenia szkicu produktu.",
    "Das Bild bleibt in der Prüfung, wird aber nicht für den Produktentwurf verwendet.",
    "Ảnh vẫn còn trong phần xem xét nhưng sẽ không được dùng để tạo bản nháp sản phẩm.",
  ),
  cancel: t("Cancel", "Anuluj", "Abbrechen", "Hủy"),
  approveGroup: t("Approve group", "Zatwierdź grupę", "Gruppe genehmigen", "Phê duyệt nhóm"),
  approvalCategoryNeeded: t(
    "Choose an active product category.",
    "Wybierz aktywną kategorię produktu.",
    "Wählen Sie eine aktive Produktkategorie.",
    "Chọn một danh mục sản phẩm đang hoạt động.",
  ),
  approvalImageNeeded: t(
    "Keep at least one active non-duplicate image.",
    "Pozostaw co najmniej jeden aktywny obraz niebędący duplikatem.",
    "Behalten Sie mindestens ein aktives Bild, das kein Duplikat ist.",
    "Giữ ít nhất một ảnh hoạt động không trùng.",
  ),
  approvalCoverNeeded: t(
    "Choose an active non-duplicate cover.",
    "Wybierz aktywną okładkę niebędącą duplikatem.",
    "Wählen Sie ein aktives Titelbild, das kein Duplikat ist.",
    "Chọn ảnh bìa hoạt động không trùng.",
  ),
  approvalReady: t(
    "This group is ready for approval.",
    "Ta grupa jest gotowa do zatwierdzenia.",
    "Diese Gruppe kann genehmigt werden.",
    "Nhóm này đã sẵn sàng để phê duyệt.",
  ),
  approveAndCreate: t(
    "Approve and create drafts",
    "Zatwierdź i utwórz szkice",
    "Genehmigen und Entwürfe erstellen",
    "Phê duyệt và tạo bản nháp",
  ),
  approveAllHelp: t(
    "Approve every group before creating product drafts.",
    "Zatwierdź każdą grupę przed utworzeniem szkiców produktów.",
    "Genehmigen Sie jede Gruppe, bevor Produktentwürfe erstellt werden.",
    "Phê duyệt mọi nhóm trước khi tạo bản nháp sản phẩm.",
  ),
  draftActionPending: t(
    "All groups are approved. You can now create product drafts.",
    "Wszystkie grupy są zatwierdzone. Możesz teraz utworzyć szkice produktów.",
    "Alle Gruppen sind genehmigt. Sie können jetzt Produktentwürfe erstellen.",
    "Tất cả nhóm đã được phê duyệt. Bạn có thể tạo bản nháp sản phẩm ngay bây giờ.",
  ),
  noGroupDraftHelp: t(
    "A product group is required before drafts can be created.",
    "Przed utworzeniem szkiców wymagana jest grupa produktów.",
    "Vor der Entwurfserstellung ist eine Produktgruppe erforderlich.",
    "Cần có nhóm sản phẩm trước khi tạo bản nháp.",
  ),
  saving: t(
    "Saving review change…",
    "Zapisywanie zmiany…",
    "Änderung wird gespeichert…",
    "Đang lưu thay đổi…",
  ),
  actionInvalid: t(
    "Check the selected review values and try again.",
    "Sprawdź wybrane wartości i spróbuj ponownie.",
    "Prüfen Sie die ausgewählten Werte und versuchen Sie es erneut.",
    "Kiểm tra các giá trị đã chọn rồi thử lại.",
  ),
  resourceChanged: t(
    "The review changed elsewhere. The latest version has been loaded.",
    "Weryfikacja została zmieniona gdzie indziej. Załadowano najnowszą wersję.",
    "Die Prüfung wurde an anderer Stelle geändert. Die neueste Version wurde geladen.",
    "Phần xem xét đã thay đổi ở nơi khác. Phiên bản mới nhất đã được tải.",
  ),
  stateChanged: t(
    "This action is no longer allowed. The latest review has been loaded.",
    "Ta czynność nie jest już dozwolona. Załadowano najnowszą weryfikację.",
    "Diese Aktion ist nicht mehr erlaubt. Die neueste Prüfung wurde geladen.",
    "Thao tác này không còn được phép. Phần xem xét mới nhất đã được tải.",
  ),
  saved: t(
    "Review updated.",
    "Weryfikacja zaktualizowana.",
    "Prüfung aktualisiert.",
    "Đã cập nhật xem xét.",
  ),
  creatingDrafts: t(
    "Starting product draft creation…",
    "Rozpoczynanie tworzenia szkiców produktów…",
    "Produktentwürfe werden vorbereitet…",
    "Đang bắt đầu tạo bản nháp sản phẩm…",
  ),
  staleReview: t(
    "The review changed before draft creation. Check and approve the latest groups.",
    "Weryfikacja zmieniła się przed utworzeniem szkiców. Sprawdź i zatwierdź najnowsze grupy.",
    "Die Prüfung wurde vor der Entwurfserstellung geändert. Prüfen und genehmigen Sie die aktuellen Gruppen.",
    "Phần xem xét đã thay đổi trước khi tạo bản nháp. Hãy kiểm tra và phê duyệt các nhóm mới nhất.",
  ),
  approvalInvalid: t(
    "The draft creation request is invalid.",
    "Żądanie utworzenia szkiców jest nieprawidłowe.",
    "Die Anfrage zur Entwurfserstellung ist ungültig.",
    "Yêu cầu tạo bản nháp không hợp lệ.",
  ),
  importOwnershipConflict: t(
    "This batch cannot be imported for the current store. Contact support.",
    "Nie można zaimportować tej partii do bieżącego sklepu. Skontaktuj się z pomocą techniczną.",
    "Dieser Stapel kann nicht für den aktuellen Shop importiert werden. Wenden Sie sich an den Support.",
    "Không thể nhập lô này cho cửa hàng hiện tại. Hãy liên hệ bộ phận hỗ trợ.",
  ),
  importUnavailable: t(
    "Product draft creation is temporarily unavailable.",
    "Tworzenie szkiców produktów jest tymczasowo niedostępne.",
    "Die Erstellung von Produktentwürfen ist vorübergehend nicht verfügbar.",
    "Tính năng tạo bản nháp sản phẩm tạm thời không khả dụng.",
  ),
  thumbnailLoading: t("Loading image", "Ładowanie obrazu", "Bild wird geladen", "Đang tải ảnh"),
  thumbnailUnavailable: t(
    "Image unavailable",
    "Obraz niedostępny",
    "Bild nicht verfügbar",
    "Ảnh không khả dụng",
  ),
  source: t("Grouping source", "Źródło grupowania", "Gruppierungsquelle", "Nguồn nhóm"),
  image: t("image", "obraz", "Bild", "ảnh"),
  images: t("images", "obrazy", "Bilder", "ảnh"),
};

export type SellerClassifierReviewClient = {
  getReview(workflowId: string): Promise<SellerClassifierReviewSnapshot>;
  listCategories(): Promise<SellerClassifierCategory[]>;
  createGroup(input: CreateSellerClassifierGroupInput): Promise<SellerClassifierReviewSnapshot>;
  mergeGroups(input: MergeSellerClassifierGroupsInput): Promise<SellerClassifierReviewSnapshot>;
  splitGroup(input: SplitSellerClassifierGroupInput): Promise<SellerClassifierReviewSnapshot>;
  moveImage(input: MoveSellerClassifierImageInput): Promise<SellerClassifierReviewSnapshot>;
  setDuplicate(input: SetSellerClassifierDuplicateInput): Promise<SellerClassifierReviewSnapshot>;
  selectCover(input: SelectSellerClassifierCoverInput): Promise<SellerClassifierReviewSnapshot>;
  selectCategory(
    input: SelectSellerClassifierCategoryInput,
  ): Promise<SellerClassifierReviewSnapshot>;
  rejectImage(input: SellerClassifierGroupImageInput): Promise<SellerClassifierReviewSnapshot>;
  restoreImage(input: SellerClassifierGroupImageInput): Promise<SellerClassifierReviewSnapshot>;
  approveGroup(input: SellerClassifierGroupInput): Promise<SellerClassifierReviewSnapshot>;
  approveAndCreate(input: { workflowId: string }): Promise<SellerClassifierDraftImportSnapshot>;
};

type ThumbnailDependencies = {
  getAccessToken: () => Promise<string | null>;
  fetch: typeof fetch;
};

type PageError = {
  message: string;
  retryable: boolean;
};

type MutationOperation = () => Promise<SellerClassifierReviewSnapshot>;

const defaultThumbnailDependencies: ThumbnailDependencies = {
  getAccessToken: getSupabaseAccessToken,
  fetch: (...args) => fetch(...args),
};

export function SellerClassifierReviewScreen({
  workflowId,
  notice,
}: {
  workflowId: string;
  notice?: "groups-not-approved";
}) {
  const navigate = useNavigate();
  const lang = useLang();
  const getReview = useServerFn(getMyClassifierReview);
  const listCategories = useServerFn(listSellerClassifierCategories);
  const createGroup = useServerFn(createMyClassifierGroup);
  const mergeGroups = useServerFn(mergeMyClassifierGroups);
  const splitGroup = useServerFn(splitMyClassifierGroup);
  const moveImage = useServerFn(moveMyClassifierImage);
  const setDuplicate = useServerFn(setMyClassifierImageDuplicate);
  const selectCover = useServerFn(selectMyClassifierGroupCover);
  const selectCategory = useServerFn(selectMyClassifierGroupCategory);
  const rejectImage = useServerFn(rejectMyClassifierImage);
  const restoreImage = useServerFn(restoreMyClassifierImage);
  const approveGroup = useServerFn(approveMyClassifierGroup);
  const approveAndCreate = useServerFn(approveMyClassifierBatchAndCreateDrafts);

  const client = useMemo<SellerClassifierReviewClient>(
    () => ({
      getReview: (id) => getReview({ data: { workflowId: id } }),
      listCategories: () => listCategories(),
      createGroup: (input) => createGroup({ data: input }),
      mergeGroups: (input) => mergeGroups({ data: input }),
      splitGroup: (input) => splitGroup({ data: input }),
      moveImage: (input) => moveImage({ data: input }),
      setDuplicate: (input) => setDuplicate({ data: input }),
      selectCover: (input) => selectCover({ data: input }),
      selectCategory: (input) => selectCategory({ data: input }),
      rejectImage: (input) => rejectImage({ data: input }),
      restoreImage: (input) => restoreImage({ data: input }),
      approveGroup: (input) => approveGroup({ data: input }),
      approveAndCreate: (input) => approveAndCreate({ data: input }),
    }),
    [
      approveGroup,
      approveAndCreate,
      createGroup,
      getReview,
      listCategories,
      mergeGroups,
      moveImage,
      rejectImage,
      restoreImage,
      selectCategory,
      selectCover,
      setDuplicate,
      splitGroup,
    ],
  );

  return (
    <SellerClassifierReviewScreenView
      workflowId={workflowId}
      client={client}
      initialNotice={notice}
      onImportAccepted={() =>
        void navigate({
          to: "/seller/classifier-batches/$workflowId/import",
          params: { workflowId },
          search: { lang },
        })
      }
    />
  );
}

export function SellerClassifierReviewScreenView({
  workflowId,
  client,
  thumbnailDependencies = defaultThumbnailDependencies,
  initialNotice,
  onImportAccepted = () => {},
}: {
  workflowId: string;
  client: SellerClassifierReviewClient;
  thumbnailDependencies?: ThumbnailDependencies;
  initialNotice?: "groups-not-approved";
  onImportAccepted?: () => void;
}) {
  const [snapshot, setSnapshot] = useState<SellerClassifierReviewSnapshot | null>(null);
  const [categories, setCategories] = useState<SellerClassifierCategory[] | null>(null);
  const [pageError, setPageError] = useState<PageError | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(() => new Set());
  const [mergeTargetGroupId, setMergeTargetGroupId] = useState("");
  const [mergeSourceGroupIds, setMergeSourceGroupIds] = useState<Set<string>>(() => new Set());
  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({});
  const [duplicateTargets, setDuplicateTargets] = useState<Record<string, string>>({});
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [snapshotGeneration, setSnapshotGeneration] = useState(0);
  const [transientStateVersion, setTransientStateVersion] = useState(0);
  const mutationLock = useRef(false);
  const loadRequest = useRef(0);
  const initialNoticePending = useRef(initialNotice === "groups-not-approved");

  const resetTransientState = useCallback(() => {
    setSelectedImageIds(new Set());
    setMergeTargetGroupId("");
    setMergeSourceGroupIds(new Set());
    setMoveTargets({});
    setDuplicateTargets({});
    setCategoryDrafts({});
    setTransientStateVersion((value) => value + 1);
  }, []);

  const acceptSnapshot = useCallback(
    (next: SellerClassifierReviewSnapshot) => {
      setSnapshot(next);
      setSnapshotGeneration((value) => value + 1);
      resetTransientState();
    },
    [resetTransientState],
  );

  const loadPage = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setPageError(null);
    try {
      const [nextSnapshot, nextCategories] = await Promise.all([
        client.getReview(workflowId),
        client.listCategories(),
      ]);
      if (requestId !== loadRequest.current) return;
      setCategories(nextCategories);
      acceptSnapshot(nextSnapshot);
      if (initialNoticePending.current) {
        initialNoticePending.current = false;
        setActionError(tr(S.staleReview));
      } else {
        setActionError(null);
      }
    } catch (error) {
      if (requestId !== loadRequest.current) return;
      setPageError(reviewPageError(error));
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [acceptSnapshot, client, workflowId]);

  useEffect(() => {
    void loadPage();
    return () => {
      loadRequest.current += 1;
    };
  }, [loadPage]);

  const recoverSnapshot = useCallback(
    async (message: string) => {
      try {
        const next = await client.getReview(workflowId);
        acceptSnapshot(next);
        setActionError(message);
      } catch (error) {
        if (reviewErrorCode(error) === "seller_classifier_batch_not_found") {
          setPageError(reviewPageError(error));
          return;
        }
        setActionError(tr(S.unavailable));
      }
    },
    [acceptSnapshot, client, workflowId],
  );

  const runMutation = useCallback(
    async (label: string, operation: MutationOperation) => {
      if (mutationLock.current) return;
      mutationLock.current = true;
      setBusyAction(label);
      setActionError(null);
      setActionSuccess(null);
      try {
        acceptSnapshot(await operation());
        setActionSuccess(tr(S.saved));
      } catch (error) {
        const code = reviewErrorCode(error);
        if (code === "seller_classifier_review_resource_not_found") {
          await recoverSnapshot(tr(S.resourceChanged));
        } else if (code === "seller_classifier_review_not_allowed") {
          await recoverSnapshot(tr(S.stateChanged));
        } else if (code === "seller_classifier_batch_not_found") {
          setPageError(reviewPageError(error));
        } else {
          setActionError(reviewActionError(error));
        }
      } finally {
        mutationLock.current = false;
        setBusyAction(null);
      }
    },
    [acceptSnapshot, recoverSnapshot],
  );

  const approveAndCreateDrafts = useCallback(async () => {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusyAction(tr(S.creatingDrafts));
    setActionError(null);
    setActionSuccess(null);
    try {
      await client.approveAndCreate({ workflowId });
      onImportAccepted();
    } catch (error) {
      const code = reviewErrorCode(error);
      if (code === "seller_classifier_groups_not_approved") {
        await recoverSnapshot(tr(S.staleReview));
      } else if (code === "seller_classifier_batch_not_found") {
        setPageError(reviewPageError(error));
      } else {
        setActionError(reviewImportActionError(error));
      }
    } finally {
      mutationLock.current = false;
      setBusyAction(null);
    }
  }, [client, onImportAccepted, recoverSnapshot, workflowId]);

  if (loading && (!snapshot || !categories)) {
    return (
      <p className="py-8 text-sm text-muted-foreground" aria-live="polite">
        {tr(S.loading)}
      </p>
    );
  }

  if (pageError || !snapshot || !categories) {
    const error = pageError ?? { message: tr(S.unavailable), retryable: true };
    return (
      <Alert variant="destructive">
        <AlertTitle>{tr(S.loadErrorTitle)}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{error.message}</p>
          {error.retryable ? (
            <Button type="button" variant="outline" onClick={() => void loadPage()}>
              {tr(S.retry)}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  const isBusy = busyAction !== null;
  const editableGroups = snapshot.groups.filter(
    (group) => snapshot.stage === "review" && group.status === "proposed",
  );
  const selectedEditableImageIds = editableGroups.flatMap((group) =>
    group.images
      .filter((image) => selectedImageIds.has(image.imageId))
      .map((image) => image.imageId),
  );
  const selectedMergeSourceGroupIds = editableGroups
    .filter((group) => mergeSourceGroupIds.has(group.groupId))
    .map((group) => group.groupId);
  const allGroupsApproved =
    snapshot.groups.length > 0 && snapshot.groups.every((group) => group.status === "approved");

  function toggleImageSelection(imageId: string) {
    setSelectedImageIds((current) => toggleSetValue(current, imageId));
  }

  function setMergeTarget(groupId: string) {
    setMergeTargetGroupId(groupId);
    setMergeSourceGroupIds((current) => {
      const next = new Set(current);
      next.delete(groupId);
      return next;
    });
  }

  function toggleMergeSource(groupId: string) {
    if (groupId === mergeTargetGroupId) return;
    setMergeSourceGroupIds((current) => toggleSetValue(current, groupId));
  }

  const draftActionHelp =
    snapshot.groups.length === 0
      ? tr(S.noGroupDraftHelp)
      : allGroupsApproved
        ? tr(S.draftActionPending)
        : tr(S.approveAllHelp);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">{tr(S.title)}</h1>
              <CardDescription className="mt-2">{tr(S.description)}</CardDescription>
            </div>
            <Badge variant={snapshot.stage === "approved" ? "default" : "outline"}>
              {snapshot.stage === "approved" ? tr(S.approved) : tr(S.proposed)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Definition label={tr(S.stage)} value={snapshot.stage} />
            <Definition label={tr(S.pipeline)} value={snapshot.pipelineVersion ?? "—"} />
          </dl>
        </CardContent>
      </Card>

      {editableGroups.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tr(S.createGroup)}</CardTitle>
              <CardDescription>{tr(S.creatingGroupHelp)}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedEditableImageIds.length} {tr(S.selected)}
              </span>
              <Button
                type="button"
                disabled={isBusy || selectedEditableImageIds.length === 0}
                onClick={() =>
                  void runMutation(tr(S.createGroup), () =>
                    client.createGroup({ workflowId, imageIds: selectedEditableImageIds }),
                  )
                }
              >
                {tr(S.createGroup)}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tr(S.mergeGroups)}</CardTitle>
              <CardDescription>{tr(S.mergeHelp)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <LabeledNativeSelect
                label={tr(S.targetGroup)}
                value={mergeTargetGroupId}
                disabled={isBusy}
                onChange={setMergeTarget}
              >
                <option value="">{tr(S.chooseGroup)}</option>
                {editableGroups.map((group, index) => (
                  <option key={group.groupId} value={group.groupId}>
                    {groupLabel(snapshot.groups, group.groupId, index)}
                  </option>
                ))}
              </LabeledNativeSelect>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{tr(S.sourceGroups)}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {editableGroups.map((group, index) => (
                    <label
                      className="flex min-w-0 items-center gap-2 border border-border/70 px-3 py-2 text-sm"
                      key={group.groupId}
                    >
                      <input
                        type="checkbox"
                        checked={mergeSourceGroupIds.has(group.groupId)}
                        disabled={isBusy || group.groupId === mergeTargetGroupId}
                        onChange={() => toggleMergeSource(group.groupId)}
                      />
                      <span className="truncate">
                        {groupLabel(snapshot.groups, group.groupId, index)}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button
                type="button"
                disabled={isBusy || !mergeTargetGroupId || selectedMergeSourceGroupIds.length === 0}
                onClick={() =>
                  void runMutation(tr(S.mergeGroups), () =>
                    client.mergeGroups({
                      workflowId,
                      targetGroupId: mergeTargetGroupId,
                      sourceGroupIds: selectedMergeSourceGroupIds,
                    }),
                  )
                }
              >
                {tr(S.merge)}
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {busyAction ? (
        <Alert>
          <AlertTitle>{tr(S.saving)}</AlertTitle>
          <AlertDescription>{busyAction}</AlertDescription>
        </Alert>
      ) : null}
      {actionError ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>{tr(S.loadErrorTitle)}</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}
      {actionSuccess ? (
        <Alert role="status">
          <AlertDescription>{actionSuccess}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-4" aria-labelledby="seller-classifier-review-groups">
        <h2 id="seller-classifier-review-groups" className="font-display text-xl font-semibold">
          {tr(S.groups)}
        </h2>
        {snapshot.groups.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {tr(S.noGroups)}
            </CardContent>
          </Card>
        ) : (
          snapshot.groups.map((group, index) => (
            <ReviewGroupCard
              key={`${group.groupId}:${transientStateVersion}`}
              group={group}
              groupIndex={index}
              allGroups={snapshot.groups}
              categories={categories}
              isBusy={isBusy}
              isEditable={snapshot.stage === "review" && group.status === "proposed"}
              selectedImageIds={selectedImageIds}
              moveTargets={moveTargets}
              duplicateTargets={duplicateTargets}
              categoryDraft={categoryDrafts[group.groupId]}
              snapshotGeneration={snapshotGeneration}
              thumbnailDependencies={thumbnailDependencies}
              onToggleImageSelection={toggleImageSelection}
              onMoveTargetChange={(imageId, targetGroupId) =>
                setMoveTargets((current) => ({ ...current, [imageId]: targetGroupId }))
              }
              onDuplicateTargetChange={(imageId, targetImageId) =>
                setDuplicateTargets((current) => ({ ...current, [imageId]: targetImageId }))
              }
              onCategoryDraftChange={(categorySlug) =>
                setCategoryDrafts((current) => ({
                  ...current,
                  [group.groupId]: categorySlug,
                }))
              }
              runMutation={runMutation}
              client={client}
              workflowId={workflowId}
            />
          ))
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tr(S.approveAndCreate)}</CardTitle>
          <CardDescription>{draftActionHelp}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            disabled={isBusy || !allGroupsApproved}
            onClick={() => void approveAndCreateDrafts()}
          >
            {tr(S.approveAndCreate)}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewGroupCard({
  group,
  groupIndex,
  allGroups,
  categories,
  isBusy,
  isEditable,
  selectedImageIds,
  moveTargets,
  duplicateTargets,
  categoryDraft,
  snapshotGeneration,
  thumbnailDependencies,
  onToggleImageSelection,
  onMoveTargetChange,
  onDuplicateTargetChange,
  onCategoryDraftChange,
  runMutation,
  client,
  workflowId,
}: {
  group: SellerClassifierReviewGroup;
  groupIndex: number;
  allGroups: SellerClassifierReviewGroup[];
  categories: SellerClassifierCategory[];
  isBusy: boolean;
  isEditable: boolean;
  selectedImageIds: Set<string>;
  moveTargets: Record<string, string>;
  duplicateTargets: Record<string, string>;
  categoryDraft: string | undefined;
  snapshotGeneration: number;
  thumbnailDependencies: ThumbnailDependencies;
  onToggleImageSelection: (imageId: string) => void;
  onMoveTargetChange: (imageId: string, groupId: string) => void;
  onDuplicateTargetChange: (imageId: string, targetImageId: string) => void;
  onCategoryDraftChange: (categorySlug: string) => void;
  runMutation: (label: string, operation: MutationOperation) => Promise<void>;
  client: SellerClassifierReviewClient;
  workflowId: string;
}) {
  const label = `${tr(S.group)} ${groupIndex + 1}`;
  const selectedGroupImageIds = group.images
    .filter((image) => selectedImageIds.has(image.imageId))
    .map((image) => image.imageId);
  const editableTargets = allGroups.filter(
    (candidate) => candidate.groupId !== group.groupId && candidate.status === "proposed",
  );
  const approvedCategory = categories.find(
    (category) => category.slug === group.approvedCategorySlug && category.selectableLeaf,
  );
  const activeImages = group.images.filter((image) => !image.isRejected && !image.isDuplicate);
  const cover = activeImages.find((image) => image.imageId === group.coverImageId);
  const approvalMessage = !approvedCategory
    ? tr(S.approvalCategoryNeeded)
    : activeImages.length === 0
      ? tr(S.approvalImageNeeded)
      : !cover
        ? tr(S.approvalCoverNeeded)
        : tr(S.approvalReady);
  const canApprove = Boolean(approvedCategory && activeImages.length > 0 && cover);

  return (
    <Card data-review-group={group.groupId}>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight">{label}</h3>
            <CardDescription>
              {group.images.length} {group.images.length === 1 ? tr(S.image) : tr(S.images)}
            </CardDescription>
          </div>
          <Badge variant={group.status === "approved" ? "default" : "outline"}>
            {group.status === "approved" ? tr(S.approved) : tr(S.proposed)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Definition
            label={tr(S.suggestedCategory)}
            value={categoryDisplayName(group.suggestedCategorySlug, categories)}
          />
          <Definition
            label={tr(S.approvedCategory)}
            value={categoryDisplayName(group.approvedCategorySlug, categories)}
          />
          <Definition label={tr(S.confidence)} value={formatConfidence(group.confidence)} />
        </dl>

        {group.warnings.length > 0 ? (
          <Alert>
            <AlertTitle>{tr(S.warning)}</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-5">
                {group.warnings.map((warning) => (
                  <li key={warning}>{warning.replaceAll("_", " ")}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        {isEditable ? (
          <CategoryEditor
            group={group}
            categories={categories}
            draft={categoryDraft}
            disabled={isBusy}
            onDraftChange={onCategoryDraftChange}
            onSave={(categorySlug) =>
              runMutation(tr(S.saveCategory), () =>
                client.selectCategory({ workflowId, groupId: group.groupId, categorySlug }),
              )
            }
          />
        ) : null}

        {isEditable ? (
          <div className="flex flex-col gap-3 border-y border-border/70 py-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedGroupImageIds.length} {tr(S.selected)}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={
                isBusy ||
                selectedGroupImageIds.length === 0 ||
                selectedGroupImageIds.length >= group.images.length
              }
              onClick={() =>
                void runMutation(tr(S.split), () =>
                  client.splitGroup({
                    workflowId,
                    groupId: group.groupId,
                    imageIds: selectedGroupImageIds,
                  }),
                )
              }
            >
              {tr(S.split)}
            </Button>
          </div>
        ) : null}

        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {group.images.map((image) => (
            <ReviewImageCard
              key={image.imageId}
              image={image}
              group={group}
              allGroups={allGroups}
              editableTargets={editableTargets}
              isBusy={isBusy}
              isEditable={isEditable}
              selected={selectedImageIds.has(image.imageId)}
              moveTarget={moveTargets[image.imageId] ?? ""}
              duplicateTarget={duplicateTargets[image.imageId] ?? ""}
              isCover={group.coverImageId === image.imageId}
              snapshotGeneration={snapshotGeneration}
              thumbnailDependencies={thumbnailDependencies}
              onToggleSelection={() => onToggleImageSelection(image.imageId)}
              onMoveTargetChange={(target) => onMoveTargetChange(image.imageId, target)}
              onDuplicateTargetChange={(target) => onDuplicateTargetChange(image.imageId, target)}
              runMutation={runMutation}
              client={client}
              workflowId={workflowId}
            />
          ))}
        </ul>

        {isEditable ? (
          <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-muted-foreground">{approvalMessage}</span>
            <Button
              type="button"
              disabled={isBusy || !canApprove}
              onClick={() =>
                void runMutation(tr(S.approveGroup), () =>
                  client.approveGroup({ workflowId, groupId: group.groupId }),
                )
              }
            >
              {tr(S.approveGroup)}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CategoryEditor({
  group,
  categories,
  draft,
  disabled,
  onDraftChange,
  onSave,
}: {
  group: SellerClassifierReviewGroup;
  categories: SellerClassifierCategory[];
  draft: string | undefined;
  disabled: boolean;
  onDraftChange: (slug: string) => void;
  onSave: (slug: string | null) => Promise<void>;
}) {
  const saved = group.approvedCategorySlug ?? "";
  const selected = draft ?? saved;
  const selectedCategory = categories.find((category) => category.slug === selected);
  const currentMissing = saved !== "" && !categories.some((category) => category.slug === saved);
  const canSave =
    selected !== saved && selected !== "" && selectedCategory?.selectableLeaf === true;

  return (
    <div className="space-y-3 border border-border/70 p-4">
      <LabeledNativeSelect
        label={tr(S.approvedCategory)}
        value={selected}
        disabled={disabled}
        onChange={onDraftChange}
      >
        <option value="">{tr(S.chooseCategory)}</option>
        {currentMissing ? (
          <option value={saved} disabled>
            {tr(S.inactiveCategory)}: {saved}
          </option>
        ) : null}
        {categories.map((category) => (
          <option key={category.slug} value={category.slug} disabled={!category.selectableLeaf}>
            {`${"— ".repeat(categoryDepth(category, categories))}${category.name}`}
          </option>
        ))}
      </LabeledNativeSelect>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || !canSave}
          onClick={() => void onSave(selected)}
        >
          {tr(S.saveCategory)}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || saved === ""}
          onClick={() => void onSave(null)}
        >
          {tr(S.clearCategory)}
        </Button>
      </div>
    </div>
  );
}

function ReviewImageCard({
  image,
  group,
  allGroups,
  editableTargets,
  isBusy,
  isEditable,
  selected,
  moveTarget,
  duplicateTarget,
  isCover,
  snapshotGeneration,
  thumbnailDependencies,
  onToggleSelection,
  onMoveTargetChange,
  onDuplicateTargetChange,
  runMutation,
  client,
  workflowId,
}: {
  image: SellerClassifierReviewImage;
  group: SellerClassifierReviewGroup;
  allGroups: SellerClassifierReviewGroup[];
  editableTargets: SellerClassifierReviewGroup[];
  isBusy: boolean;
  isEditable: boolean;
  selected: boolean;
  moveTarget: string;
  duplicateTarget: string;
  isCover: boolean;
  snapshotGeneration: number;
  thumbnailDependencies: ThumbnailDependencies;
  onToggleSelection: () => void;
  onMoveTargetChange: (groupId: string) => void;
  onDuplicateTargetChange: (imageId: string) => void;
  runMutation: (label: string, operation: MutationOperation) => Promise<void>;
  client: SellerClassifierReviewClient;
  workflowId: string;
}) {
  const retainedTargets = group.images.filter(
    (candidate) =>
      candidate.imageId !== image.imageId && !candidate.isDuplicate && !candidate.isRejected,
  );

  return (
    <li
      className={`min-w-0 space-y-4 border p-4 ${
        image.isRejected ? "border-destructive/40 bg-destructive/5" : "border-border/70"
      }`}
    >
      {isEditable ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected}
            disabled={isBusy}
            aria-label={`${tr(S.imageSelected)}: ${image.originalFilename}`}
            onChange={onToggleSelection}
          />
          <span>{tr(S.imageSelected)}</span>
        </label>
      ) : null}

      <ProtectedThumbnail
        thumbnailUrl={image.thumbnailUrl}
        alt={image.originalFilename}
        generation={snapshotGeneration}
        dependencies={thumbnailDependencies}
      />

      <div className="min-w-0 space-y-2">
        <p className="truncate text-sm font-medium" title={image.originalFilename}>
          {image.originalFilename}
        </p>
        <div className="flex flex-wrap gap-2">
          {isCover ? <Badge>{tr(S.cover)}</Badge> : null}
          {image.isRejected ? <Badge variant="destructive">{tr(S.rejected)}</Badge> : null}
          <Badge variant="outline">{image.isDuplicate ? tr(S.duplicate) : tr(S.member)}</Badge>
        </div>
        <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <Definition label={tr(S.source)} value={image.membershipSource.replaceAll("_", " ")} />
          <Definition
            label={tr(S.confidence)}
            value={formatConfidence(image.membershipConfidence)}
          />
        </dl>
      </div>

      {isEditable ? (
        <div className="space-y-4">
          {!image.isRejected && !image.isDuplicate && !isCover ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`${tr(S.setCover)}: ${image.originalFilename}`}
              disabled={isBusy}
              onClick={() =>
                void runMutation(tr(S.setCover), () =>
                  client.selectCover({
                    workflowId,
                    groupId: group.groupId,
                    imageId: image.imageId,
                  }),
                )
              }
            >
              {tr(S.setCover)}
            </Button>
          ) : null}

          {editableTargets.length > 0 ? (
            <div className="grid gap-2">
              <LabeledNativeSelect
                label={tr(S.moveTo)}
                accessibleLabel={`${tr(S.moveTo)}: ${image.originalFilename}`}
                value={moveTarget}
                disabled={isBusy}
                onChange={onMoveTargetChange}
              >
                <option value="">{tr(S.chooseGroup)}</option>
                {editableTargets.map((target) => (
                  <option key={target.groupId} value={target.groupId}>
                    {groupLabel(allGroups, target.groupId)}
                  </option>
                ))}
              </LabeledNativeSelect>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={`${tr(S.move)}: ${image.originalFilename}`}
                disabled={isBusy || !moveTarget}
                onClick={() =>
                  void runMutation(tr(S.move), () =>
                    client.moveImage({
                      workflowId,
                      targetGroupId: moveTarget,
                      imageId: image.imageId,
                    }),
                  )
                }
              >
                {tr(S.move)}
              </Button>
            </div>
          ) : null}

          {image.isDuplicate ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`${tr(S.clearDuplicate)}: ${image.originalFilename}`}
              disabled={isBusy}
              onClick={() =>
                void runMutation(tr(S.clearDuplicate), () =>
                  client.setDuplicate({
                    workflowId,
                    groupId: group.groupId,
                    imageId: image.imageId,
                    duplicateOfImageId: null,
                  }),
                )
              }
            >
              {tr(S.clearDuplicate)}
            </Button>
          ) : !image.isRejected ? (
            <div className="grid gap-2">
              <LabeledNativeSelect
                label={tr(S.duplicateOf)}
                accessibleLabel={`${tr(S.duplicateOf)}: ${image.originalFilename}`}
                value={duplicateTarget}
                disabled={isBusy || retainedTargets.length === 0}
                onChange={onDuplicateTargetChange}
              >
                <option value="">{tr(S.chooseImage)}</option>
                {retainedTargets.map((candidate) => (
                  <option key={candidate.imageId} value={candidate.imageId}>
                    {candidate.originalFilename}
                  </option>
                ))}
              </LabeledNativeSelect>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={`${tr(S.markDuplicate)}: ${image.originalFilename}`}
                disabled={isBusy || !duplicateTarget}
                onClick={() =>
                  void runMutation(tr(S.markDuplicate), () =>
                    client.setDuplicate({
                      workflowId,
                      groupId: group.groupId,
                      imageId: image.imageId,
                      duplicateOfImageId: duplicateTarget,
                    }),
                  )
                }
              >
                {tr(S.markDuplicate)}
              </Button>
            </div>
          ) : null}

          {image.isRejected ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`${tr(S.restore)}: ${image.originalFilename}`}
              disabled={isBusy}
              onClick={() =>
                void runMutation(tr(S.restore), () =>
                  client.restoreImage({
                    workflowId,
                    groupId: group.groupId,
                    imageId: image.imageId,
                  }),
                )
              }
            >
              {tr(S.restore)}
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`${tr(S.reject)}: ${image.originalFilename}`}
                  disabled={isBusy}
                >
                  {tr(S.reject)}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{tr(S.rejectTitle)}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {image.originalFilename}. {tr(S.rejectDescription)}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tr(S.cancel)}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      void runMutation(tr(S.reject), () =>
                        client.rejectImage({
                          workflowId,
                          groupId: group.groupId,
                          imageId: image.imageId,
                        }),
                      )
                    }
                  >
                    {tr(S.reject)}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      ) : null}
    </li>
  );
}

function ProtectedThumbnail({
  thumbnailUrl,
  alt,
  generation,
  dependencies,
}: {
  thumbnailUrl: string;
  alt: string;
  generation: number;
  dependencies: ThumbnailDependencies;
}) {
  const [state, setState] = useState<"loading" | "available" | "unavailable">("loading");
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const sourceRef = useRef<string | null>(null);
  const attemptedGenerationRef = useRef<number | null>(null);

  useEffect(() => {
    if (sourceRef.current !== thumbnailUrl) {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      sourceRef.current = thumbnailUrl;
      attemptedGenerationRef.current = null;
      setObjectUrl(null);
      setState("loading");
    }

    if (objectUrlRef.current || attemptedGenerationRef.current === generation) return;
    attemptedGenerationRef.current = generation;
    const controller = new AbortController();
    let current = true;

    async function load() {
      try {
        const token = await dependencies.getAccessToken();
        if (!token) throw new Error("authentication_required");
        const response = await dependencies.fetch(thumbnailUrl, {
          headers: {
            Accept: "image/jpeg",
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });
        const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
        if (!response.ok || !contentType.startsWith("image/jpeg")) {
          throw new Error("thumbnail_unavailable");
        }
        const blob = await response.blob();
        if (blob.size === 0) throw new Error("thumbnail_unavailable");
        const nextObjectUrl = URL.createObjectURL(blob);
        if (!current) {
          URL.revokeObjectURL(nextObjectUrl);
          return;
        }
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = nextObjectUrl;
        setObjectUrl(nextObjectUrl);
        setState("available");
      } catch (error) {
        if (!current || controller.signal.aborted) return;
        setState("unavailable");
      }
    }

    void load();
    return () => {
      current = false;
      controller.abort();
      if (!objectUrlRef.current && attemptedGenerationRef.current === generation) {
        attemptedGenerationRef.current = null;
      }
    };
  }, [dependencies, generation, thumbnailUrl]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  if (state !== "available" || !objectUrl) {
    return (
      <div className="flex aspect-square w-full items-center justify-center bg-muted p-4 text-center text-sm text-muted-foreground">
        {state === "loading" ? tr(S.thumbnailLoading) : tr(S.thumbnailUnavailable)}
      </div>
    );
  }

  return <img src={objectUrl} alt={alt} className="aspect-square w-full bg-muted object-cover" />;
}

function LabeledNativeSelect({
  label,
  accessibleLabel,
  value,
  disabled,
  onChange,
  children,
}: {
  label: string;
  accessibleLabel?: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        className="h-10 min-w-0 w-full border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={accessibleLabel}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function Definition({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-foreground">{value}</dd>
    </div>
  );
}

function toggleSetValue(current: Set<string>, value: string): Set<string> {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function categoryDisplayName(slug: string | null, categories: SellerClassifierCategory[]): string {
  if (!slug) return "—";
  const category = categories.find((candidate) => candidate.slug === slug);
  return category ? `${category.name} (${category.slug})` : slug;
}

function categoryDepth(
  category: SellerClassifierCategory,
  categories: SellerClassifierCategory[],
): number {
  const bySlug = new Map(categories.map((candidate) => [candidate.slug, candidate]));
  let depth = 0;
  let parentSlug = category.parentSlug;
  while (parentSlug && depth < categories.length) {
    depth += 1;
    parentSlug = bySlug.get(parentSlug)?.parentSlug ?? null;
  }
  return depth;
}

function formatConfidence(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function groupLabel(
  groups: SellerClassifierReviewGroup[],
  groupId: string,
  knownIndex?: number,
): string {
  const index = knownIndex ?? groups.findIndex((group) => group.groupId === groupId);
  return `${tr(S.group)} ${index >= 0 ? index + 1 : "—"}`;
}

function reviewErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function reviewPageError(error: unknown): PageError {
  switch (reviewErrorCode(error)) {
    case "seller_classifier_batch_not_found":
    case "seller_not_found":
      return { message: tr(S.notFound), retryable: false };
    case "seller_classifier_configuration_invalid":
      return { message: tr(S.setupError), retryable: false };
    default:
      return { message: tr(S.unavailable), retryable: true };
  }
}

function reviewActionError(error: unknown): string {
  switch (reviewErrorCode(error)) {
    case "seller_classifier_review_invalid":
      return error instanceof Error && error.message.trim() ? error.message : tr(S.actionInvalid);
    case "seller_classifier_configuration_invalid":
      return tr(S.setupError);
    case "seller_classifier_unavailable":
      return tr(S.unavailable);
    default:
      return tr(S.unavailable);
  }
}

function reviewImportActionError(error: unknown): string {
  switch (reviewErrorCode(error)) {
    case "seller_classifier_approval_invalid":
      return tr(S.approvalInvalid);
    case "seller_classifier_import_ownership_conflict":
      return tr(S.importOwnershipConflict);
    case "seller_classifier_configuration_invalid":
      return tr(S.setupError);
    case "seller_classifier_import_unavailable":
    case "seller_classifier_unavailable":
      return tr(S.importUnavailable);
    default:
      return tr(S.importUnavailable);
  }
}
