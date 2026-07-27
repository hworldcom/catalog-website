import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { t, tr, type T } from "@/lib/i18n";

import {
  classifierImportErrorMessage,
  createClassifierImportClient,
  type ClassifierImportClient,
  type ClassifierImportGroupStatus,
  type ClassifierImportSnapshot,
  type ClassifierImportStatus,
} from "../classifier-import.api";
import { ClassifierImportPoller } from "../classifier-import.poller";
import { ClassifierImportShell } from "../components/classifier-import-shell";

const defaultClient = createClassifierImportClient();

const S = {
  title: t("Import details", "Szczegóły importu", "Importdetails", "Chi tiết nhập"),
  newImport: t(
    "Back to approved batches",
    "Wróć do zatwierdzonych partii",
    "Zurück zu genehmigten Stapeln",
    "Quay lại các lô đã duyệt",
  ),
  loading: t(
    "Loading import status…",
    "Ładowanie stanu importu…",
    "Importstatus wird geladen…",
    "Đang tải trạng thái nhập…",
  ),
  unavailableTitle: t(
    "Import status unavailable",
    "Stan importu jest niedostępny",
    "Importstatus nicht verfügbar",
    "Không có trạng thái nhập",
  ),
  tryAgain: t("Try again", "Spróbuj ponownie", "Erneut versuchen", "Thử lại"),
  refreshTitle: t(
    "Status refresh failed",
    "Odświeżenie stanu nie powiodło się",
    "Statusaktualisierung fehlgeschlagen",
    "Làm mới trạng thái thất bại",
  ),
  refreshHelp: t(
    "The last successful status remains visible. Bazoria will try again automatically.",
    "Ostatni poprawny stan pozostaje widoczny. Bazoria spróbuje ponownie automatycznie.",
    "Der letzte erfolgreiche Status bleibt sichtbar. Bazoria versucht es automatisch erneut.",
    "Trạng thái thành công gần nhất vẫn hiển thị. Bazoria sẽ tự động thử lại.",
  ),
  actionTitle: t(
    "Import action failed",
    "Działanie importu nie powiodło się",
    "Importaktion fehlgeschlagen",
    "Thao tác nhập thất bại",
  ),
  batchId: t(
    "Classifier batch ID",
    "Identyfikator partii klasyfikatora",
    "Klassifikator-Stapel-ID",
    "Mã lô bộ phân loại",
  ),
  importId: t("Import ID", "Identyfikator importu", "Import-ID", "Mã nhập"),
  destinationSeller: t(
    "Destination seller",
    "Sprzedawca docelowy",
    "Zielverkäufer",
    "Nhà bán đích",
  ),
  sellerUnavailable: t(
    "Seller unavailable",
    "Sprzedawca niedostępny",
    "Verkäufer nicht verfügbar",
    "Nhà bán không khả dụng",
  ),
  sellerId: t("Seller ID", "Identyfikator sprzedawcy", "Verkäufer-ID", "Mã nhà bán"),
  operation: t("Operation", "Operacja", "Vorgang", "Thao tác"),
  importOperation: t("Import", "Import", "Import", "Nhập"),
  reconciliationOperation: t("Reconciliation", "Uzgadnianie", "Abgleich", "Đối soát"),
  reconciliationRunning: t(
    "Reconciliation is running.",
    "Trwa uzgadnianie.",
    "Der Abgleich läuft.",
    "Đang đối soát.",
  ),
  pending: t("Pending", "Oczekujące", "Ausstehend", "Đang chờ"),
  processing: t("Processing", "Przetwarzane", "In Bearbeitung", "Đang xử lý"),
  complete: t("Complete", "Zakończone", "Abgeschlossen", "Hoàn tất"),
  failed: t("Failed", "Nieudane", "Fehlgeschlagen", "Thất bại"),
  completedWithErrors: t(
    "Completed with errors",
    "Zakończono z błędami",
    "Mit Fehlern abgeschlossen",
    "Hoàn tất có lỗi",
  ),
  completed: t("Completed", "Zakończono", "Abgeschlossen", "Đã hoàn tất"),
  groupsTitle: t("Group outcomes", "Wyniki grup", "Gruppenergebnisse", "Kết quả nhóm"),
  groupsDescription: t(
    "Durable ProductDraft creation state for every approved classifier group.",
    "Trwały stan tworzenia szkicu produktu dla każdej zatwierdzonej grupy klasyfikatora.",
    "Dauerhafter Produktentwurfsstatus für jede genehmigte Klassifikatorgruppe.",
    "Trạng thái tạo bản nháp sản phẩm lâu dài cho từng nhóm đã duyệt.",
  ),
  pendingNoGroups: t(
    "Processing is queued. Bazoria will start this import automatically.",
    "Przetwarzanie jest w kolejce. Bazoria uruchomi ten import automatycznie.",
    "Die Verarbeitung wurde eingereiht. Bazoria startet diesen Import automatisch.",
    "Quá trình xử lý đã được xếp hàng. Bazoria sẽ tự động bắt đầu nhập.",
  ),
  dispatchRecoveryHelp: t(
    "Processing has not started. Retry processing to dispatch this import again.",
    "Przetwarzanie nie rozpoczęło się. Ponów przetwarzanie, aby ponownie wysłać ten import.",
    "Die Verarbeitung wurde nicht gestartet. Starten Sie die Verarbeitung erneut, um diesen Import erneut zu senden.",
    "Quá trình xử lý chưa bắt đầu. Hãy thử xử lý lại để gửi lại lần nhập này.",
  ),
  runningNoGroups: t(
    "The import is starting. Group outcomes will appear as approved groups are prepared.",
    "Import jest uruchamiany. Wyniki grup pojawią się podczas przygotowywania zatwierdzonych grup.",
    "Der Import wird gestartet. Gruppenergebnisse erscheinen, sobald genehmigte Gruppen vorbereitet werden.",
    "Quá trình nhập đang bắt đầu. Kết quả nhóm sẽ xuất hiện khi các nhóm đã duyệt được chuẩn bị.",
  ),
  failedNoGroups: t(
    "The import stopped before any group outcomes were created. Review the stable error above and use an available retry action.",
    "Import zatrzymał się przed utworzeniem wyników grup. Sprawdź stały błąd powyżej i użyj dostępnej opcji ponowienia.",
    "Der Import wurde beendet, bevor Gruppenergebnisse erstellt wurden. Prüfen Sie den stabilen Fehler oben und verwenden Sie eine verfügbare Wiederholungsaktion.",
    "Quá trình nhập đã dừng trước khi tạo kết quả nhóm. Hãy xem lỗi ổn định ở trên và dùng thao tác thử lại khả dụng.",
  ),
  completedWithErrorsNoGroups: t(
    "The import completed with errors, but no group outcomes were returned.",
    "Import zakończył się z błędami, ale nie zwrócono wyników grup.",
    "Der Import wurde mit Fehlern abgeschlossen, aber es wurden keine Gruppenergebnisse zurückgegeben.",
    "Quá trình nhập hoàn tất có lỗi nhưng không trả về kết quả nhóm.",
  ),
  completedNoGroups: t(
    "The import completed without group outcomes.",
    "Import zakończył się bez wyników grup.",
    "Der Import wurde ohne Gruppenergebnisse abgeschlossen.",
    "Quá trình nhập hoàn tất mà không có kết quả nhóm.",
  ),
  groupId: t("Classifier group", "Grupa klasyfikatora", "Klassifikatorgruppe", "Nhóm bộ phân loại"),
  productDraft: t("ProductDraft", "Szkic produktu", "Produktentwurf", "Bản nháp sản phẩm"),
  reviewDraft: t("Review draft", "Sprawdź szkic", "Entwurf prüfen", "Xem lại bản nháp"),
  errorCode: t("Error code", "Kod błędu", "Fehlercode", "Mã lỗi"),
  notCreated: t("Not created", "Nie utworzono", "Nicht erstellt", "Chưa tạo"),
  none: t("None", "Brak", "Keiner", "Không có"),
  actionsTitle: t(
    "Available actions",
    "Dostępne działania",
    "Verfügbare Aktionen",
    "Thao tác khả dụng",
  ),
  retryTemporary: t(
    "Retry temporary failures",
    "Ponów tymczasowe błędy",
    "Temporäre Fehler erneut versuchen",
    "Thử lại lỗi tạm thời",
  ),
  retryAll: t(
    "Retry all failures",
    "Ponów wszystkie błędy",
    "Alle Fehler erneut versuchen",
    "Thử lại mọi lỗi",
  ),
  reconcile: t(
    "Reconcile promoted images",
    "Uzgodnij przeniesione obrazy",
    "Übertragene Bilder abgleichen",
    "Đối soát ảnh đã chuyển",
  ),
  retryProcessing: t(
    "Retry processing",
    "Ponów przetwarzanie",
    "Verarbeitung erneut starten",
    "Thử xử lý lại",
  ),
  working: t("Working…", "Przetwarzanie…", "Wird ausgeführt…", "Đang thực hiện…"),
  retryAllConfirm: t(
    "Retry all failures, including failures marked as non-retryable?",
    "Ponowić wszystkie błędy, w tym oznaczone jako nieprzeznaczone do ponowienia?",
    "Alle Fehler erneut versuchen, auch als nicht wiederholbar markierte?",
    "Thử lại mọi lỗi, kể cả lỗi được đánh dấu không thể thử lại?",
  ),
};

