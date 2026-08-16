import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { t, tr, type T } from "@/lib/i18n";

import { getProductDraftFacts, updateProductDraftFacts } from "../product-draft-facts.functions";
import {
  buildProductDraftFactsPatch,
  factsToFormValues,
  type ProductDraftFactsFormValues,
} from "../product-draft-facts.form";
import type {
  ProductDraftFactField,
  ProductDraftFactsPatch,
  ProductDraftFactsSnapshot,
} from "../product-draft-facts.types";

export type ProductDraftFactsEditorClient = {
  get(productDraftId: string): Promise<ProductDraftFactsSnapshot>;
  update(
    productDraftId: string,
    patch: ProductDraftFactsPatch,
    expectedModerationRevision: number,
  ): Promise<ProductDraftFactsSnapshot>;
};

export type ProductDraftFactsEditorState = {
  dirty: boolean;
  saving: boolean;
};

const S = {
  title: t(
    "Optional product details",
    "Opcjonalne informacje o produkcie",
    "Optionale Produktdetails",
    "Thông tin sản phẩm tùy chọn",
  ),
  description: t(
    "Add only details confirmed from the product images or merchant information.",
    "Dodaj tylko informacje potwierdzone na zdjęciach produktu lub przez sprzedawcę.",
    "Fügen Sie nur Details hinzu, die durch Produktbilder oder Händlerangaben bestätigt sind.",
    "Chỉ thêm thông tin được xác nhận từ ảnh sản phẩm hoặc thông tin của nhà bán.",
  ),
  loading: t(
    "Loading product facts…",
    "Ładowanie danych produktu…",
    "Produktfakten werden geladen…",
    "Đang tải thông tin sản phẩm…",
  ),
  loadErrorTitle: t(
    "Product facts could not be loaded",
    "Nie można załadować danych produktu",
    "Produktfakten konnten nicht geladen werden",
    "Không thể tải thông tin sản phẩm",
  ),
  saveErrorTitle: t(
    "Product facts could not be saved",
    "Nie można zapisać danych produktu",
    "Produktfakten konnten nicht gespeichert werden",
    "Không thể lưu thông tin sản phẩm",
  ),
  retry: t("Try again", "Spróbuj ponownie", "Erneut versuchen", "Thử lại"),
  colors: t("Colors", "Kolory", "Farben", "Màu sắc"),
  colorsHelp: t(
    "One color per line.",
    "Jeden kolor w każdym wierszu.",
    "Eine Farbe pro Zeile.",
    "Mỗi dòng một màu.",
  ),
  materialComposition: t(
    "Material composition",
    "Skład materiału",
    "Materialzusammensetzung",
    "Thành phần chất liệu",
  ),
  source: t("Source", "Źródło", "Quelle", "Nguồn"),
  sourceHuman: t("Human review", "Weryfikacja człowieka", "Menschliche Prüfung", "Người duyệt"),
  sourceModel: t("Model suggestion", "Sugestia modelu", "Modellvorschlag", "Đề xuất mô hình"),
  sourceNone: t("Not supplied", "Nie podano", "Nicht angegeben", "Chưa cung cấp"),
  uncertain: t("Uncertain", "Niepewne", "Unsicher", "Chưa chắc chắn"),
  status: t("Product status", "Status produktu", "Produktstatus", "Trạng thái sản phẩm"),
  revision: t("Facts revision", "Wersja danych", "Faktenrevision", "Phiên bản thông tin"),
  updated: t("Last updated", "Ostatnia aktualizacja", "Zuletzt aktualisiert", "Cập nhật lần cuối"),
  draft: t("Draft", "Szkic", "Entwurf", "Bản nháp"),
  published: t("Published", "Opublikowany", "Veröffentlicht", "Đã xuất bản"),
  archived: t("Archived", "Zarchiwizowany", "Archiviert", "Đã lưu trữ"),
  readOnlyTitle: t(
    "Facts are read-only",
    "Dane są tylko do odczytu",
    "Fakten sind schreibgeschützt",
    "Thông tin ở chế độ chỉ đọc",
  ),
  readOnlyDescription: t(
    "Only draft products can be edited. These retained facts remain available for reference.",
    "Edytować można tylko szkice produktów. Zachowane dane pozostają dostępne do wglądu.",
    "Nur Produktentwürfe können bearbeitet werden. Diese gespeicherten Fakten bleiben als Referenz verfügbar.",
    "Chỉ có thể sửa sản phẩm ở trạng thái bản nháp. Những thông tin đã lưu vẫn có thể xem lại.",
  ),
  save: t("Save facts", "Zapisz dane", "Fakten speichern", "Lưu thông tin"),
  saving: t("Saving…", "Zapisywanie…", "Wird gespeichert…", "Đang lưu…"),
  saved: t(
    "Product facts were saved.",
    "Dane produktu zostały zapisane.",
    "Produktfakten wurden gespeichert.",
    "Đã lưu thông tin sản phẩm.",
  ),
  invalid: t(
    "Check the entered facts and try again.",
    "Sprawdź wprowadzone dane i spróbuj ponownie.",
    "Prüfen Sie die eingegebenen Fakten und versuchen Sie es erneut.",
    "Kiểm tra thông tin đã nhập rồi thử lại.",
  ),
  notFound: t(
    "This ProductDraft was not found or is not available to your account.",
    "Nie znaleziono tego szkicu produktu lub nie jest on dostępny dla Twojego konta.",
    "Dieser Produktentwurf wurde nicht gefunden oder ist für Ihr Konto nicht verfügbar.",
    "Không tìm thấy bản nháp sản phẩm này hoặc tài khoản của bạn không có quyền truy cập.",
  ),
  notEditable: t(
    "This ProductDraft is no longer editable because it is not a draft.",
    "Tego szkicu produktu nie można już edytować, ponieważ nie ma statusu szkicu.",
    "Dieser Produktentwurf kann nicht mehr bearbeitet werden, da er kein Entwurf mehr ist.",
    "Không thể sửa bản nháp sản phẩm này vì sản phẩm không còn ở trạng thái bản nháp.",
  ),
  factsMissing: t(
    "This ProductDraft is missing its required facts record. Contact an administrator.",
    "W tym szkicu produktu brakuje wymaganego rekordu danych. Skontaktuj się z administratorem.",
    "Für diesen Produktentwurf fehlt der erforderliche Faktendatensatz. Wenden Sie sich an einen Administrator.",
    "Bản nháp sản phẩm này thiếu bản ghi thông tin bắt buộc. Hãy liên hệ quản trị viên.",
  ),
  unavailable: t(
    "Product facts are temporarily unavailable.",
    "Dane produktu są tymczasowo niedostępne.",
    "Produktfakten sind vorübergehend nicht verfügbar.",
    "Thông tin sản phẩm tạm thời không khả dụng.",
  ),
};

