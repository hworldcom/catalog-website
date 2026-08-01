import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { t, tr, useLang } from "@/lib/i18n";
import {
  ClassifierProcessingScreenView,
  type ClassifierProcessingClient,
} from "@/features/seller-classifier/screens/seller-classifier-processing-screen";
import {
  ClassifierUploadScreenView,
  type ClassifierUploadClient,
} from "@/features/seller-classifier/screens/seller-classifier-upload-screen";

import {
  finalizeDelegatedClassifierUploads,
  getDelegatedClassifierBatch,
  getDelegatedClassifierProcessing,
  getDelegatedClassifierUploads,
  registerDelegatedClassifierUploads,
  retryDelegatedClassifierBatchProvisioning,
  retryDelegatedClassifierUploads,
  startDelegatedClassifierProcessing,
} from "../delegated-classifier-upload.functions";
import { ClassifierImportShell } from "../components/classifier-import-shell";
import { DelegatedClassifierSellerCard } from "../components/delegated-classifier-seller-card";
import { getDelegatedClassifierDraftImport } from "../delegated-classifier-review-import.functions";

const S = {
  loading: t(
    "Loading delegated workflow…",
    "Ładowanie procesu…",
    "Delegierter Ablauf wird geladen…",
    "Đang tải quy trình được ủy quyền…",
  ),
  unavailable: t(
    "Delegated workflow could not be loaded",
    "Nie można załadować procesu",
    "Delegierter Ablauf konnte nicht geladen werden",
    "Không thể tải quy trình được ủy quyền",
  ),
  retryProvisioning: t(
    "Retry provisioning",
    "Ponów przygotowanie",
    "Bereitstellung erneut versuchen",
    "Thử chuẩn bị lại",
  ),
  retrying: t("Retrying…", "Ponawianie…", "Wird erneut versucht…", "Đang thử lại…"),
  provisioning: t(
    "Classifier upload is being prepared.",
    "Przesyłanie jest przygotowywane.",
    "Der Klassifikator-Upload wird vorbereitet.",
    "Lượt tải lên đang được chuẩn bị.",
  ),
  provisioningFailed: t(
    "Classifier upload preparation failed",
    "Przygotowanie przesyłania nie powiodło się",
    "Die Vorbereitung des Klassifikator-Uploads ist fehlgeschlagen",
    "Chuẩn bị lượt tải lên bằng bộ phân loại không thành công",
  ),
  reviewReady: t(
    "Ready for administrator review",
    "Gotowe do weryfikacji przez administratora",
    "Bereit zur Administratorprüfung",
    "Sẵn sàng để quản trị viên xem xét",
  ),
  reviewReadyDescription: t(
    "Upload and processing are complete. Continue review for the destination seller.",
    "Przesyłanie i przetwarzanie zostały zakończone. Kontynuuj weryfikację dla sprzedawcy docelowego.",
    "Upload und Verarbeitung sind abgeschlossen. Setzen Sie die Prüfung für den Zielverkäufer fort.",
    "Tải lên và xử lý đã hoàn tất. Tiếp tục xem xét cho nhà bán đích.",
  ),
  continueReview: t(
    "Continue review for seller",
    "Kontynuuj weryfikację dla sprzedawcy",
    "Prüfung für Verkäufer fortsetzen",
    "Tiếp tục xem xét cho nhà bán",
  ),
  importReady: t(
    "Seller draft import",
    "Import szkiców sprzedawcy",
    "Import der Verkäuferentwürfe",
    "Nhập bản nháp của nhà bán",
  ),
  importReadyDescription: t(
    "Review is approved. Open the durable ProductDraft import progress.",
    "Weryfikacja została zatwierdzona. Otwórz trwały postęp importu szkiców produktów.",
    "Die Prüfung ist genehmigt. Öffnen Sie den dauerhaften Importfortschritt der Produktentwürfe.",
    "Quá trình xem xét đã được phê duyệt. Mở tiến trình nhập bản nháp sản phẩm lâu dài.",
  ),
  openImport: t(
    "Open seller draft import",
    "Otwórz import szkiców sprzedawcy",
    "Import der Verkäuferentwürfe öffnen",
    "Mở nhập bản nháp của nhà bán",
  ),
  resolvingFailure: t(
    "Resolving the durable recovery state…",
    "Ustalanie trwałego stanu odzyskiwania…",
    "Dauerhafter Wiederherstellungsstatus wird ermittelt…",
    "Đang xác định trạng thái khôi phục lâu dài…",
  ),
  unknownFailure: t(
    "This workflow stopped in an unrecognized state. Contact support with the workflow identifier.",
    "Ten proces zatrzymał się w nierozpoznanym stanie. Skontaktuj się z pomocą techniczną, podając identyfikator procesu.",
    "Dieser Ablauf wurde in einem unbekannten Zustand angehalten. Wenden Sie sich mit der Ablauf-ID an den Support.",
    "Quy trình này đã dừng ở trạng thái không xác định. Hãy liên hệ hỗ trợ kèm mã quy trình.",
  ),
};

