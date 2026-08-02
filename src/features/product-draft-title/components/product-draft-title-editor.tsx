import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { t, tr, type T } from "@/lib/i18n";

import { getProductDraftTitle, updateProductDraftTitle } from "../product-draft-title.functions";
import {
  normalizeProductDraftTitle,
  type ProductDraftTitleSnapshot,
} from "../product-draft-title.types";

export type ProductDraftTitleEditorClient = {
  get(productDraftId: string): Promise<ProductDraftTitleSnapshot>;
  update(productDraftId: string, title: string): Promise<ProductDraftTitleSnapshot>;
};

type ProductDraftTitleEditorProps = {
  productDraftId: string;
  onSnapshot?(snapshot: ProductDraftTitleSnapshot): void;
};

const S = {
  heading: t("Product title", "Tytuł produktu", "Produkttitel", "Tên sản phẩm"),
  description: t(
    "Set the listing title shown to buyers.",
    "Ustaw tytuł oferty wyświetlany kupującym.",
    "Legen Sie den für Käufer sichtbaren Angebotstitel fest.",
    "Đặt tên niêm yết hiển thị cho người mua.",
  ),
  loading: t(
    "Loading product title…",
    "Ładowanie tytułu…",
    "Produkttitel wird geladen…",
    "Đang tải tên sản phẩm…",
  ),
  save: t("Save title", "Zapisz tytuł", "Titel speichern", "Lưu tên"),
  saving: t("Saving…", "Zapisywanie…", "Speichern…", "Đang lưu…"),
  saved: t(
    "Product title was saved.",
    "Tytuł produktu został zapisany.",
    "Der Produkttitel wurde gespeichert.",
    "Đã lưu tên sản phẩm.",
  ),
  readOnly: t(
    "The title is read-only after the ProductDraft leaves draft status.",
    "Tytuł jest tylko do odczytu po opuszczeniu statusu szkicu.",
    "Der Titel ist schreibgeschützt, sobald der Produktentwurf den Entwurfsstatus verlässt.",
    "Tên chỉ có thể đọc sau khi bản nháp sản phẩm rời trạng thái nháp.",
  ),
  source: t("Source", "Źródło", "Quelle", "Nguồn"),
  human: t("Human", "Człowiek", "Mensch", "Con người"),
  model: t("Model suggestion", "Sugestia modelu", "Modellvorschlag", "Đề xuất của mô hình"),
  noSource: t("Not set", "Nie ustawiono", "Nicht festgelegt", "Chưa đặt"),
  loadError: t(
    "Product title could not be loaded",
    "Nie można załadować tytułu produktu",
    "Der Produkttitel konnte nicht geladen werden",
    "Không thể tải tên sản phẩm",
  ),
  saveError: t(
    "Product title could not be saved",
    "Nie można zapisać tytułu produktu",
    "Der Produkttitel konnte nicht gespeichert werden",
    "Không thể lưu tên sản phẩm",
  ),
  invalid: t(
    "Enter at most 50 characters.",
    "Wprowadź maksymalnie 50 znaków.",
    "Geben Sie höchstens 50 Zeichen ein.",
    "Nhập tối đa 50 ký tự.",
  ),
  notFound: t(
    "This ProductDraft was not found.",
    "Nie znaleziono tego szkicu produktu.",
    "Dieser Produktentwurf wurde nicht gefunden.",
    "Không tìm thấy bản nháp sản phẩm này.",
  ),
  notEditable: t(
    "This ProductDraft title is no longer editable.",
    "Tytułu tego szkicu produktu nie można już edytować.",
    "Dieser Produktentwurfstitel kann nicht mehr bearbeitet werden.",
    "Tên bản nháp sản phẩm này không còn chỉnh sửa được.",
  ),
  unavailable: t(
    "Product title is temporarily unavailable.",
    "Tytuł produktu jest tymczasowo niedostępny.",
    "Der Produkttitel ist vorübergehend nicht verfügbar.",
    "Tên sản phẩm tạm thời không khả dụng.",
  ),
};

