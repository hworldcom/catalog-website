import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { t, tr, type T } from "@/lib/i18n";

import {
  normalizeProductDraftDescriptionPatch,
  PRODUCT_DRAFT_DESCRIPTION_LANGUAGES,
  type ProductDraftDescriptionLanguage,
  type ProductDraftDescriptionPatch,
  type ProductDraftDescriptionSnapshot,
} from "../product-draft-descriptions.types";

export type ProductDraftDescriptionEditorClient = {
  get(productDraftId: string): Promise<ProductDraftDescriptionSnapshot>;
  update(
    productDraftId: string,
    descriptions: ProductDraftDescriptionPatch,
  ): Promise<ProductDraftDescriptionSnapshot>;
};

export type ProductDraftDescriptionEditorState = {
  dirty: boolean;
  saving: boolean;
};

const S = {
  title: t("Product descriptions", "Opisy produktu", "Produktbeschreibungen", "Mô tả sản phẩm"),
  description: t(
    "Write or revise the description for each language. Descriptions are not generated automatically.",
    "Napisz lub popraw opis w każdym języku. Opisy nie są generowane automatycznie.",
    "Schreiben oder überarbeiten Sie die Beschreibung für jede Sprache. Beschreibungen werden nicht automatisch erstellt.",
    "Viết hoặc chỉnh sửa mô tả cho từng ngôn ngữ. Mô tả không được tạo tự động.",
  ),
  loading: t(
    "Loading product descriptions…",
    "Ładowanie opisów produktu…",
    "Produktbeschreibungen werden geladen…",
    "Đang tải mô tả sản phẩm…",
  ),
  loadErrorTitle: t(
    "Product descriptions could not be loaded",
    "Nie można załadować opisów produktu",
    "Produktbeschreibungen konnten nicht geladen werden",
    "Không thể tải mô tả sản phẩm",
  ),
  saveErrorTitle: t(
    "Product descriptions could not be saved",
    "Nie można zapisać opisów produktu",
    "Produktbeschreibungen konnten nicht gespeichert werden",
    "Không thể lưu mô tả sản phẩm",
  ),
  unavailable: t(
    "Product descriptions are temporarily unavailable.",
    "Opisy produktu są tymczasowo niedostępne.",
    "Produktbeschreibungen sind vorübergehend nicht verfügbar.",
    "Mô tả sản phẩm tạm thời không khả dụng.",
  ),
  invalid: t(
    "Each description must contain at most 8,000 characters.",
    "Każdy opis może zawierać maksymalnie 8000 znaków.",
    "Jede Beschreibung darf höchstens 8.000 Zeichen enthalten.",
    "Mỗi mô tả chỉ được chứa tối đa 8.000 ký tự.",
  ),
  notFound: t(
    "This ProductDraft was not found.",
    "Nie znaleziono tego szkicu produktu.",
    "Dieser Produktentwurf wurde nicht gefunden.",
    "Không tìm thấy bản nháp sản phẩm này.",
  ),
  notEditable: t(
    "Descriptions are read-only because this product is no longer a draft.",
    "Opisy są tylko do odczytu, ponieważ produkt nie jest już szkicem.",
    "Beschreibungen sind schreibgeschützt, da dieses Produkt kein Entwurf mehr ist.",
    "Mô tả chỉ có thể đọc vì sản phẩm này không còn là bản nháp.",
  ),
  publicationActive: t(
    "Description editing is temporarily disabled while publication is active.",
    "Edycja opisów jest tymczasowo wyłączona podczas publikacji.",
    "Die Bearbeitung der Beschreibungen ist während der Veröffentlichung vorübergehend deaktiviert.",
    "Tạm thời không thể chỉnh sửa mô tả trong khi đang xuất bản.",
  ),
  retry: t("Try again", "Spróbuj ponownie", "Erneut versuchen", "Thử lại"),
  save: t("Save descriptions", "Zapisz opisy", "Beschreibungen speichern", "Lưu mô tả"),
  saving: t("Saving…", "Zapisywanie…", "Wird gespeichert…", "Đang lưu…"),
  saved: t(
    "Product descriptions were saved.",
    "Opisy produktu zostały zapisane.",
    "Produktbeschreibungen wurden gespeichert.",
    "Đã lưu mô tả sản phẩm.",
  ),
  source: t("Source", "Źródło", "Quelle", "Nguồn"),
  human: t("Human", "Człowiek", "Mensch", "Con người"),
  model: t("Model suggestion", "Sugestia modelu", "Modellvorschlag", "Đề xuất mô hình"),
  notSet: t("Not set", "Nie ustawiono", "Nicht festgelegt", "Chưa đặt"),
  outdated: t(
    "Older than the current product facts",
    "Starszy niż bieżące dane produktu",
    "Älter als die aktuellen Produktfakten",
    "Cũ hơn thông tin sản phẩm hiện tại",
  ),
};

const languageLabels: Record<ProductDraftDescriptionLanguage, T> = {
  pl: t("Polish", "Polski", "Polnisch", "Tiếng Ba Lan"),
  en: t("English", "Angielski", "Englisch", "Tiếng Anh"),
  de: t("German", "Niemiecki", "Deutsch", "Tiếng Đức"),
  vi: t("Vietnamese", "Wietnamski", "Vietnamesisch", "Tiếng Việt"),
};

type DescriptionForm = Record<ProductDraftDescriptionLanguage, string>;

const emptyForm: DescriptionForm = {
  pl: "",
  en: "",
  de: "",
  vi: "",
};