export function DelegatedClassifierUploadWorkflowScreen({ workflowId }: { workflowId: string }) {
  const lang = useLang();
  const queryClient = useQueryClient();
  const getContext = useServerFn(getDelegatedClassifierBatch);
  const getDraftImport = useServerFn(getDelegatedClassifierDraftImport);
  const retryProvisioning = useServerFn(retryDelegatedClassifierBatchProvisioning);
  const getUploads = useServerFn(getDelegatedClassifierUploads);
  const registerUploads = useServerFn(registerDelegatedClassifierUploads);
  const retryUploads = useServerFn(retryDelegatedClassifierUploads);
  const finalizeUploads = useServerFn(finalizeDelegatedClassifierUploads);
  const startProcessing = useServerFn(startDelegatedClassifierProcessing);
  const getProcessing = useServerFn(getDelegatedClassifierProcessing);
  const [retrying, setRetrying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const contextKey = ["administrator", "delegated-classifier-workflow", workflowId] as const;
  const contextQuery = useQuery({
    queryKey: contextKey,
    queryFn: () => getContext({ data: { workflowId } }),
    refetchInterval: (query) =>
      query.state.data?.workflow.provisioningStatus === "provisioning" ? 2_000 : false,
  });
  const failedImportQuery = useQuery({
    queryKey: ["administrator", "delegated-classifier-failed-import", workflowId],
    queryFn: () => getDraftImport({ data: { workflowId } }),
    enabled:
      contextQuery.data?.workflow.provisioningStatus === "ready" &&
      contextQuery.data.workflow.stage === "failed",
    retry: false,
  });
  const refetchWorkflowContext = contextQuery.refetch;
  const uploadClient = useMemo<ClassifierUploadClient>(
    () => ({
      getBatch: async (id) => (await getContext({ data: { workflowId: id } })).workflow,
      getUploads: (id) => getUploads({ data: { workflowId: id } }),
      registerUploads: (input) => registerUploads({ data: input }),
      retryUploads: (input) => retryUploads({ data: input }),
      finalizeUploads: (id) => finalizeUploads({ data: { workflowId: id } }),
      startProcessing: (id) => startProcessing({ data: { workflowId: id } }),
    }),
    [finalizeUploads, getContext, getUploads, registerUploads, retryUploads, startProcessing],
  );
  const processingClient = useMemo<ClassifierProcessingClient>(
    () => ({
      getProcessing: (id) => getProcessing({ data: { workflowId: id } }),
      startProcessing: (id) => startProcessing({ data: { workflowId: id } }),
    }),
    [getProcessing, startProcessing],
  );
  const refreshWorkflowContext = useCallback(() => {
    void refetchWorkflowContext();
  }, [refetchWorkflowContext]);

  async function retry() {
    setRetrying(true);
    setActionError(null);
    try {
      const next = await retryProvisioning({ data: { workflowId } });
      queryClient.setQueryData(contextKey, next);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setRetrying(false);
    }
  }

  if (contextQuery.isLoading) {
    return (
      <ClassifierImportShell>
        <p className="text-sm text-muted-foreground">{tr(S.loading)}</p>
      </ClassifierImportShell>
    );
  }
  if (contextQuery.isError || !contextQuery.data) {
    return (
      <ClassifierImportShell>
        <Alert variant="destructive">
          <AlertTitle>{tr(S.unavailable)}</AlertTitle>
          <AlertDescription>{errorMessage(contextQuery.error)}</AlertDescription>
        </Alert>
      </ClassifierImportShell>
    );
  }

  const context = contextQuery.data;
  const workflow = context.workflow;
  const failedImportStatus = failedImportQuery.data?.draftImport.importStatus ?? null;
  const failedImportErrorCode = errorCode(failedImportQuery.error);
  const failedWithoutImport =
    failedImportQuery.isSuccess ||
    (failedImportQuery.isError && failedImportErrorCode === "delegated_review_not_allowed");
  const processingFailure =
    workflow.stage === "failed" &&
    failedWithoutImport &&
    workflow.errorCode === "seller_classifier_processing_failed";
  const importHandoff =
    ["approved", "importing", "drafts_ready"].includes(workflow.stage) ||
    (workflow.stage === "failed" && failedImportStatus !== null);
  const resolvingFailure =
    workflow.stage === "failed" && (failedImportQuery.isPending || failedImportQuery.isFetching);
  const unknownFailure =
    workflow.stage === "failed" && !resolvingFailure && !processingFailure && !importHandoff;

  return (
    <ClassifierImportShell>
      <div className="space-y-6">
        <DelegatedClassifierSellerCard seller={context.seller} />

        {actionError ? (
          <Alert variant="destructive">
            <AlertTitle>{tr(S.unavailable)}</AlertTitle>
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        ) : null}

        {workflow.provisioningStatus === "provisioning" ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              {tr(S.provisioning)}
            </CardContent>
          </Card>
        ) : null}

        {workflow.provisioningStatus === "failed" ? (
          <Alert variant="destructive">
            <AlertTitle>{tr(S.provisioningFailed)}</AlertTitle>
            <AlertDescription className="space-y-3">
              {workflow.errorCode ? <p>{workflow.errorCode}</p> : null}
              {workflow.retryAllowed ? (
                <Button type="button" disabled={retrying} onClick={() => void retry()}>
                  {retrying ? tr(S.retrying) : tr(S.retryProvisioning)}
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {workflow.provisioningStatus === "ready" && workflow.stage === "upload" ? (
          <ClassifierUploadScreenView
            workflowId={workflowId}
            client={uploadClient}
            onOpenProcessing={() => void contextQuery.refetch()}
            reviewHref={null}
            queryScope="administrator"
          />
        ) : null}

        {workflow.provisioningStatus === "ready" &&
        (workflow.stage === "processing" || processingFailure) ? (
          <ClassifierProcessingScreenView
            workflowId={workflowId}
            client={processingClient}
            onReadyForReview={refreshWorkflowContext}
            reviewHref={null}
            queryScope="administrator"
          />
        ) : null}

        {resolvingFailure ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              {tr(S.resolvingFailure)}
            </CardContent>
          </Card>
        ) : null}

        {workflow.stage === "review" ? (
          <Alert>
            <AlertTitle>{tr(S.reviewReady)}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{tr(S.reviewReadyDescription)}</p>
              <Button asChild>
                <Link
                  to="/admin/classifier-uploads/$workflowId/review"
                  params={{ workflowId }}
                  search={{ lang }}
                >
                  {tr(S.continueReview)}
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {importHandoff ? (
          <Alert>
            <AlertTitle>{tr(S.importReady)}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{tr(S.importReadyDescription)}</p>
              <Button asChild>
                <Link
                  to="/admin/classifier-uploads/$workflowId/import"
                  params={{ workflowId }}
                  search={{ lang }}
                >
                  {tr(S.openImport)}
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {unknownFailure ? (
          <Alert variant="destructive">
            <AlertTitle>{tr(S.unavailable)}</AlertTitle>
            <AlertDescription>{tr(S.unknownFailure)}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </ClassifierImportShell>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Delegated classifier uploads are temporarily unavailable.";
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}
