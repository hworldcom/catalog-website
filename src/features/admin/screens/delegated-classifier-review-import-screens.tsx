import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  SellerClassifierImportScreenView,
  type SellerClassifierImportClient,
} from "@/features/seller-classifier/screens/seller-classifier-import-screen";
import {
  SellerClassifierReviewScreenView,
  type SellerClassifierReviewClient,
} from "@/features/seller-classifier/screens/seller-classifier-review-screen";
import { SELLER_CLASSIFIER_GROUPS_NOT_APPROVED_NOTICE } from "@/features/seller-classifier/seller-classifier-import.navigation";
import { t, tr, useLang } from "@/lib/i18n";

import { ClassifierImportShell } from "../components/classifier-import-shell";
import { DelegatedClassifierSellerCard } from "../components/delegated-classifier-seller-card";
import { DelegatedActionRequestManager } from "../delegated-action-request";
import {
  approveDelegatedClassifierBatchAndCreateDrafts,
  approveDelegatedClassifierGroup,
  createDelegatedClassifierGroup,
  getDelegatedClassifierDraftImport,
  getDelegatedClassifierReview,
  listDelegatedClassifierCategories,
  mergeDelegatedClassifierGroups,
  moveDelegatedClassifierImage,
  rejectDelegatedClassifierImage,
  restoreDelegatedClassifierImage,
  retryDelegatedClassifierDraftImport,
  selectDelegatedClassifierGroupCategory,
  selectDelegatedClassifierGroupCover,
  setDelegatedClassifierImageDuplicate,
  splitDelegatedClassifierGroup,
} from "../delegated-classifier-review-import.functions";
import type {
  DelegatedClassifierCategoriesContext,
  DelegatedClassifierDraftImportContext,
  DelegatedClassifierReviewContext,
} from "../delegated-classifier-review-import.types";
import type { DelegatedUploadSeller } from "../delegated-classifier-upload.types";

const S = {
  back: t(
    "Back to delegated workflow",
    "Wróć do delegowanego procesu",
    "Zurück zum delegierten Ablauf",
    "Quay lại quy trình được ủy quyền",
  ),
  reviewTitle: t(
    "Review product groups for seller",
    "Sprawdź grupy produktów dla sprzedawcy",
    "Produktgruppen für Verkäufer prüfen",
    "Xem xét nhóm sản phẩm cho nhà bán",
  ),
  reviewDescription: t(
    "Correct the seller-owned groups, choose categories, and approve each valid group.",
    "Popraw grupy należące do sprzedawcy, wybierz kategorie i zatwierdź każdą prawidłową grupę.",
    "Korrigieren Sie die Verkäufergruppen, wählen Sie Kategorien und genehmigen Sie jede gültige Gruppe.",
    "Chỉnh sửa các nhóm thuộc nhà bán, chọn danh mục và phê duyệt từng nhóm hợp lệ.",
  ),
  approveAndCreate: t(
    "Approve and create drafts for seller",
    "Zatwierdź i utwórz szkice dla sprzedawcy",
    "Genehmigen und Entwürfe für Verkäufer erstellen",
    "Phê duyệt và tạo bản nháp cho nhà bán",
  ),
  creatingDrafts: t(
    "Approving and creating seller-owned drafts…",
    "Zatwierdzanie i tworzenie szkiców należących do sprzedawcy…",
    "Verkäufereigene Entwürfe werden genehmigt und erstellt…",
    "Đang phê duyệt và tạo bản nháp thuộc nhà bán…",
  ),
  importTitle: t(
    "Creating product drafts for seller",
    "Tworzenie szkiców produktów dla sprzedawcy",
    "Produktentwürfe für Verkäufer werden erstellt",
    "Đang tạo bản nháp sản phẩm cho nhà bán",
  ),
  importDescription: t(
    "Approved groups are being imported for the destination seller. This page only reads progress unless an explicit action is available.",
    "Zatwierdzone grupy są importowane dla sprzedawcy docelowego. Ta strona tylko odczytuje postęp, chyba że dostępna jest wyraźna czynność.",
    "Genehmigte Gruppen werden für den Zielverkäufer importiert. Diese Seite liest nur den Fortschritt, sofern keine ausdrückliche Aktion verfügbar ist.",
    "Các nhóm đã phê duyệt đang được nhập cho nhà bán đích. Trang này chỉ đọc tiến trình trừ khi có thao tác rõ ràng.",
  ),
  continueImport: t(
    "Continue seller draft import",
    "Kontynuuj import szkiców sprzedawcy",
    "Import der Verkäuferentwürfe fortsetzen",
    "Tiếp tục nhập bản nháp của nhà bán",
  ),
  retryImport: t(
    "Retry seller draft import",
    "Ponów import szkiców sprzedawcy",
    "Import der Verkäuferentwürfe wiederholen",
    "Thử nhập lại bản nháp của nhà bán",
  ),
};