const statusLabels: Record<ClassifierImportStatus, T> = {
  pending: S.pending,
  running: S.processing,
  completed: S.completed,
  completed_with_errors: S.completedWithErrors,
  failed: S.failed,
};

const groupStatusLabels: Record<ClassifierImportGroupStatus, T> = {
  pending: S.pending,
  processing: S.processing,
  complete: S.complete,
  failed: S.failed,
};

type ActiveAction = "retry-temporary" | "retry-all" | "reconcile" | "dispatch";

type ClassifierImportDetailScreenProps = {
  importId: string;
  currentSellerId: string | null;
  currentSellerLoading?: boolean;
  client?: ClassifierImportClient;
};

export function ClassifierImportDetailScreen({
  importId,
  currentSellerId,
  currentSellerLoading = false,
  client = defaultClient,
}: ClassifierImportDetailScreenProps) {
  const pollerRef = useRef<ClassifierImportPoller | null>(null);
  const [snapshot, setSnapshot] = useState<ClassifierImportSnapshot | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);

  useEffect(() => {
    setSnapshot(null);
    setInitialLoading(true);
    setInitialError(null);
    setRefreshError(null);
    setActionError(null);
    setActiveAction(null);

    const poller = new ClassifierImportPoller({
      importId,
      client,
      onSnapshot: (nextSnapshot) => {
        setSnapshot(nextSnapshot);
        setInitialLoading(false);
        setInitialError(null);
        setRefreshError(null);
      },
      onError: (error, initial) => {
        if (initial) {
          setInitialLoading(false);
          setInitialError(classifierImportErrorMessage(error));
        } else {
          setRefreshError(classifierImportErrorMessage(error));
        }
      },
    });
    pollerRef.current = poller;
    poller.start();

    return () => {
      poller.stop();
      if (pollerRef.current === poller) pollerRef.current = null;
    };
  }, [client, importId]);

  async function runAction(action: ActiveAction) {
    if (activeAction) return;
    if (action === "retry-all" && !window.confirm(tr(S.retryAllConfirm))) return;

    setActiveAction(action);
    setActionError(null);
    pollerRef.current?.pause();
    try {
      const nextSnapshot =
        action === "dispatch"
          ? await client.dispatch(importId)
          : action === "reconcile"
            ? await client.reconcile(importId)
            : await client.retry(importId, action === "retry-all");
      pollerRef.current?.replace(nextSnapshot);
    } catch (error) {
      setActionError(classifierImportErrorMessage(error));
      pollerRef.current?.resume();
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <ClassifierImportShell>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h1 className="font-display text-2xl font-semibold">{tr(S.title)}</h1>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{importId}</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin/classifier-imports">{tr(S.newImport)}</Link>
          </Button>
        </div>

        {initialLoading ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">{tr(S.loading)}</CardContent>
          </Card>
        ) : null}

        {!snapshot && initialError ? (
          <Alert variant="destructive">
            <AlertTitle>{tr(S.unavailableTitle)}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{initialError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setInitialLoading(true);
                  setInitialError(null);
                  pollerRef.current?.retryNow();
                }}
              >
                {tr(S.tryAgain)}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {snapshot ? (
          <>
            {refreshError ? (
              <Alert>
                <AlertTitle>{tr(S.refreshTitle)}</AlertTitle>
                <AlertDescription>
                  {refreshError} {tr(S.refreshHelp)}
                </AlertDescription>
              </Alert>
            ) : null}

            {actionError ? (
              <Alert variant="destructive">
                <AlertTitle>{tr(S.actionTitle)}</AlertTitle>
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            ) : null}

            <ImportSummary snapshot={snapshot} />

            {snapshot.actions.canDispatch ||
            snapshot.actions.canRetryTemporary ||
            snapshot.actions.canRetryAll ||
            snapshot.actions.canReconcile ? (
              <Card>
                <CardHeader>
                  <CardTitle>{tr(S.actionsTitle)}</CardTitle>
                  {snapshot.actions.canDispatch ? (
                    <CardDescription>{tr(S.dispatchRecoveryHelp)}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  {snapshot.actions.canDispatch ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={activeAction !== null}
                      onClick={() => void runAction("dispatch")}
                    >
                      {activeAction === "dispatch" ? tr(S.working) : tr(S.retryProcessing)}
                    </Button>
                  ) : null}
                  {snapshot.actions.canRetryTemporary ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={activeAction !== null}
                      onClick={() => void runAction("retry-temporary")}
                    >
                      {activeAction === "retry-temporary" ? tr(S.working) : tr(S.retryTemporary)}
                    </Button>
                  ) : null}
                  {snapshot.actions.canRetryAll ? (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={activeAction !== null}
                      onClick={() => void runAction("retry-all")}
                    >
                      {activeAction === "retry-all" ? tr(S.working) : tr(S.retryAll)}
                    </Button>
                  ) : null}
                  {snapshot.actions.canReconcile ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={activeAction !== null}
                      onClick={() => void runAction("reconcile")}
                    >
                      {activeAction === "reconcile" ? tr(S.working) : tr(S.reconcile)}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            <GroupOutcomes
              snapshot={snapshot}
              currentSellerId={currentSellerId}
              currentSellerLoading={currentSellerLoading}
            />
          </>
        ) : null}
      </div>
    </ClassifierImportShell>
  );
}

function ImportSummary({ snapshot }: { snapshot: ClassifierImportSnapshot }) {
  const counts = [
    [S.pending, snapshot.pendingGroupCount],
    [S.processing, snapshot.processingGroupCount],
    [S.complete, snapshot.completeGroupCount],
    [S.failed, snapshot.failedGroupCount],
  ] as const;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>{tr(statusLabels[snapshot.status])}</CardTitle>
            {snapshot.status === "running" && snapshot.operationKind === "reconcile" ? (
              <CardDescription className="mt-2">{tr(S.reconciliationRunning)}</CardDescription>
            ) : null}
          </div>
          <StatusBadge status={snapshot.status} />
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <Definition label={tr(S.importId)} value={snapshot.importId} mono />
          <Definition label={tr(S.batchId)} value={snapshot.classifierBatchId} mono />
          <Definition
            label={tr(S.operation)}
            value={
              snapshot.operationKind === "reconcile"
                ? tr(S.reconciliationOperation)
                : tr(S.importOperation)
            }
          />
          <Definition
            label={tr(S.errorCode)}
            value={snapshot.errorCode ?? tr(S.none)}
            mono={snapshot.errorCode !== null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr(S.destinationSeller)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="font-medium">
            {snapshot.destinationSeller.name ?? tr(S.sellerUnavailable)}
          </div>
          <Definition label={tr(S.sellerId)} value={snapshot.destinationSeller.id} mono />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-2">
        {counts.map(([label, value]) => (
          <Card key={label.EN}>
            <CardContent className="p-4">
              <div className="text-2xl font-semibold tabular-nums">{value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{tr(label)}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function GroupOutcomes({
  snapshot,
  currentSellerId,
  currentSellerLoading,
}: {
  snapshot: ClassifierImportSnapshot;
  currentSellerId: string | null;
  currentSellerLoading: boolean;
}) {
  const canLinkDrafts = !currentSellerLoading && currentSellerId === snapshot.destinationSeller.id;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr(S.groupsTitle)}</CardTitle>
        <CardDescription>{tr(S.groupsDescription)}</CardDescription>
      </CardHeader>
      <CardContent>
        {snapshot.groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr(emptyGroupMessages[snapshot.status])}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{tr(S.groupId)}</th>
                  <th className="px-3 py-2">{tr(S.productDraft)}</th>
                  <th className="px-3 py-2">{tr(S.operation)}</th>
                  <th className="px-3 py-2">{tr(S.errorCode)}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.groups.map((group) => (
                  <tr key={group.classifierGroupId} className="border-b last:border-b-0">
                    <td className="px-3 py-3 font-mono text-xs">{group.classifierGroupId}</td>
                    <td className="px-3 py-3">
                      {group.productDraftId ? (
                        <div className="flex flex-col items-start gap-2">
                          {canLinkDrafts ? (
                            <Link
                              to="/seller/products/$id"
                              params={{ id: group.productDraftId }}
                              className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                            >
                              {group.productDraftId}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs">{group.productDraftId}</span>
                          )}
                          <Link
                            to="/admin/product-drafts/$productDraftId"
                            params={{ productDraftId: group.productDraftId }}
                            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                          >
                            {tr(S.reviewDraft)}
                          </Link>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{tr(S.notCreated)}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <GroupStatusBadge status={group.status} />
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{group.errorCode ?? tr(S.none)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const emptyGroupMessages: Record<ClassifierImportStatus, T> = {
  pending: S.pendingNoGroups,
  running: S.runningNoGroups,
  failed: S.failedNoGroups,
  completed_with_errors: S.completedWithErrorsNoGroups,
  completed: S.completedNoGroups,
};

function Definition({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 break-all ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: ClassifierImportStatus }) {
  return (
    <Badge
      variant={
        status === "failed" ? "destructive" : status === "completed" ? "default" : "secondary"
      }
    >
      {tr(statusLabels[status])}
    </Badge>
  );
}

function GroupStatusBadge({ status }: { status: ClassifierImportGroupStatus }) {
  return (
    <Badge
      variant={
        status === "failed" ? "destructive" : status === "complete" ? "default" : "secondary"
      }
    >
      {tr(groupStatusLabels[status])}
    </Badge>
  );
}
