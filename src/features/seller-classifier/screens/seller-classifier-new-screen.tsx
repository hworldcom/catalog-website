import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { t, tr } from "@/lib/i18n";

import {
  createMyClassifierBatch,
  getMyClassifierBatch,
  retryMyClassifierBatchProvisioning,
} from "../seller-classifier-batch.functions";
import type { SellerClassifierBatchSnapshot } from "../seller-classifier-batch.types";
import {
  loadSellerClassifierCreationSession,
  newSellerClassifierCreationSession,
  saveSellerClassifierCreationSession,
} from "../seller-classifier-creation-session";

const S = {
  title: t(
    "Classifier-assisted upload",
    "Przesyłanie ze wsparciem klasyfikatora",
    "Klassifikatorgestützter Upload",
    "Tải lên có hỗ trợ bộ phân loại",
  ),
  description: t(
    "Upload one or more product photos. The classifier will prepare product groups and category suggestions for your review.",
    "Prześlij co najmniej jedno zdjęcie produktu. Klasyfikator przygotuje grupy produktów i sugestie kategorii do weryfikacji.",
    "Laden Sie ein oder mehrere Produktfotos hoch. Der Klassifikator bereitet Produktgruppen und Kategorievorschläge zur Prüfung vor.",
    "Tải lên một hoặc nhiều ảnh sản phẩm. Bộ phân loại sẽ chuẩn bị nhóm sản phẩm và gợi ý danh mục để bạn xem xét.",
  ),
  start: t(
    "Start classifier upload",
    "Rozpocznij przesyłanie",
    "Klassifikator-Upload starten",
    "Bắt đầu tải lên",
  ),
  retry: t(
    "Retry provisioning",
    "Ponów przygotowanie",
    "Bereitstellung erneut versuchen",
    "Thử chuẩn bị lại",
  ),
  starting: t("Preparing…", "Przygotowywanie…", "Wird vorbereitet…", "Đang chuẩn bị…"),
  failed: t(
    "Classifier upload could not be prepared",
    "Nie udało się przygotować przesyłania",
    "Der Klassifikator-Upload konnte nicht vorbereitet werden",
    "Không thể chuẩn bị tải lên",
  ),
};

export function SellerClassifierNewScreen() {
  const navigate = useNavigate();
  const createBatch = useServerFn(createMyClassifierBatch);
  const getBatch = useServerFn(getMyClassifierBatch);
  const retryBatch = useServerFn(retryMyClassifierBatchProvisioning);
  const [workflow, setWorkflow] = useState<SellerClassifierBatchSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigateToUpload = useCallback(
    (workflowId: string) => {
      navigate({
        to: "/seller/classifier-batches/$workflowId/upload",
        params: { workflowId },
      });
    },
    [navigate],
  );

  useEffect(() => {
    const creation = loadSellerClassifierCreationSession();
    if (!creation?.workflowId) return;

    let cancelled = false;
    setBusy(true);
    getBatch({ data: { workflowId: creation.workflowId } })
      .then((snapshot) => {
        if (cancelled) return;
        setWorkflow(snapshot);
        if (snapshot.provisioningStatus === "ready") {
          navigateToUpload(snapshot.workflowId);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getBatch, navigateToUpload]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const creation =
        loadSellerClassifierCreationSession() ?? newSellerClassifierCreationSession();
      saveSellerClassifierCreationSession(creation);
      const snapshot = await createBatch({ data: { requestId: creation.requestId } });
      saveSellerClassifierCreationSession({
        requestId: creation.requestId,
        workflowId: snapshot.workflowId,
      });
      setWorkflow(snapshot);
      if (snapshot.provisioningStatus === "ready") navigateToUpload(snapshot.workflowId);
    } catch (startError) {
      setError(errorMessage(startError));
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (!workflow) return;
    setBusy(true);
    setError(null);
    try {
      const snapshot = await retryBatch({ data: { workflowId: workflow.workflowId } });
      setWorkflow(snapshot);
      if (snapshot.provisioningStatus === "ready") navigateToUpload(snapshot.workflowId);
    } catch (retryError) {
      setError(errorMessage(retryError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr(S.title)}</CardTitle>
        <CardDescription>{tr(S.description)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{tr(S.failed)}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {workflow?.provisioningStatus === "failed" && workflow.retryAllowed ? (
          <Button type="button" disabled={busy} onClick={retry}>
            {busy ? tr(S.starting) : tr(S.retry)}
          </Button>
        ) : (
          <Button type="button" disabled={busy} onClick={start}>
            {busy ? tr(S.starting) : tr(S.start)}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Classifier upload is temporarily unavailable.";
}