export function ProductDraftTitleEditor(props: ProductDraftTitleEditorProps) {
  const getTitle = useServerFn(getProductDraftTitle);
  const updateTitle = useServerFn(updateProductDraftTitle);
  const client = useMemo<ProductDraftTitleEditorClient>(
    () => ({
      get: (productDraftId) => getTitle({ data: { productDraftId } }),
      update: (productDraftId, title) => updateTitle({ data: { productDraftId, title } }),
    }),
    [getTitle, updateTitle],
  );
  return <ProductDraftTitleEditorView {...props} client={client} />;
}

export function ProductDraftTitleEditorView({
  productDraftId,
  client,
  onSnapshot,
}: ProductDraftTitleEditorProps & { client: ProductDraftTitleEditorClient }) {
  const [snapshot, setSnapshot] = useState<ProductDraftTitleSnapshot | null>(null);
  const [title, setTitle] = useState("");
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const onSnapshotRef = useRef(onSnapshot);

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);

  const replaceSnapshot = useCallback((nextSnapshot: ProductDraftTitleSnapshot) => {
    setSnapshot(nextSnapshot);
    setTitle(nextSnapshot.title);
    setTouched(false);
    onSnapshotRef.current?.(nextSnapshot);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setSaved(false);
    void client
      .get(productDraftId)
      .then((nextSnapshot) => {
        if (cancelled) return;
        replaceSnapshot(nextSnapshot);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(titleErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, productDraftId, replaceSnapshot]);

  const normalizedTitle = normalizeForComparison(title);
  const changed = Boolean(snapshot && touched && normalizedTitle !== snapshot.title);

  async function save() {
    if (!snapshot?.editable || !changed || saving) return;
    try {
      normalizeProductDraftTitle(title);
    } catch {
      setSaveError(tr(S.invalid));
      setSaved(false);
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const nextSnapshot = await client.update(productDraftId, title);
      replaceSnapshot(nextSnapshot);
      setSaved(true);
    } catch (error) {
      setSaveError(titleErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{tr(S.heading)}</h2>
        </CardTitle>
        <CardDescription>{tr(S.description)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">{tr(S.loading)}</p> : null}
        {loadError ? (
          <Alert variant="destructive">
            <AlertTitle>{tr(S.loadError)}</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : null}
        {snapshot ? (
          <>
            <label className="grid gap-2 text-sm">
              <span className="font-medium">{tr(S.heading)}</span>
              <input
                value={title}
                disabled={!snapshot.editable || saving}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setTouched(true);
                  setSaveError(null);
                  setSaved(false);
                }}
                className="border border-border bg-background px-3 py-2 text-sm disabled:opacity-70"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              {tr(S.source)}: {tr(sourceLabel(snapshot.titleSource))}
            </p>
            {!snapshot.editable ? (
              <p className="text-sm text-muted-foreground">{tr(S.readOnly)}</p>
            ) : null}
            {saveError ? (
              <Alert variant="destructive">
                <AlertTitle>{tr(S.saveError)}</AlertTitle>
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            ) : null}
            {saved ? <p className="text-sm text-muted-foreground">{tr(S.saved)}</p> : null}
            {snapshot.editable ? (
              <Button type="button" disabled={!changed || saving} onClick={() => void save()}>
                {tr(saving ? S.saving : S.save)}
              </Button>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function normalizeForComparison(value: string): string {
  try {
    return normalizeProductDraftTitle(value);
  } catch {
    return value;
  }
}

function sourceLabel(source: ProductDraftTitleSnapshot["titleSource"]): T {
  return source === "human" ? S.human : source === "model" ? S.model : S.noSource;
}

function titleErrorMessage(error: unknown): string {
  const code = titleErrorCode(error);
  if (code === "product_draft_title_invalid") return tr(S.invalid);
  if (code === "product_draft_not_found") return tr(S.notFound);
  if (code === "product_draft_title_not_editable") return tr(S.notEditable);
  return tr(S.unavailable);
}

function titleErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  if ("code" in error && typeof error.code === "string") return error.code;

  const message = "message" in error && typeof error.message === "string" ? error.message : null;
  if (message === "The ProductDraft title is invalid.") {
    return "product_draft_title_invalid";
  }
  if (message === "The ProductDraft was not found.") {
    return "product_draft_not_found";
  }
  if (message === "The ProductDraft title can only be changed while the product is a draft.") {
    return "product_draft_title_not_editable";
  }

  return "cause" in error ? titleErrorCode(error.cause) : null;
}
