import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { t, tr } from "@/lib/i18n";

import {
  getMyClassifierProcessing,
  startMyClassifierProcessing,
} from "../seller-classifier-batch.functions";
import type { SellerClassifierProcessingSnapshot } from "../seller-classifier-workflow.types";

const S = {
  title: t(
    "Classifier processing",
    "Przetwarzanie klasyfikatora",
    "Klassifikator-Verarbeitung",
    "Bộ phân loại đang xử lý",
  ),
  description: t(
    "Images are processed, classified, and grouped in the background. You can leave this page and return later.",
    "Zdjęcia są przetwarzane, klasyfikowane i grupowane w tle. Możesz opuścić tę stronę i wrócić później.",
    "Bilder werden im Hintergrund verarbeitet, klassifiziert und gruppiert. Sie können diese Seite verlassen und später zurückkehren.",
    "Ảnh được xử lý, phân loại và nhóm trong nền. Bạn có thể rời trang và quay lại sau.",
  ),
  retry: t(
    "Retry failed processing",
    "Ponów nieudane przetwarzanie",
    "Fehlgeschlagene Verarbeitung erneut versuchen",
    "Thử lại xử lý bị lỗi",
  ),
  unavailable: t(
    "Processing state is unavailable",
    "Stan przetwarzania jest niedostępny",
    "Verarbeitungsstatus ist nicht verfügbar",
    "Trạng thái xử lý không khả dụng",
  ),
  ready: t(
    "Product groups are ready for review",
    "Grupy produktów są gotowe do weryfikacji",
    "Produktgruppen sind zur Prüfung bereit",
    "Nhóm sản phẩm đã sẵn sàng để xem xét",
  ),
  openReview: t("Review groups", "Zweryfikuj grupy", "Gruppen prüfen", "Xem xét nhóm"),
  stopped: t(
    "Processing stopped",
    "Przetwarzanie zostało zatrzymane",
    "Verarbeitung wurde gestoppt",
    "Quá trình xử lý đã dừng",
  ),
  sellerHandoff: t(
    "The seller can now continue with group review and approval.",
    "Sprzedawca może teraz kontynuować przegląd i zatwierdzanie grup.",
    "Der Verkäufer kann nun mit der Gruppenprüfung und Genehmigung fortfahren.",
    "Nhà bán hiện có thể tiếp tục xem xét và phê duyệt nhóm.",
  ),
};

export function SellerClassifierProcessingScreen({ workflowId }: { workflowId: string }) {
  const getProcessing = useServerFn(getMyClassifierProcessing);
  const startProcessing = useServerFn(startMyClassifierProcessing);
  const client = useMemo<ClassifierProcessingClient>(
    () => ({
      getProcessing: (id) => getProcessing({ data: { workflowId: id } }),
      startProcessing: (id) => startProcessing({ data: { workflowId: id } }),
    }),
    [getProcessing, startProcessing],
  );

  return (
    <ClassifierProcessingScreenView
      workflowId={workflowId}
      client={client}
      reviewHref={`/seller/classifier-batches/${encodeURIComponent(workflowId)}/review`}
      queryScope="seller"
    />
  );
}

export type ClassifierProcessingClient = {
  getProcessing(workflowId: string): Promise<SellerClassifierProcessingSnapshot>;
  startProcessing(workflowId: string): Promise<SellerClassifierProcessingSnapshot>;
};

export function ClassifierProcessingScreenView({
  workflowId,
  client,
  reviewHref,
  queryScope,
  onReadyForReview,
}: {
  workflowId: string;
  client: ClassifierProcessingClient;
  reviewHref: string | null;
  queryScope: string;
  onReadyForReview?(): void;
}) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const query = useQuery({
    queryKey: [queryScope, "classifier-processing", workflowId],
    queryFn: () => client.getProcessing(workflowId),
    refetchInterval: (current) => {
      const stage = current.state.data?.stage;
      return stage === "review" || stage === "approved" || stage === "failed" ? false : 2_000;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const stage = query.data?.stage;
    if (stage === "review" || stage === "approved") onReadyForReview?.();
  }, [onReadyForReview, query.data?.stage]);

  async function retry() {
    setRetrying(true);
    setActionError(null);
    try {
      await client.startProcessing(workflowId);
      await query.refetch();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setRetrying(false);
    }
  }

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (query.isError || !query.data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{tr(S.unavailable)}</AlertTitle>
        <AlertDescription>{errorMessage(query.error)}</AlertDescription>
      </Alert>
    );
  }

  const snapshot = query.data;
  const completed = snapshot.images.filter(
    (image) =>
      image.processJobStatus === "completed" &&
      (image.classifyJobStatus === "completed" || image.classifyJobStatus === "failed"),
  ).length;
  const progress =
    snapshot.images.length === 0 ? 0 : Math.round((completed / snapshot.images.length) * 100);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{tr(S.title)}</CardTitle>
          <CardDescription>{tr(S.description)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {actionError ? (
            <Alert variant="destructive">
              <AlertTitle>{tr(S.unavailable)}</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>
                {snapshot.processedFileCount} / {snapshot.originalFileCount}
              </span>
              <Badge variant="outline">{snapshot.status}</Badge>
            </div>
            <Progress value={progress} aria-label={`${progress}% processed`} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {snapshot.images.map((image) => (
              <div key={image.imageId} className="space-y-2 border border-border/70 p-3">
                <p className="truncate text-sm font-medium">{image.originalFilename}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">process: {image.processJobStatus ?? "pending"}</Badge>
                  <Badge variant="outline">classify: {image.classifyJobStatus ?? "pending"}</Badge>
                </div>
                {image.categorySlug ? (
                  <p className="text-sm text-muted-foreground">
                    {image.categorySlug}
                    {image.confidence === null ? "" : ` · ${Math.round(image.confidence * 100)}%`}
                  </p>
                ) : null}
                {image.processError ? (
                  <p className="text-xs text-destructive">{image.processError.message}</p>
                ) : null}
                {image.classifyError ? (
                  <p className="text-xs text-destructive">{image.classifyError.message}</p>
                ) : null}
              </div>
            ))}
          </div>

          {snapshot.retryAllowed ? (
            <Button type="button" disabled={retrying} onClick={retry}>
              {tr(S.retry)}
            </Button>
          ) : null}

          {snapshot.stage === "review" || snapshot.stage === "approved" ? (
            <Alert>
              <AlertTitle>{tr(S.ready)}</AlertTitle>
              <AlertDescription>
                {reviewHref ? (
                  <a className="text-primary underline" href={reviewHref}>
                    {tr(S.openReview)}
                  </a>
                ) : (
                  tr(S.sellerHandoff)
                )}
              </AlertDescription>
            </Alert>
          ) : null}

          {snapshot.stage === "failed" ? (
            <Alert variant="destructive">
              <AlertTitle>{tr(S.stopped)}</AlertTitle>
              <AlertDescription>
                Processing stopped before review groups could be prepared.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Classifier processing is temporarily unavailable.";
}