export function ProductDraftDescriptionEditor({
  productDraftId,
  client,
  disabled = false,
  onStateChange,
}: {
  productDraftId: string;
  client: ProductDraftDescriptionEditorClient;
  disabled?: boolean;
  onStateChange?(state: ProductDraftDescriptionEditorState): void;
}) {
  const [snapshot, setSnapshot] = useState<ProductDraftDescriptionSnapshot | null>(null);
  const [form, setForm] = useState<DescriptionForm>(emptyForm);
  const [touched, setTouched] = useState<Set<ProductDraftDescriptionLanguage>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadRequest, setLoadRequest] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
    setForm(emptyForm);
    setTouched(new Set());
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setSaved(false);

    void client
      .get(productDraftId)
      .then((next) => {
        if (!cancelled) replaceSnapshot(next);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(descriptionErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, loadRequest, productDraftId]);

  function replaceSnapshot(next: ProductDraftDescriptionSnapshot) {
    setSnapshot(next);
    setForm(
      Object.fromEntries(
        next.descriptions.map((description) => [description.language, description.text ?? ""]),
      ) as DescriptionForm,
    );
    setTouched(new Set());
  }

  const patch = useMemo(
    () => buildDescriptionPatch(snapshot, form, touched),
    [form, snapshot, touched],
  );
  const dirty = patch !== null;

  useEffect(() => {
    onStateChange?.({ dirty, saving });
  }, [dirty, onStateChange, saving]);

  useEffect(
    () => () => {
      onStateChange?.({ dirty: false, saving: false });
    },
    [onStateChange],
  );

  async function save() {
    if (!snapshot || !snapshotIsEditable(snapshot) || disabled || !patch || saving) return;
    let normalizedPatch: ProductDraftDescriptionPatch;
    try {
      normalizedPatch = normalizeProductDraftDescriptionPatch(patch);
    } catch {
      setSaveError(tr(S.invalid));
      setSaved(false);
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      replaceSnapshot(await client.update(productDraftId, normalizedPatch));
      setSaved(true);
    } catch (error) {
      setSaveError(descriptionErrorMessage(error));
      if (descriptionErrorCode(error) === "product_draft_description_not_editable") {
        try {
          replaceSnapshot(await client.get(productDraftId));
        } catch {
          // Keep the stable update error if the canonical refresh also fails.
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
            onClick={() => setLoadRequest((value) => value + 1)}
          >
            {tr(S.retry)}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!snapshot) return null;

  const editable = snapshotIsEditable(snapshot) && !disabled;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{tr(S.title)}</h2>
        </CardTitle>
        <CardDescription>{tr(S.description)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!snapshotIsEditable(snapshot) ? (
          <Alert>
            <AlertDescription>{tr(S.notEditable)}</AlertDescription>
          </Alert>
        ) : null}
        {snapshotIsEditable(snapshot) && disabled ? (
          <Alert>
            <AlertDescription>{tr(S.publicationActive)}</AlertDescription>
          </Alert>
        ) : null}
        {saveError ? (
          <Alert variant="destructive">
            <AlertTitle>{tr(S.saveErrorTitle)}</AlertTitle>
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        ) : null}
        {saved ? (
          <Alert>
            <AlertDescription>{tr(S.saved)}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          {PRODUCT_DRAFT_DESCRIPTION_LANGUAGES.map((language) => {
            const entry = snapshot.descriptions.find(
              (description) => description.language === language,
            );
            return (
              <label key={language} className="grid gap-2 text-sm">
                <span className="flex flex-wrap items-center justify-between gap-2 font-medium">
                  {tr(languageLabels[language])}
                  {entry?.outdated ? <Badge variant="outline">{tr(S.outdated)}</Badge> : null}
                </span>
                <textarea
                  rows={7}
                  value={form[language]}
                  disabled={!editable || saving}
                  maxLength={8000}
                  className="w-full border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                  onChange={(event) => {
                    setForm((current) => ({ ...current, [language]: event.target.value }));
                    setTouched((current) => new Set(current).add(language));
                    setSaveError(null);
                    setSaved(false);
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  {tr(S.source)}: {sourceLabel(entry?.source ?? null)}
                </span>
              </label>
            );
          })}
        </div>

        {editable ? (
          <div className="flex justify-end">
            <Button type="button" disabled={!patch || saving} onClick={() => void save()}>
              {saving ? tr(S.saving) : tr(S.save)}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function buildDescriptionPatch(
  snapshot: ProductDraftDescriptionSnapshot | null,
  form: DescriptionForm,
  touched: Set<ProductDraftDescriptionLanguage>,
): ProductDraftDescriptionPatch | null {
  if (!snapshot || touched.size === 0) return null;

  const patch: ProductDraftDescriptionPatch = {};
  for (const language of touched) {
    const saved =
      snapshot.descriptions.find((description) => description.language === language)?.text ?? null;
    const current = normalizeForComparison(form[language]);
    if (current !== saved) patch[language] = current;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

function normalizeForComparison(value: string): string | null {
  return value.replace(/\r\n?/g, "\n").trim() || null;
}

function snapshotIsEditable(snapshot: ProductDraftDescriptionSnapshot): boolean {
  return snapshot.productStatus === "draft";
}

function sourceLabel(source: "human" | "model" | null): string {
  if (source === "human") return tr(S.human);
  if (source === "model") return tr(S.model);
  return tr(S.notSet);
}

function descriptionErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function descriptionErrorMessage(error: unknown): string {
  switch (descriptionErrorCode(error)) {
    case "product_draft_description_invalid":
      return tr(S.invalid);
    case "product_draft_not_found":
      return tr(S.notFound);
    case "product_draft_description_not_editable":
      return tr(S.notEditable);
    default:
      return tr(S.unavailable);
  }
}
