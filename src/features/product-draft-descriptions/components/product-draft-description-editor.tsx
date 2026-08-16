import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { t, tr, type T } from "@/lib/i18n";

import {
  normalizeProductDraftDescriptionPatch,
  PRODUCT_DRAFT_DESCRIPTION_LANGUAGES,
  type ProductDraftDescriptionEntry,
  type ProductDraftDescriptionLanguage,
  type ProductDraftDescriptionPatch,
  type ProductDraftDescriptionSnapshot,
} from "../product-draft-descriptions.types";

export type ProductDraftDescriptionEditorClient = {
  get(productDraftId: string): Promise<ProductDraftDescriptionSnapshot>;
  update(
    productDraftId: string,
    descriptions: ProductDraftDescriptionPatch,
    expectedModerationRevision: number,
  ): Promise<ProductDraftDescriptionSnapshot>;
};

export type ProductDraftDescriptionEditorState = {
  dirty: boolean;
  saving: boolean;
};

export type ProductDraftDescriptionReadState = {
  loading: boolean;
  available: boolean;
};

export type ProductDraftDescriptionEditorHandle = {
  refresh(): Promise<ProductDraftDescriptionSnapshot>;
  replaceSnapshot(snapshot: ProductDraftDescriptionSnapshot): void;
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
    "Each description must contain at most 300 characters.",
    "Każdy opis może zawierać maksymalnie 300 znaków.",
    "Jede Beschreibung darf höchstens 300 Zeichen enthalten.",
    "Mỗi mô tả chỉ được chứa tối đa 300 ký tự.",
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
  generationActive: t(
    "Description editing is temporarily disabled while descriptions are generated.",
    "Edycja opisów jest tymczasowo wyłączona podczas generowania opisów.",
    "Die Bearbeitung der Beschreibungen ist während der Generierung vorübergehend deaktiviert.",
    "Tạm thời không thể chỉnh sửa mô tả trong khi đang tạo mô tả.",
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
  factsRevision: t("Facts revision", "Wersja danych", "Faktenrevision", "Phiên bản thông tin"),
  provider: t("Provider", "Dostawca", "Anbieter", "Nhà cung cấp"),
  modelName: t("Model", "Model", "Modell", "Mô hình"),
  updated: t("Last updated", "Ostatnia aktualizacja", "Zuletzt aktualisiert", "Cập nhật lần cuối"),
};

const languageLabels: Record<ProductDraftDescriptionLanguage, T> = {
  pl: t("Polish", "Polski", "Polnisch", "Tiếng Ba Lan"),
  en: t("English", "Angielski", "Englisch", "Tiếng Anh"),
  de: t("German", "Niemiecki", "Deutsch", "Tiếng Đức"),
  vi: t("Vietnamese", "Wietnamski", "Vietnamesisch", "Tiếng Việt"),
};

type DescriptionForm = Record<ProductDraftDescriptionLanguage, string>;

const emptyForm: DescriptionForm = { pl: "", en: "", de: "", vi: "" };

export const ProductDraftDescriptionEditor = forwardRef<
  ProductDraftDescriptionEditorHandle,
  {
    productDraftId: string;
    client: ProductDraftDescriptionEditorClient;
    disabled?: boolean;
    disabledReason?: "publication" | "generation";
    onStateChange?(state: ProductDraftDescriptionEditorState): void;
    onReadStateChange?(state: ProductDraftDescriptionReadState): void;
    onSnapshotChange?(snapshot: ProductDraftDescriptionSnapshot): void;
    onSaved?(snapshot: ProductDraftDescriptionSnapshot): void;
  }
>(function ProductDraftDescriptionEditor(
  {
    productDraftId,
    client,
    disabled = false,
    disabledReason = "publication",
    onStateChange,
    onReadStateChange,
    onSnapshotChange,
    onSaved,
  },
  ref,
) {
  const [snapshot, setSnapshot] = useState<ProductDraftDescriptionSnapshot | null>(null);
  const [form, setForm] = useState<DescriptionForm>(emptyForm);
  const [touched, setTouched] = useState<Set<ProductDraftDescriptionLanguage>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadRequest, setLoadRequest] = useState(0);
  const snapshotRef = useRef(snapshot);
  const formRef = useRef(form);
  const touchedRef = useRef(touched);

  snapshotRef.current = snapshot;
  formRef.current = form;
  touchedRef.current = touched;

  const applySnapshot = useCallback(
    (next: ProductDraftDescriptionSnapshot, preserveDirty: boolean) => {
      const nextForm = formFromSnapshot(next);
      const nextTouched = new Set<ProductDraftDescriptionLanguage>();
      if (preserveDirty && snapshotRef.current) {
        const dirtyLanguages = changedLanguages(
          snapshotRef.current,
          formRef.current,
          touchedRef.current,
        );
        for (const language of dirtyLanguages) nextForm[language] = formRef.current[language];
        for (const language of PRODUCT_DRAFT_DESCRIPTION_LANGUAGES) {
          if (normalizeForComparison(nextForm[language]) !== savedText(next, language)) {
            nextTouched.add(language);
          }
        }
      }
      snapshotRef.current = next;
      formRef.current = nextForm;
      touchedRef.current = nextTouched;
      setSnapshot(next);
      setForm(nextForm);
      setTouched(nextTouched);
      onSnapshotChange?.(next);
    },
    [onSnapshotChange],
  );

  const refresh = useCallback(async () => {
    try {
      const next = await client.get(productDraftId);
      setLoadError(null);
      applySnapshot(next, true);
      onReadStateChange?.({ loading: false, available: true });
      return next;
    } catch (error) {
      setLoadError(descriptionErrorMessage(error));
      onReadStateChange?.({ loading: false, available: false });
      throw error;
    }
  }, [applySnapshot, client, onReadStateChange, productDraftId]);

  useImperativeHandle(
    ref,
    () => ({
      refresh,
      replaceSnapshot(next) {
        setLoadError(null);
        applySnapshot(next, false);
        onReadStateChange?.({ loading: false, available: true });
      },
    }),
    [applySnapshot, onReadStateChange, refresh],
  );

  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
    setForm(emptyForm);
    setTouched(new Set());
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setSaved(false);
    onReadStateChange?.({ loading: true, available: false });

    void client
      .get(productDraftId)
      .then((next) => {
        if (cancelled) return;
        applySnapshot(next, false);
        onReadStateChange?.({ loading: false, available: true });
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(descriptionErrorMessage(error));
        onReadStateChange?.({ loading: false, available: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applySnapshot, client, loadRequest, onReadStateChange, productDraftId]);

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
      onReadStateChange?.({ loading: false, available: false });
    },
    [onReadStateChange, onStateChange],
  );

  async function save() {
    if (!snapshot || !snapshotIsEditable(snapshot) || disabled || !patch || saving || loadError) {
      return;
    }
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
      const nextSnapshot = await client.update(
        productDraftId,
        normalizedPatch,
        snapshot.moderationRevision,
      );
      applySnapshot(nextSnapshot, false);
      onSaved?.(nextSnapshot);
      setSaved(true);
    } catch (error) {
      setSaveError(descriptionErrorMessage(error));
      if (descriptionErrorCode(error) === "product_draft_description_not_editable") {
        try {
          applySnapshot(await client.get(productDraftId), false);
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
            onClick={() => setLoadRequest((n) => n + 1)}
          >
            {tr(S.retry)}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!snapshot) return null;

  const editable = snapshotIsEditable(snapshot) && !disabled && !loadError;
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
            <AlertDescription>
              {tr(disabledReason === "generation" ? S.generationActive : S.publicationActive)}
            </AlertDescription>
          </Alert>
        ) : null}
        {loadError ? (
          <Alert variant="destructive">
            <AlertTitle>{tr(S.loadErrorTitle)}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{loadError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refresh().catch(() => undefined)}
              >
                {tr(S.retry)}
              </Button>
            </AlertDescription>
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
                  className="w-full border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                  onChange={(event) => {
                    const next = { ...formRef.current, [language]: event.target.value };
                    const nextTouched = new Set(touchedRef.current).add(language);
                    formRef.current = next;
                    touchedRef.current = nextTouched;
                    setForm(next);
                    setTouched(nextTouched);
                    setSaveError(null);
                    setSaved(false);
                  }}
                />
                <DescriptionMetadata entry={entry} />
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
});

