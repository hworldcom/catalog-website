import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { t, tr } from "@/lib/i18n";

import {
  finalizeMyClassifierUploads,
  getMyClassifierBatch,
  getMyClassifierUploads,
  registerMyClassifierUploads,
  retryMyClassifierUploads,
  startMyClassifierProcessing,
} from "../seller-classifier-batch.functions";
import type { SellerClassifierBatchSnapshot } from "../seller-classifier-batch.types";
import { clearSellerClassifierCreationSession } from "../seller-classifier-creation-session";
import {
  formatBytes,
  prepareSellerClassifierDirectUploads,
  prepareSellerClassifierRetryUploads,
  uploadSellerClassifierFiles,
  validateSellerClassifierFiles,
  type SellerClassifierDirectUpload,
} from "../seller-classifier-direct-upload";
import type {
  SellerClassifierFinalizeResult,
  SellerClassifierUploadImage,
  SellerClassifierUploadRegistration,
  SellerClassifierUploadSnapshot,
} from "../seller-classifier-workflow.types";

const S = {
  title: t(
    "Upload product images",
    "Prześlij zdjęcia produktów",
    "Produktbilder hochladen",
    "Tải ảnh sản phẩm lên",
  ),
  description: t(
    "Select JPEG images. They are uploaded directly to private classifier storage and remain attached to this workflow.",
    "Wybierz obrazy JPEG. Zostaną przesłane bezpośrednio do prywatnej pamięci klasyfikatora i pozostaną przypisane do tego procesu.",
    "Wählen Sie JPEG-Bilder. Sie werden direkt in den privaten Klassifikatorspeicher geladen und bleiben diesem Ablauf zugeordnet.",
    "Chọn ảnh JPEG. Ảnh được tải trực tiếp lên bộ nhớ riêng của bộ phân loại và gắn với quy trình này.",
  ),
  selected: t("selected", "wybrano", "ausgewählt", "đã chọn"),
  upload: t("Upload images", "Prześlij zdjęcia", "Bilder hochladen", "Tải ảnh lên"),
  uploading: t("Uploading…", "Przesyłanie…", "Wird hochgeladen…", "Đang tải lên…"),
  check: t(
    "Check uploads and continue",
    "Sprawdź przesyłanie i kontynuuj",
    "Uploads prüfen und fortfahren",
    "Kiểm tra tải lên và tiếp tục",
  ),
  continueProcessing: t(
    "Continue processing",
    "Kontynuuj przetwarzanie",
    "Verarbeitung fortsetzen",
    "Tiếp tục xử lý",
  ),
  retry: t(
    "Retry selected files",
    "Ponów wybrane pliki",
    "Ausgewählte Dateien erneut versuchen",
    "Thử lại các tệp đã chọn",
  ),
  chooseRetry: t(
    "Select the original file",
    "Wybierz oryginalny plik",
    "Originaldatei auswählen",
    "Chọn tệp gốc",
  ),
  failed: t(
    "Upload action failed",
    "Operacja przesyłania nie powiodła się",
    "Upload-Aktion fehlgeschlagen",
    "Thao tác tải lên thất bại",
  ),
  reviewReady: t(
    "Review is ready",
    "Weryfikacja jest gotowa",
    "Prüfung ist bereit",
    "Đã sẵn sàng xem xét",
  ),
  openReview: t("Open review", "Otwórz weryfikację", "Prüfung öffnen", "Mở trang xem xét"),
  sellerHandoff: t(
    "The seller can now continue with group review and approval.",
    "Sprzedawca może teraz kontynuować przegląd i zatwierdzanie grup.",
    "Der Verkäufer kann nun mit der Gruppenprüfung und Genehmigung fortfahren.",
    "Nhà bán hiện có thể tiếp tục xem xét và phê duyệt nhóm.",
  ),
};

