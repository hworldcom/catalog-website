import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { t, tr } from "@/lib/i18n";

import {
  createDelegatedClassifierBatch,
  searchDelegatedUploadSellers,
} from "../delegated-classifier-upload.functions";
import type {
  CreateDelegatedClassifierBatchInput,
  DelegatedClassifierWorkflowContext,
  DelegatedUploadSeller,
  DelegatedUploadSellerSearchRequest,
  DelegatedUploadSellerSearchResult,
} from "../delegated-classifier-upload.types";
import { ClassifierImportShell } from "../components/classifier-import-shell";

const S = {
  title: t(
    "Upload for a seller",
    "Prześlij dla sprzedawcy",
    "Für einen Verkäufer hochladen",
    "Tải lên cho nhà bán",
  ),
  description: t(
    "Select the seller that will own the classifier workflow and every resulting product draft.",
    "Wybierz sprzedawcę, który będzie właścicielem procesu klasyfikatora i wszystkich wynikowych szkiców produktów.",
    "Wählen Sie den Verkäufer aus, dem der Klassifikator-Ablauf und alle daraus entstehenden Produktentwürfe gehören.",
    "Chọn nhà bán sẽ sở hữu quy trình phân loại và mọi bản nháp sản phẩm được tạo.",
  ),
  searchLabel: t(
    "Seller name or slug",
    "Nazwa lub slug sprzedawcy",
    "Verkäufername oder Slug",
    "Tên hoặc slug nhà bán",
  ),
  searchPlaceholder: t("Search sellers", "Szukaj sprzedawców", "Verkäufer suchen", "Tìm nhà bán"),
  search: t("Search", "Szukaj", "Suchen", "Tìm kiếm"),
  searching: t("Searching…", "Wyszukiwanie…", "Suche…", "Đang tìm…"),
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
  selectedSeller: t(
    "Selected seller",
    "Wybrany sprzedawca",
    "Ausgewählter Verkäufer",
    "Nhà bán đã chọn",
  ),
  create: t(
    "Create classifier upload",
    "Utwórz przesyłanie",
    "Klassifikator-Upload erstellen",
    "Tạo lượt tải lên phân loại",
  ),
  creating: t("Preparing…", "Przygotowywanie…", "Wird vorbereitet…", "Đang chuẩn bị…"),
  noSellers: t(
    "No sellers match this search.",
    "Brak pasujących sprzedawców.",
    "Keine passenden Verkäufer gefunden.",
    "Không có nhà bán phù hợp.",
  ),
  loadFailed: t(
    "Sellers could not be loaded",
    "Nie można załadować sprzedawców",
    "Verkäufer konnten nicht geladen werden",
    "Không thể tải nhà bán",
  ),
  createFailed: t(
    "Classifier upload could not be prepared",
    "Nie można przygotować przesyłania",
    "Klassifikator-Upload konnte nicht vorbereitet werden",
    "Không thể chuẩn bị lượt tải lên",
  ),
};

export type DelegatedClassifierUploadNewClient = {
  search(request: DelegatedUploadSellerSearchRequest): Promise<DelegatedUploadSellerSearchResult>;
  create(input: CreateDelegatedClassifierBatchInput): Promise<DelegatedClassifierWorkflowContext>;
};

export function DelegatedClassifierUploadNewScreen({
  onCreated,
  client: providedClient,
}: {
  onCreated(workflowId: string): void;
  client?: DelegatedClassifierUploadNewClient;
}) {
  const search = useServerFn(searchDelegatedUploadSellers);
  const create = useServerFn(createDelegatedClassifierBatch);
  const client = useMemo<DelegatedClassifierUploadNewClient>(
    () => ({
      search: (request) => search({ data: request }),
      create: (input) => create({ data: input }),
    }),
    [create, search],
  );

  return (
    <DelegatedClassifierUploadNewScreenView
      client={providedClient ?? client}
      onCreated={onCreated}
    />
  );
}