const fieldLabels: Record<ProductDraftFactField, T> = {
  colors: S.colors,
  materialComposition: S.materialComposition,
};

const statusLabels: Record<ProductDraftFactsSnapshot["productStatus"], T> = {
  draft: S.draft,
  published: S.published,
  archived: S.archived,
};

const emptyForm: ProductDraftFactsFormValues = {
  colors: "",
  materialComposition: "",
};

export function ProductDraftFactsEditor({
  productDraftId,
  disabled = false,
  refreshRequest = 0,
  onStateChange,
  onSaved,
}: {
  productDraftId: string;
  disabled?: boolean;
  refreshRequest?: number;
  onStateChange?: (state: ProductDraftFactsEditorState) => void;
  onSaved?: (snapshot: ProductDraftFactsSnapshot) => void;
}) {
  const getFacts = useServerFn(getProductDraftFacts);
  const updateFacts = useServerFn(updateProductDraftFacts);
  const client = useMemo<ProductDraftFactsEditorClient>(
    () => ({
      get: (id) => getFacts({ data: { productDraftId: id } }),
      update: (id, patch, expectedModerationRevision) =>
        updateFacts({ data: { productDraftId: id, patch, expectedModerationRevision } }),
    }),
    [getFacts, updateFacts],
  );

  return (
    <ProductDraftFactsEditorView
      productDraftId={productDraftId}
      client={client}
      disabled={disabled}
      refreshRequest={refreshRequest}
      onStateChange={onStateChange}
      onSaved={onSaved}
    />
  );
}

