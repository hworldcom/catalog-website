import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { t, tr } from "@/lib/i18n";
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

const S = {
  seller: t("Destination seller", "Sprzedawca docelowy", "Zielverkäufer", "Nhà bán đích"),
  owner: t(
    "This seller owns the workflow and all resulting product drafts.",
    "Ten sprzedawca jest właścicielem procesu i wszystkich wynikowych szkiców produktów.",
    "Dieser Verkäufer besitzt den Ablauf und alle daraus entstehenden Produktentwürfe.",
    "Nhà bán này sở hữu quy trình và mọi bản nháp sản phẩm được tạo.",
  ),
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
  ready: t(
    "Ready for seller review",
    "Gotowe do weryfikacji przez sprzedawcę",
    "Bereit zur Verkäuferprüfung",
    "Sẵn sàng để nhà bán xem xét",
  ),
  readyDescription: t(
    "Upload and processing are complete. The seller can continue in their classifier history.",
    "Przesyłanie i przetwarzanie zostały zakończone. Sprzedawca może kontynuować w historii klasyfikatora.",
    "Upload und Verarbeitung sind abgeschlossen. Der Verkäufer kann im Klassifikatorverlauf fortfahren.",
    "Tải lên và xử lý đã hoàn tất. Nhà bán có thể tiếp tục trong lịch sử phân loại.",
  ),
  published: t(
    "Published storefront",
    "Opublikowany sklep",
    "Veröffentlichter Shop",
    "Gian hàng đã xuất bản",
  ),
  unpublished: t(
    "Unpublished storefront",
    "Nieopublikowany sklep",
    "Nicht veröffentlichter Shop",
    "Gian hàng chưa xuất bản",
  ),
};

export function DelegatedClassifierUploadWorkflowScreen({ workflowId }: { workflowId: string }) {
  const queryClient = useQueryClient();
  const getContext = useServerFn(getDelegatedClassifierBatch);
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
  const handedOff = ["review", "approved", "importing", "drafts_ready"].includes(workflow.stage);

  return (
    <ClassifierImportShell>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{tr(S.seller)}</CardTitle>
                <CardDescription>{tr(S.owner)}</CardDescription>
              </div>
              <Badge variant={context.seller.published ? "secondary" : "outline"}>
                {context.seller.published ? tr(S.published) : tr(S.unpublished)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="font-medium">{context.seller.name}</p>
            <p className="text-sm text-muted-foreground">/{context.seller.slug}</p>
            <p className="break-all text-xs text-muted-foreground">{context.seller.sellerId}</p>
          </CardContent>
        </Card>

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
        (workflow.stage === "processing" || workflow.stage === "failed") ? (
          <ClassifierProcessingScreenView
            workflowId={workflowId}
            client={processingClient}
            onReadyForReview={refreshWorkflowContext}
            reviewHref={null}
            queryScope="administrator"
          />
        ) : null}

        {handedOff ? (
          <Alert>
            <AlertTitle>{tr(S.ready)}</AlertTitle>
            <AlertDescription>{tr(S.readyDescription)}</AlertDescription>
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