export function DelegatedClassifierReviewScreen({
  workflowId,
  notice,
}: {
  workflowId: string;
  notice?: "groups-not-approved";
}) {
  const lang = useLang();
  const navigate = useNavigate();
  const getReview = useServerFn(getDelegatedClassifierReview);
  const listCategories = useServerFn(listDelegatedClassifierCategories);
  const createGroup = useServerFn(createDelegatedClassifierGroup);
  const mergeGroups = useServerFn(mergeDelegatedClassifierGroups);
  const splitGroup = useServerFn(splitDelegatedClassifierGroup);
  const moveImage = useServerFn(moveDelegatedClassifierImage);
  const setDuplicate = useServerFn(setDelegatedClassifierImageDuplicate);
  const selectCover = useServerFn(selectDelegatedClassifierGroupCover);
  const selectCategory = useServerFn(selectDelegatedClassifierGroupCategory);
  const rejectImage = useServerFn(rejectDelegatedClassifierImage);
  const restoreImage = useServerFn(restoreDelegatedClassifierImage);
  const approveGroup = useServerFn(approveDelegatedClassifierGroup);
  const approveAndCreate = useServerFn(approveDelegatedClassifierBatchAndCreateDrafts);
  const requestManager = useMemo(() => new DelegatedActionRequestManager(), []);
  const { seller, captureCategories, captureImport, captureReview } = useDelegatedSellerContext();

  const client = useMemo<SellerClassifierReviewClient>(
    () => ({
      getReview: async (id) => captureReview(await getReview({ data: { workflowId: id } })),
      listCategories: async () => captureCategories(await listCategories({ data: { workflowId } })),
      createGroup: async (input) => captureReview(await createGroup({ data: input })),
      mergeGroups: async (input) => captureReview(await mergeGroups({ data: input })),
      splitGroup: async (input) => captureReview(await splitGroup({ data: input })),
      moveImage: async (input) => captureReview(await moveImage({ data: input })),
      setDuplicate: async (input) => captureReview(await setDuplicate({ data: input })),
      selectCover: async (input) => captureReview(await selectCover({ data: input })),
      selectCategory: async (input) => captureReview(await selectCategory({ data: input })),
      rejectImage: async (input) => captureReview(await rejectImage({ data: input })),
      restoreImage: async (input) => captureReview(await restoreImage({ data: input })),
      approveGroup: async (input, options) =>
        captureReview(
          await requestManager.run({
            workflowId: input.workflowId,
            actionType: "approve_group",
            target: input.groupId,
            newRequest: options?.newRequest,
            execute: (requestId) =>
              approveGroup({
                data: {
                  ...input,
                  requestId,
                },
              }),
          }),
        ),
      approveAndCreate: async (input, options) =>
        captureImport(
          await requestManager.run({
            workflowId: input.workflowId,
            actionType: "approve_and_create_drafts",
            target: "batch",
            newRequest: options?.newRequest,
            execute: (requestId) =>
              approveAndCreate({
                data: {
                  ...input,
                  requestId,
                },
              }),
          }),
        ),
    }),
    [
      approveAndCreate,
      approveGroup,
      captureCategories,
      captureImport,
      captureReview,
      createGroup,
      getReview,
      listCategories,
      mergeGroups,
      moveImage,
      rejectImage,
      requestManager,
      restoreImage,
      selectCategory,
      selectCover,
      setDuplicate,
      splitGroup,
      workflowId,
    ],
  );

  return (
    <DelegatedContinuationShell workflowId={workflowId} lang={lang} seller={seller}>
      <SellerClassifierReviewScreenView
        workflowId={workflowId}
        client={client}
        initialNotice={notice}
        labels={{
          title: tr(S.reviewTitle),
          description: tr(S.reviewDescription),
          approveAndCreate: tr(S.approveAndCreate),
          creatingDrafts: tr(S.creatingDrafts),
        }}
        onImportAccepted={() =>
          void navigate({
            to: "/admin/classifier-uploads/$workflowId/import",
            params: { workflowId },
            search: { lang },
          })
        }
      />
    </DelegatedContinuationShell>
  );
}