export function ProductDraftFactsEditorView({
  productDraftId,
  client,
  disabled = false,
  refreshRequest = 0,
  onStateChange,
  onSaved,
}: {
  productDraftId: string;
  client: ProductDraftFactsEditorClient;
  disabled?: boolean;
  refreshRequest?: number;
  onStateChange?: (state: ProductDraftFactsEditorState) => void;
  onSaved?: (snapshot: ProductDraftFactsSnapshot) => void;
}) {
  const [snapshot, setSnapshot] = useState<ProductDraftFactsSnapshot | null>(null);
  const [form, setForm] = useState<ProductDraftFactsFormValues>(emptyForm);
  const [touchedFields, setTouchedFields] = useState<Set<ProductDraftFactField>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadRequest, setLoadRequest] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
    setForm(emptyForm);
    setTouchedFields(new Set());
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setSaveSuccess(false);

    void client
      .get(productDraftId)
      .then((nextSnapshot) => {
        if (cancelled) return;
        replaceSnapshot(nextSnapshot);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(productDraftFactsErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, loadRequest, productDraftId, refreshRequest]);

  function replaceSnapshot(nextSnapshot: ProductDraftFactsSnapshot) {
    setSnapshot(nextSnapshot);
    setForm(factsToFormValues(nextSnapshot.facts));
    setTouchedFields(new Set());
  }

  function changeField(field: ProductDraftFactField, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setTouchedFields((current) => new Set(current).add(field));
    setSaveError(null);
    setSaveSuccess(false);
  }

  const patch = snapshot ? buildProductDraftFactsPatch(form, snapshot.facts, touchedFields) : null;
  const factsDirty = patch !== null;

  useEffect(() => {
    onStateChange?.({ dirty: factsDirty, saving });
  }, [factsDirty, onStateChange, saving]);

  useEffect(
    () => () => {
      onStateChange?.({ dirty: false, saving: false });
    },
    [onStateChange],
  );

  async function save() {
    if (!snapshot?.editable || disabled || !patch || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const nextSnapshot = await client.update(productDraftId, patch, snapshot.moderationRevision);
      replaceSnapshot(nextSnapshot);
      onSaved?.(nextSnapshot);
      setSaveSuccess(true);
    } catch (error) {
      setSaveError(productDraftFactsErrorMessage(error));
      if (productDraftFactsErrorCode(error) === "product_draft_facts_not_editable") {
        try {
          replaceSnapshot(await client.get(productDraftId));
        } catch {
          // Preserve the stable update error if the refresh also fails.
        }
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">{tr(S.loading)}</CardContent>
      </Card>
    );
  }

  if (!snapshot && loadError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{tr(S.loadErrorTitle)}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{loadError}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLoadRequest((n) => n + 1)}
          >
            {tr(S.retry)}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!snapshot) return null;

  const controlsDisabled = !snapshot.editable || disabled || saving;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <CardTitle>
              <h2>{tr(S.title)}</h2>
            </CardTitle>
            <CardDescription className="mt-2">{tr(S.description)}</CardDescription>
          </div>
          <Badge variant={snapshot.editable ? "secondary" : "outline"}>
            {tr(statusLabels[snapshot.productStatus])}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!snapshot.editable ? (
          <Alert>
            <AlertTitle>{tr(S.readOnlyTitle)}</AlertTitle>
            <AlertDescription>{tr(S.readOnlyDescription)}</AlertDescription>
          </Alert>
        ) : null}

        {saveError ? (
          <Alert variant="destructive">
            <AlertTitle>{tr(S.saveErrorTitle)}</AlertTitle>
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        ) : null}

        {saveSuccess ? (
          <Alert>
            <AlertDescription>{tr(S.saved)}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2">
          <FactControl
            field="colors"
            snapshot={snapshot}
            help={tr(S.colorsHelp)}
            value={form.colors}
            disabled={controlsDisabled}
            multiline
            onChange={changeField}
          />
          <FactControl
            field="materialComposition"
            snapshot={snapshot}
            help={null}
            value={form.materialComposition}
            disabled={controlsDisabled}
            onChange={changeField}
          />
        </div>

        <div className="grid gap-3 border-t border-border pt-4 text-xs text-muted-foreground sm:grid-cols-3">
          <Metadata label={tr(S.status)} value={tr(statusLabels[snapshot.productStatus])} />
          <Metadata label={tr(S.revision)} value={String(snapshot.factsRevision)} />
          <Metadata label={tr(S.updated)} value={formatUpdatedAt(snapshot.updatedAt)} />
        </div>

        {snapshot.editable ? (
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={disabled || !patch || saving}
              onClick={() => void save()}
            >
              {saving ? tr(S.saving) : tr(S.save)}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FactControl({
  field,
  snapshot,
  help,
  value,
  disabled,
  multiline = false,
  onChange,
}: {
  field: ProductDraftFactField;
  snapshot: ProductDraftFactsSnapshot;
  help: string | null;
  value: string;
  disabled: boolean;
  multiline?: boolean;
  onChange(field: ProductDraftFactField, value: string): void;
}) {
  const inputId = `product-draft-fact-${field}`;
  const source = snapshot.facts.fieldSources[field];
  const uncertain = snapshot.facts.uncertainFields.includes(field);
  const inputClassName =
    "w-full border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">
          {tr(fieldLabels[field])}
        </label>
        {uncertain ? <Badge variant="outline">{tr(S.uncertain)}</Badge> : null}
      </div>
      {multiline ? (
        <textarea
          id={inputId}
          rows={4}
          value={value}
          disabled={disabled}
          className={inputClassName}
          onChange={(event) => onChange(field, event.target.value)}
        />
      ) : (
        <input
          id={inputId}
          value={value}
          disabled={disabled}
          className={inputClassName}
          onChange={(event) => onChange(field, event.target.value)}
        />
      )}
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
      <p className="text-xs text-muted-foreground">
        {tr(S.source)}: {sourceLabel(source)}
      </p>
    </div>
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="uppercase tracking-wide">{label}</div>
      <div className="mt-1 break-words text-foreground">{value}</div>
    </div>
  );
}

function sourceLabel(source: "human" | "model" | null): string {
  if (source === "human") return tr(S.sourceHuman);
  if (source === "model") return tr(S.sourceModel);
  return tr(S.sourceNone);
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function productDraftFactsErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function productDraftFactsErrorMessage(error: unknown): string {
  switch (productDraftFactsErrorCode(error)) {
    case "product_draft_facts_invalid":
      return tr(S.invalid);
    case "product_draft_not_found":
      return tr(S.notFound);
    case "product_draft_facts_not_editable":
      return tr(S.notEditable);
    case "product_draft_facts_missing":
      return tr(S.factsMissing);
    default:
      return tr(S.unavailable);
  }
}