export function DelegatedClassifierUploadNewScreenView({
  client,
  onCreated,
}: {
  client: DelegatedClassifierUploadNewClient;
  onCreated(workflowId: string): void;
}) {
  const [query, setQuery] = useState("");
  const [sellers, setSellers] = useState<DelegatedUploadSeller[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [searching, setSearching] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const request = useRef<{ sellerId: string; requestId: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .search({ query: "", limit: 20 })
      .then((result) => {
        if (!cancelled) setSellers(result.sellers);
      })
      .catch((error) => {
        if (!cancelled) setSearchError(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const selectedSeller = sellers.find((seller) => seller.sellerId === selectedSellerId) ?? null;

  async function runSearch() {
    setSearching(true);
    setSearchError(null);
    setCreateError(null);
    try {
      const result = await client.search({ query, limit: 20 });
      setSellers(result.sellers);
      setSelectedSellerId((current) =>
        result.sellers.some((seller) => seller.sellerId === current) ? current : null,
      );
    } catch (error) {
      setSearchError(errorMessage(error));
    } finally {
      setSearching(false);
    }
  }

  function selectSeller(sellerId: string) {
    setSelectedSellerId(sellerId);
    if (request.current?.sellerId !== sellerId) request.current = null;
    setCreateError(null);
  }

  async function createWorkflow() {
    if (!selectedSellerId) return;
    setCreating(true);
    setCreateError(null);
    const idempotency =
      request.current?.sellerId === selectedSellerId
        ? request.current
        : {
            sellerId: selectedSellerId,
            requestId: crypto.randomUUID(),
          };
    request.current = idempotency;
    try {
      const context = await client.create(idempotency);
      onCreated(context.workflow.workflowId);
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  return (
    <ClassifierImportShell>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{tr(S.title)}</CardTitle>
            <CardDescription>{tr(S.description)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                void runSearch();
              }}
            >
              <label className="flex-1 space-y-2 text-sm font-medium">
                {tr(S.searchLabel)}
                <Input
                  value={query}
                  maxLength={100}
                  placeholder={tr(S.searchPlaceholder)}
                  disabled={searching || creating}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <Button type="submit" variant="outline" disabled={searching || creating}>
                {searching ? tr(S.searching) : tr(S.search)}
              </Button>
            </form>

            {searchError ? (
              <Alert variant="destructive">
                <AlertTitle>{tr(S.loadFailed)}</AlertTitle>
                <AlertDescription>{searchError}</AlertDescription>
              </Alert>
            ) : null}

            {!searching && sellers.length === 0 && !searchError ? (
              <p className="text-sm text-muted-foreground">{tr(S.noSellers)}</p>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              {sellers.map((seller) => (
                <button
                  key={seller.sellerId}
                  type="button"
                  aria-pressed={selectedSellerId === seller.sellerId}
                  disabled={creating}
                  onClick={() => selectSeller(seller.sellerId)}
                  className={`space-y-2 border p-4 text-left transition-colors ${
                    selectedSellerId === seller.sellerId
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{seller.name}</span>
                    <Badge variant={seller.published ? "secondary" : "outline"}>
                      {seller.published ? tr(S.published) : tr(S.unpublished)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">/{seller.slug}</p>
                </button>
              ))}
            </div>

            {selectedSeller ? (
              <div className="space-y-3 border border-border bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {tr(S.selectedSeller)}
                </p>
                <p className="font-medium">{selectedSeller.name}</p>
                <p className="break-all text-xs text-muted-foreground">{selectedSeller.sellerId}</p>
                {createError ? (
                  <Alert variant="destructive">
                    <AlertTitle>{tr(S.createFailed)}</AlertTitle>
                    <AlertDescription>{createError}</AlertDescription>
                  </Alert>
                ) : null}
                <Button type="button" disabled={creating} onClick={() => void createWorkflow()}>
                  {creating ? tr(S.creating) : tr(S.create)}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </ClassifierImportShell>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Delegated classifier uploads are temporarily unavailable.";
}