export function DelegatedClassifierImportScreen({ workflowId }: { workflowId: string }) {
  const lang = useLang();
  const navigate = useNavigate();
  const getImport = useServerFn(getDelegatedClassifierDraftImport);
  const continueImport = useServerFn(approveDelegatedClassifierBatchAndCreateDrafts);
  const retryImport = useServerFn(retryDelegatedClassifierDraftImport);
  const requestManager = useMemo(() => new DelegatedActionRequestManager(), []);
  const { seller, captureImport } = useDelegatedSellerContext();

  const client = useMemo<SellerClassifierImportClient>(
    () => ({
      getImport: async (id) => captureImport(await getImport({ data: { workflowId: id } })),
      continueImport: async (id, options) =>
        captureImport(
          await requestManager.run({
            workflowId: id,
            actionType: "approve_and_create_drafts",
            target: "batch",
            newRequest: options?.newRequest,
            execute: (requestId) =>
              continueImport({
                data: {
                  workflowId: id,
                  requestId,
                },
              }),
          }),
        ),
      retryImport: async (id, options) =>
        captureImport(
          await requestManager.run({
            workflowId: id,
            actionType: "retry_draft_import",
            target: "import",
            newRequest: options?.newRequest,
            execute: (requestId) =>
              retryImport({
                data: {
                  workflowId: id,
                  requestId,
                },
              }),
          }),
        ),
    }),
    [captureImport, continueImport, getImport, requestManager, retryImport],
  );

  return (
    <DelegatedContinuationShell workflowId={workflowId} lang={lang} seller={seller}>
      <SellerClassifierImportScreenView
        workflowId={workflowId}
        lang={lang}
        client={client}
        productDraftHref={(productDraftId, currentLang) =>
          `/admin/classifier-uploads/${encodeURIComponent(workflowId)}/products/` +
          `${encodeURIComponent(productDraftId)}?lang=${encodeURIComponent(currentLang)}`
        }
        showProductDraftId
        labels={{
          title: tr(S.importTitle),
          description: tr(S.importDescription),
          continueImport: tr(S.continueImport),
          retryImport: tr(S.retryImport),
        }}
        onReviewRequired={() =>
          void navigate({
            to: "/admin/classifier-uploads/$workflowId/review",
            params: { workflowId },
            search: {
              lang,
              notice: SELLER_CLASSIFIER_GROUPS_NOT_APPROVED_NOTICE,
            },
          })
        }
      />
    </DelegatedContinuationShell>
  );
}

function DelegatedContinuationShell({
  workflowId,
  lang,
  seller,
  children,
}: {
  workflowId: string;
  lang: "EN" | "PL" | "DE" | "VI";
  seller: DelegatedUploadSeller | null;
  children: React.ReactNode;
}) {
  return (
    <ClassifierImportShell>
      <div className="space-y-6">
        <Button asChild variant="outline">
          <Link
            to="/admin/classifier-uploads/$workflowId"
            params={{ workflowId }}
            search={{ lang }}
          >
            {tr(S.back)}
          </Link>
        </Button>
        {seller ? <DelegatedClassifierSellerCard seller={seller} /> : null}
        {children}
      </div>
    </ClassifierImportShell>
  );
}

function useDelegatedSellerContext() {
  const [seller, setSeller] = useState<DelegatedUploadSeller | null>(null);
  const sellerId = useRef<string | null>(null);

  const captureSeller = useCallback((next: DelegatedUploadSeller) => {
    if (sellerId.current && sellerId.current !== next.sellerId) {
      throw new Error("Delegated workflow seller context changed unexpectedly.");
    }
    sellerId.current = next.sellerId;
    setSeller(next);
  }, []);

  const captureReview = useCallback(
    (context: DelegatedClassifierReviewContext) => {
      captureSeller(context.seller);
      return context.review;
    },
    [captureSeller],
  );
  const captureCategories = useCallback(
    (context: DelegatedClassifierCategoriesContext) => {
      captureSeller(context.seller);
      return context.categories;
    },
    [captureSeller],
  );
  const captureImport = useCallback(
    (context: DelegatedClassifierDraftImportContext) => {
      captureSeller(context.seller);
      return context.draftImport;
    },
    [captureSeller],
  );

  return { seller, captureReview, captureCategories, captureImport };
}