function DescriptionMetadata({ entry }: { entry: ProductDraftDescriptionEntry | undefined }) {
  return (
    <span className="grid gap-1 text-xs text-muted-foreground">
      <span>
        {tr(S.source)}: {sourceLabel(entry?.source ?? null)}
      </span>
      <span>
        {tr(S.factsRevision)}: {entry?.factsRevision ?? tr(S.notSet)}
      </span>
      {entry?.provider ? (
        <span>
          {tr(S.provider)}: {entry.provider}
        </span>
      ) : null}
      {entry?.model ? (
        <span>
          {tr(S.modelName)}: {entry.model}
        </span>
      ) : null}
      <span>
        {tr(S.updated)}: {formatUpdatedAt(entry?.updatedAt ?? null)}
      </span>
    </span>
  );
}

function formFromSnapshot(snapshot: ProductDraftDescriptionSnapshot): DescriptionForm {
  return Object.fromEntries(
    snapshot.descriptions.map((description) => [description.language, description.text ?? ""]),
  ) as DescriptionForm;
}

function changedLanguages(
  snapshot: ProductDraftDescriptionSnapshot,
  form: DescriptionForm,
  touched: Set<ProductDraftDescriptionLanguage>,
): Set<ProductDraftDescriptionLanguage> {
  return new Set(
    Object.keys(
      buildDescriptionPatch(snapshot, form, touched) ?? {},
    ) as ProductDraftDescriptionLanguage[],
  );
}

function savedText(
  snapshot: ProductDraftDescriptionSnapshot,
  language: ProductDraftDescriptionLanguage,
): string | null {
  return snapshot.descriptions.find((entry) => entry.language === language)?.text ?? null;
}

function buildDescriptionPatch(
  snapshot: ProductDraftDescriptionSnapshot | null,
  form: DescriptionForm,
  touched: Set<ProductDraftDescriptionLanguage>,
): ProductDraftDescriptionPatch | null {
  if (!snapshot || touched.size === 0) return null;
  const patch: ProductDraftDescriptionPatch = {};
  for (const language of touched) {
    const current = normalizeForComparison(form[language]);
    if (current !== savedText(snapshot, language)) patch[language] = current;
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

function formatUpdatedAt(value: string | null): string {
  if (!value) return tr(S.notSet);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? tr(S.notSet) : date.toLocaleString();
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