export function SellerClassifierUploadScreen({ workflowId }: { workflowId: string }) {
  const navigate = useNavigate();
  const getBatch = useServerFn(getMyClassifierBatch);
  const getUploads = useServerFn(getMyClassifierUploads);
  const registerUploads = useServerFn(registerMyClassifierUploads);
  const retryUploads = useServerFn(retryMyClassifierUploads);
  const finalizeUploads = useServerFn(finalizeMyClassifierUploads);
  const startProcessing = useServerFn(startMyClassifierProcessing);
  const client = useMemo<ClassifierUploadClient>(
    () => ({
      getBatch: (id) => getBatch({ data: { workflowId: id } }),
      getUploads: (id) => getUploads({ data: { workflowId: id } }),
      registerUploads: (input) => registerUploads({ data: input }),
      retryUploads: (input) => retryUploads({ data: input }),
      finalizeUploads: (id) => finalizeUploads({ data: { workflowId: id } }),
      startProcessing: (id) => startProcessing({ data: { workflowId: id } }),
    }),
    [finalizeUploads, getBatch, getUploads, registerUploads, retryUploads, startProcessing],
  );
  const navigateToProcessing = useCallback(() => {
    navigate({
      to: "/seller/classifier-batches/$workflowId/processing",
      params: { workflowId },
    });
  }, [navigate, workflowId]);

  return (
    <ClassifierUploadScreenView
      workflowId={workflowId}
      client={client}
      onOpenProcessing={navigateToProcessing}
      reviewHref={`/seller/classifier-batches/${encodeURIComponent(workflowId)}/review`}
      queryScope="seller"
      clearCreationSessionOnLoad
    />
  );
}

export type ClassifierUploadClient = {
  getBatch(workflowId: string): Promise<SellerClassifierBatchSnapshot>;
  getUploads(workflowId: string): Promise<SellerClassifierUploadSnapshot>;
  registerUploads(input: {
    workflowId: string;
    files: Array<{
      originalFilename: string;
      mimeType: "image/jpeg";
      sizeBytes: number;
    }>;
  }): Promise<SellerClassifierUploadRegistration>;
  retryUploads(input: {
    workflowId: string;
    imageIds: string[];
  }): Promise<SellerClassifierUploadRegistration>;
  finalizeUploads(workflowId: string): Promise<SellerClassifierFinalizeResult>;
  startProcessing(workflowId: string): Promise<unknown>;
};

export type ClassifierUploadScreenViewProps = {
  workflowId: string;
  client: ClassifierUploadClient;
  onOpenProcessing(): void;
  reviewHref: string | null;
  queryScope: string;
  clearCreationSessionOnLoad?: boolean;
};

export function ClassifierUploadScreenView({
  workflowId,
  client,
  onOpenProcessing,
  reviewHref,
  queryScope,
  clearCreationSessionOnLoad = false,
}: ClassifierUploadScreenViewProps) {
  const queryClient = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [directUploads, setDirectUploads] = useState<SellerClassifierDirectUpload[] | null>(null);
  const [retryFiles, setRetryFiles] = useState<Map<string, File>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queuedContinuationAttempted = useRef(false);
  const queryKey = [queryScope, "classifier-uploads", workflowId] as const;

  const workflowQuery = useQuery({
    queryKey: [queryScope, "classifier-workflow", workflowId],
    queryFn: () => client.getBatch(workflowId),
  });
  const uploadQuery = useQuery({
    queryKey,
    queryFn: () => client.getUploads(workflowId),
    enabled: workflowQuery.data?.provisioningStatus === "ready",
  });

  const workflow = workflowQuery.data;
  const snapshot = uploadQuery.data;
  const limits =
    workflow?.maxFiles && workflow.maxFileSizeBytes
      ? { maxFiles: workflow.maxFiles, maxFileSizeBytes: workflow.maxFileSizeBytes }
      : null;

  useEffect(() => {
    if (!snapshot) return;
    if (clearCreationSessionOnLoad) clearSellerClassifierCreationSession();
    if (snapshot.stage === "processing" && snapshot.status !== "queued") {
      onOpenProcessing();
    }
  }, [clearCreationSessionOnLoad, onOpenProcessing, snapshot]);

  useEffect(() => {
    if (snapshot?.status !== "queued" || queuedContinuationAttempted.current) return;
    queuedContinuationAttempted.current = true;
    setBusy(true);
    client
      .startProcessing(workflowId)
      .then(() => onOpenProcessing())
      .catch((continuationError: unknown) => setError(errorMessage(continuationError)))
      .finally(() => setBusy(false));
  }, [client, onOpenProcessing, snapshot?.status, workflowId]);

  const displayRows = useMemo(
    () => mergeDisplayRows(snapshot?.images ?? [], directUploads),
    [directUploads, snapshot?.images],
  );
  const uploadedCount = displayRows.filter((row) => row.status === "uploaded").length;
  const progress =
    displayRows.length === 0 ? 0 : Math.round((uploadedCount / displayRows.length) * 100);

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setSelectedFiles(files);
    setDirectUploads(null);
    setError(limits && files.length ? validateSellerClassifierFiles(files, limits) : null);
  }

  async function upload() {
    if (!limits) return;
    const validation = validateSellerClassifierFiles(selectedFiles, limits);
    if (validation) {
      setError(validation);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const registration = await client.registerUploads({
        workflowId,
        files: selectedFiles.map((file) => ({
          originalFilename: file.name,
          mimeType: "image/jpeg" as const,
          sizeBytes: file.size,
        })),
      });
      const prepared = prepareSellerClassifierDirectUploads(selectedFiles, registration.uploads);
      setDirectUploads(prepared);
      setRetryFiles(new Map(prepared.map((item) => [item.imageId, item.file])));
      const completed = await uploadSellerClassifierFiles(prepared, updateDirectUpload);
      setDirectUploads(completed);
      await finalizeAndContinue();
    } catch (uploadError) {
      setError(errorMessage(uploadError));
      await uploadQuery.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function finalizeAndContinue() {
    const result = await client.finalizeUploads(workflowId);
    applyFinalization(result);
  }

  function applyFinalization(result: SellerClassifierFinalizeResult) {
    queryClient.setQueryData(queryKey, result.upload);
    setDirectUploads(null);
    if (result.processing) onOpenProcessing();
  }

  function updateDirectUpload(updated: SellerClassifierDirectUpload) {
    setDirectUploads(
      (current) =>
        current?.map((item) => (item.imageId === updated.imageId ? updated : item)) ?? null,
    );
  }

  function chooseRetryFile(
    image: Pick<SellerClassifierUploadImage, "imageId" | "originalFilename">,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file || !limits) return;
    const validation = validateSellerClassifierFiles([file], {
      maxFiles: 1,
      maxFileSizeBytes: limits.maxFileSizeBytes,
    });
    if (validation || file.name !== image.originalFilename) {
      setError(validation ?? `Select ${image.originalFilename} for this retry.`);
      return;
    }
    setRetryFiles((current) => new Map(current).set(image.imageId, file));
    setError(null);
  }

  async function retrySelected() {
    if (!snapshot) return;
    const selectedIds = snapshot.images
      .filter((image) => image.retryAllowed && retryFiles.has(image.imageId))
      .map((image) => image.imageId);
    if (selectedIds.length === 0) {
      setError("Select the original file for at least one failed image.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const registration = await client.retryUploads({ workflowId, imageIds: selectedIds });
      const selectedFilesById = new Map(
        selectedIds.map((imageId) => [imageId, retryFiles.get(imageId)!]),
      );
      const prepared = prepareSellerClassifierRetryUploads(selectedFilesById, registration.uploads);
      setDirectUploads(prepared);
      const completed = await uploadSellerClassifierFiles(prepared, updateDirectUpload);
      setDirectUploads(completed);
      await finalizeAndContinue();
    } catch (retryError) {
      setError(errorMessage(retryError));
      await uploadQuery.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function continueProcessing() {
    setBusy(true);
    setError(null);
    try {
      await client.startProcessing(workflowId);
      onOpenProcessing();
    } catch (processingError) {
      setError(errorMessage(processingError));
    } finally {
      setBusy(false);
    }
  }

  if (workflowQuery.isLoading || uploadQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (workflowQuery.isError || uploadQuery.isError || !workflow || !snapshot || !limits) {
    return <ErrorAlert message={errorMessage(workflowQuery.error ?? uploadQuery.error)} />;
  }

  const retryableImages = snapshot.images.filter((image) => image.retryAllowed);
  const readyRetryCount = retryableImages.filter((image) => retryFiles.has(image.imageId)).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{tr(S.title)}</CardTitle>
          <CardDescription>
            {tr(S.description)} {workflow.maxFiles} files, {formatBytes(workflow.maxFileSizeBytes!)}{" "}
            each.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error ? <ErrorAlert message={error} /> : null}

          {snapshot.status === "created" ? (
            <div className="space-y-4">
              <input
                type="file"
                accept=".jpg,.jpeg,image/jpeg"
                multiple
                disabled={busy}
                onChange={chooseFiles}
                className="block w-full border border-border bg-background p-3 text-sm"
              />
              <p className="text-sm text-muted-foreground">
                {selectedFiles.length} {tr(S.selected)}
              </p>
              <Button type="button" disabled={busy || selectedFiles.length === 0} onClick={upload}>
                {busy ? tr(S.uploading) : tr(S.upload)}
              </Button>
            </div>
          ) : null}

          {displayRows.length > 0 ? (
            <div className="space-y-3">
              <Progress value={progress} aria-label={`${progress}% uploaded`} />
              <div className="space-y-2">
                {displayRows.map((row) => (
                  <div
                    key={row.imageId}
                    className="grid gap-2 border border-border/70 p-3 sm:grid-cols-[1fr_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.originalFilename}</p>
                      {row.errorCode ? (
                        <p className="text-xs text-destructive">{row.errorCode}</p>
                      ) : null}
                    </div>
                    <Badge variant={row.status === "failed" ? "destructive" : "outline"}>
                      {row.status}
                    </Badge>
                    {row.retryAllowed ? (
                      <label className="text-xs text-muted-foreground sm:col-span-2">
                        {tr(S.chooseRetry)}
                        <input
                          type="file"
                          accept=".jpg,.jpeg,image/jpeg"
                          disabled={busy}
                          onChange={(event) => chooseRetryFile(row, event)}
                          className="mt-2 block w-full border border-border bg-background p-2 text-sm"
                        />
                      </label>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {snapshot.status === "uploading" && retryableImages.length === 0 ? (
            <Button type="button" disabled={busy} onClick={finalizeAndContinue}>
              {tr(S.check)}
            </Button>
          ) : null}
          {retryableImages.length > 0 ? (
            <Button type="button" disabled={busy || readyRetryCount === 0} onClick={retrySelected}>
              {tr(S.retry)} ({readyRetryCount})
            </Button>
          ) : null}
          {snapshot.status === "queued" ? (
            <Button type="button" disabled={busy} onClick={continueProcessing}>
              {tr(S.continueProcessing)}
            </Button>
          ) : null}
          {snapshot.stage === "review" || snapshot.stage === "approved" ? (
            <Alert>
              <AlertTitle>{tr(S.reviewReady)}</AlertTitle>
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
        </CardContent>
      </Card>
    </div>
  );
}

type DisplayRow = Omit<SellerClassifierUploadImage, "status"> & {
  status: SellerClassifierUploadImage["status"] | "uploading";
};

function mergeDisplayRows(
  persisted: SellerClassifierUploadImage[],
  direct: SellerClassifierDirectUpload[] | null,
): DisplayRow[] {
  if (!direct) return persisted;
  const directById = new Map(direct.map((item) => [item.imageId, item]));
  return direct.map((item) => ({
    imageId: item.imageId,
    uploadOrder: item.uploadOrder,
    originalFilename: item.originalFilename,
    status: item.status,
    errorCode: item.errorMessage,
    retryAllowed: false,
    ...persisted.find((row) => row.imageId === item.imageId),
    ...(directById.get(item.imageId)
      ? {
          status: item.status,
          errorCode: item.errorMessage,
          retryAllowed: false,
        }
      : {}),
  }));
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{tr(S.failed)}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Classifier upload is temporarily unavailable.";
}
