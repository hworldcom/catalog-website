import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { generateMyProductDraftDescriptions } from "@/features/product-draft-description-generation/product-draft-description-generation.functions";
import type { ProductDraftTitleSnapshot } from "@/features/product-draft-title/product-draft-title.types";
import { t, tr } from "@/lib/i18n";

import {
  getMyProductDraftDescriptions,
  updateMyProductDraftDescriptions,
} from "../product-draft-descriptions.functions";
import type {
  ProductDraftDescriptionPatch,
  ProductDraftDescriptionSnapshot,
} from "../product-draft-descriptions.types";
import {
  ProductDraftDescriptionEditor,
  type ProductDraftDescriptionEditorClient,
  type ProductDraftDescriptionEditorHandle,
  type ProductDraftDescriptionEditorState,
  type ProductDraftDescriptionReadState,
} from "./product-draft-description-editor";

export type SellerDescriptionCoordinationState = {
  product: {
    dirty: boolean;
    saving: boolean;
    publicationActive: boolean;
  };
  facts: {
    dirty: boolean;
    saving: boolean;
  };
};

export type SellerProductDraftDescriptionClient = ProductDraftDescriptionEditorClient & {
  generate(productDraftId: string): Promise<{
    descriptionSnapshot: ProductDraftDescriptionSnapshot;
    titleSnapshot: ProductDraftTitleSnapshot;
  }>;
};

export type DescriptionGenerationRefreshScope = "product" | "product_and_facts";

const cleanEditorState: ProductDraftDescriptionEditorState = { dirty: false, saving: false };
const initialReadState: ProductDraftDescriptionReadState = { loading: true, available: false };

const S = {
  title: t(
    "Generate product descriptions",
    "Generuj opisy produktu",
    "Produktbeschreibungen generieren",
    "Tạo mô tả sản phẩm",
  ),
  introduction: t(
    "Generate concise draft text from the selected cover, reviewed category, and product facts. Review every result before using it.",
    "Wygeneruj zwięzły tekst roboczy na podstawie wybranego zdjęcia głównego, sprawdzonej kategorii i danych produktu. Sprawdź każdy wynik przed użyciem.",
    "Erstellen Sie einen kurzen Entwurf anhand des ausgewählten Titelbilds, der geprüften Kategorie und der Produktfakten. Prüfen Sie jedes Ergebnis vor der Verwendung.",
    "Tạo bản nháp ngắn gọn từ ảnh bìa đã chọn, danh mục đã duyệt và thông tin sản phẩm. Hãy xem lại mọi kết quả trước khi sử dụng.",
  ),
  generate: t("Generate descriptions", "Generuj opisy", "Beschreibungen generieren", "Tạo mô tả"),
  generating: t("Generating…", "Generowanie…", "Wird generiert…", "Đang tạo…"),
  generated: t(
    "Draft descriptions were generated. Review and edit them before publication.",
    "Wygenerowano robocze opisy. Sprawdź i popraw je przed publikacją.",
    "Die Beschreibungsentwürfe wurden erstellt. Prüfen und bearbeiten Sie sie vor der Veröffentlichung.",
    "Đã tạo bản nháp mô tả. Hãy xem lại và chỉnh sửa trước khi xuất bản.",
  ),
  unreviewed: t(
    "Model-generated text is unreviewed draft content.",
    "Tekst wygenerowany przez model jest niezweryfikowaną treścią roboczą.",
    "Modellgenerierter Text ist ein ungeprüfter Entwurf.",
    "Nội dung do mô hình tạo là bản nháp chưa được duyệt.",
  ),
  confirm: t(
    "Some descriptions already contain text. Regenerate model-owned or missing descriptions? Human-edited descriptions will be preserved.",
    "Niektóre opisy zawierają już tekst. Wygenerować ponownie opisy modelowe lub brakujące? Opisy poprawione przez człowieka zostaną zachowane.",
    "Einige Beschreibungen enthalten bereits Text. Modellbasierte oder fehlende Beschreibungen neu erstellen? Manuell bearbeitete Beschreibungen bleiben erhalten.",
    "Một số mô tả đã có nội dung. Tạo lại mô tả do mô hình sở hữu hoặc còn thiếu? Mô tả do người chỉnh sửa sẽ được giữ nguyên.",
  ),
  categoryMissing: t(
    "Assign and save a category before generating descriptions.",
    "Przypisz i zapisz kategorię przed wygenerowaniem opisów.",
    "Weisen Sie vor der Generierung eine Kategorie zu und speichern Sie sie.",
    "Gán và lưu danh mục trước khi tạo mô tả.",
  ),
  notDraft: t(
    "Descriptions can only be generated for draft products.",
    "Opisy można generować tylko dla szkiców produktów.",
    "Beschreibungen können nur für Produktentwürfe erstellt werden.",
    "Chỉ có thể tạo mô tả cho sản phẩm nháp.",
  ),
  noTargets: t(
    "All descriptions and the title are already owned by human edits.",
    "Wszystkie opisy i tytuł zostały już poprawione przez człowieka.",
    "Alle Beschreibungen und der Titel wurden bereits manuell bearbeitet.",
    "Tất cả mô tả và tiêu đề đã được người dùng chỉnh sửa.",
  ),
  coverMissing: t(
    "Select and save a cover image before generating descriptions.",
    "Wybierz i zapisz zdjęcie główne przed wygenerowaniem opisów.",
    "Wählen und speichern Sie vor der Generierung ein Titelbild.",
    "Chọn và lưu ảnh bìa trước khi tạo mô tả.",
  ),
  coverNotReady: t(
    "The selected imported cover is not ready yet. Wait for image processing or recover the image before trying again.",
    "Wybrane zaimportowane zdjęcie główne nie jest jeszcze gotowe. Poczekaj na przetworzenie lub odzyskaj zdjęcie przed ponowną próbą.",
    "Das ausgewählte importierte Titelbild ist noch nicht bereit. Warten Sie auf die Bildverarbeitung oder stellen Sie das Bild vor einem neuen Versuch wieder her.",
    "Ảnh bìa đã nhập chưa sẵn sàng. Hãy chờ xử lý hoặc khôi phục ảnh trước khi thử lại.",
  ),
  coverUnsupported: t(
    "This cover address cannot be used for generation. Upload the cover through Bazoria and save it before trying again.",
    "Tego adresu zdjęcia nie można użyć do generowania. Prześlij zdjęcie przez Bazoria i zapisz je przed ponowną próbą.",
    "Diese Bildadresse kann nicht zur Generierung verwendet werden. Laden Sie das Titelbild über Bazoria hoch und speichern Sie es vor einem neuen Versuch.",
    "Không thể dùng địa chỉ ảnh này để tạo mô tả. Hãy tải ảnh bìa lên qua Bazoria và lưu trước khi thử lại.",
  ),
  coverUnavailable: t(
    "The selected cover could not be read. Your current text was preserved. Retry or replace the cover.",
    "Nie udało się odczytać wybranego zdjęcia głównego. Bieżący tekst został zachowany. Spróbuj ponownie lub zastąp zdjęcie.",
    "Das ausgewählte Titelbild konnte nicht gelesen werden. Ihr aktueller Text wurde beibehalten. Versuchen Sie es erneut oder ersetzen Sie das Bild.",
    "Không thể đọc ảnh bìa đã chọn. Nội dung hiện tại được giữ nguyên. Hãy thử lại hoặc thay ảnh bìa.",
  ),
  imageNotUsable: t(
    "The cover does not show the product clearly enough. Choose a clearer product cover and try again.",
    "Zdjęcie główne nie pokazuje produktu wystarczająco wyraźnie. Wybierz wyraźniejsze zdjęcie produktu i spróbuj ponownie.",
    "Das Titelbild zeigt das Produkt nicht deutlich genug. Wählen Sie ein klareres Produktbild und versuchen Sie es erneut.",
    "Ảnh bìa không hiển thị sản phẩm đủ rõ. Hãy chọn ảnh sản phẩm rõ hơn và thử lại.",
  ),
  unsavedProduct: t(
    "Save product changes before generating descriptions.",
    "Zapisz zmiany produktu przed wygenerowaniem opisów.",
    "Speichern Sie die Produktänderungen vor der Generierung.",
    "Lưu thay đổi sản phẩm trước khi tạo mô tả.",
  ),
  unsavedFacts: t(
    "Save product facts before generating descriptions.",
    "Zapisz dane produktu przed wygenerowaniem opisów.",
    "Speichern Sie die Produktfakten vor der Generierung.",
    "Lưu thông tin sản phẩm trước khi tạo mô tả.",
  ),
  unsavedDescriptions: t(
    "Save description changes before generating again.",
    "Zapisz zmiany opisów przed ponownym generowaniem.",
    "Speichern Sie die Beschreibungsänderungen vor einer erneuten Generierung.",
    "Lưu thay đổi mô tả trước khi tạo lại.",
  ),
  saveActive: t(
    "Wait for the current save to finish.",
    "Poczekaj na zakończenie zapisywania.",
    "Warten Sie, bis der aktuelle Speichervorgang abgeschlossen ist.",
    "Chờ thao tác lưu hiện tại hoàn tất.",
  ),
  publicationActive: t(
    "Wait for product publication to finish.",
    "Poczekaj na zakończenie publikacji produktu.",
    "Warten Sie, bis die Produktveröffentlichung abgeschlossen ist.",
    "Chờ quá trình xuất bản sản phẩm hoàn tất.",
  ),
  descriptionsUnavailable: t(
    "Descriptions must be available before generation can start.",
    "Opisy muszą być dostępne przed rozpoczęciem generowania.",
    "Die Beschreibungen müssen vor der Generierung verfügbar sein.",
    "Mô tả phải khả dụng trước khi bắt đầu tạo.",
  ),
  inProgress: t(
    "Another generation request is already running. Try again later.",
    "Inne żądanie generowania jest już wykonywane. Spróbuj ponownie później.",
    "Eine andere Generierung läuft bereits. Versuchen Sie es später erneut.",
    "Một yêu cầu tạo khác đang chạy. Hãy thử lại sau.",
  ),
  inputChanged: t(
    "The product inputs changed during generation. The latest product data has been loaded.",
    "Dane produktu zmieniły się podczas generowania. Wczytano najnowsze dane.",
    "Die Produktdaten wurden während der Generierung geändert. Die neuesten Daten wurden geladen.",
    "Thông tin sản phẩm đã thay đổi trong khi tạo. Dữ liệu mới nhất đã được tải.",
  ),
  superseded: t(
    "A newer generation attempt owns the result. The latest descriptions were loaded.",
    "Nowsza próba generowania jest właścicielem wyniku. Wczytano najnowsze opisy.",
    "Ein neuerer Generierungsversuch besitzt das Ergebnis. Die neuesten Beschreibungen wurden geladen.",
    "Một lần tạo mới hơn sở hữu kết quả. Mô tả mới nhất đã được tải.",
  ),
  validation: t(
    "The generation request is invalid. Refresh the page and try again.",
    "Żądanie generowania jest nieprawidłowe. Odśwież stronę i spróbuj ponownie.",
    "Die Generierungsanfrage ist ungültig. Aktualisieren Sie die Seite und versuchen Sie es erneut.",
    "Yêu cầu tạo không hợp lệ. Làm mới trang và thử lại.",
  ),
  retryable: t(
    "Descriptions could not be generated. Your current text was preserved. Try again.",
    "Nie udało się wygenerować opisów. Bieżący tekst został zachowany. Spróbuj ponownie.",
    "Die Beschreibungen konnten nicht erstellt werden. Ihr aktueller Text wurde beibehalten. Versuchen Sie es erneut.",
    "Không thể tạo mô tả. Nội dung hiện tại được giữ nguyên. Hãy thử lại.",
  ),
  unavailable: t(
    "Description generation is temporarily unavailable.",
    "Generowanie opisów jest tymczasowo niedostępne.",
    "Die Beschreibungsgenerierung ist vorübergehend nicht verfügbar.",
    "Tính năng tạo mô tả tạm thời không khả dụng.",
  ),
};

export function SellerProductDraftDescriptionSection({
  productDraftId,
  title,
  coordination,
  refreshRequest,
  onDescriptionStateChange,
  onGenerationStateChange,
  onGenerated,
  onRefreshContext,
}: {
  productDraftId: string;
  title: string;
  coordination: SellerDescriptionCoordinationState;
  refreshRequest: number;
  onDescriptionStateChange(state: ProductDraftDescriptionEditorState): void;
  onGenerationStateChange(active: boolean): void;
  onGenerated(result: {
    descriptionSnapshot: ProductDraftDescriptionSnapshot;
    titleSnapshot: ProductDraftTitleSnapshot;
  }): void;
  onRefreshContext(scope: DescriptionGenerationRefreshScope): Promise<void>;
}) {
  const getDescriptions = useServerFn(getMyProductDraftDescriptions);
  const updateDescriptions = useServerFn(updateMyProductDraftDescriptions);
  const generateDescriptions = useServerFn(generateMyProductDraftDescriptions);
  const client = useMemo<SellerProductDraftDescriptionClient>(
    () => ({
      get: (id) => getDescriptions({ data: { productDraftId: id } }),
      update: (id, descriptions) =>
        updateDescriptions({ data: { productDraftId: id, descriptions } }),
      generate: (id) => generateDescriptions({ data: { productDraftId: id } }),
    }),
    [generateDescriptions, getDescriptions, updateDescriptions],
  );
  return (
    <SellerProductDraftDescriptionSectionView
      productDraftId={productDraftId}
      title={title}
      client={client}
      coordination={coordination}
      refreshRequest={refreshRequest}
      onDescriptionStateChange={onDescriptionStateChange}
      onGenerationStateChange={onGenerationStateChange}
      onGenerated={onGenerated}
      onRefreshContext={onRefreshContext}
    />
  );
}

export function SellerProductDraftDescriptionSectionView({
  productDraftId,
  title,
  client,
  coordination,
  refreshRequest,
  onDescriptionStateChange,
  onGenerationStateChange,
  onGenerated,
  onRefreshContext,
}: {
  productDraftId: string;
  title: string;
  client: SellerProductDraftDescriptionClient;
  coordination: SellerDescriptionCoordinationState;
  refreshRequest: number;
  onDescriptionStateChange(state: ProductDraftDescriptionEditorState): void;
  onGenerationStateChange(active: boolean): void;
  onGenerated(result: {
    descriptionSnapshot: ProductDraftDescriptionSnapshot;
    titleSnapshot: ProductDraftTitleSnapshot;
  }): void;
  onRefreshContext(scope: DescriptionGenerationRefreshScope): Promise<void>;
}) {
  const editorRef = useRef<ProductDraftDescriptionEditorHandle>(null);
  const previousRefreshRequest = useRef(refreshRequest);
  const [snapshot, setSnapshot] = useState<ProductDraftDescriptionSnapshot | null>(null);
  const [editorState, setEditorState] = useState(cleanEditorState);
  const [readState, setReadState] = useState(initialReadState);
  const [generationActive, setGenerationActive] = useState(false);
  const [generationUnavailable, setGenerationUnavailable] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationSuccess, setGenerationSuccess] = useState(false);
  const handleEditorStateChange = useCallback(
    (state: ProductDraftDescriptionEditorState) => {
      setEditorState((current) =>
        current.dirty === state.dirty && current.saving === state.saving ? current : state,
      );
      onDescriptionStateChange(state);
    },
    [onDescriptionStateChange],
  );

  useEffect(() => {
    if (refreshRequest === previousRefreshRequest.current) return;
    previousRefreshRequest.current = refreshRequest;
    void editorRef.current?.refresh().catch(() => undefined);
  }, [refreshRequest]);

  useEffect(
    () => () => {
      onGenerationStateChange(false);
      onDescriptionStateChange(cleanEditorState);
    },
    [onDescriptionStateChange, onGenerationStateChange],
  );

  const disabledReason = generationDisabledReason({
    snapshot,
    readState,
    editorState,
    coordination,
    generationActive,
    generationUnavailable,
    title,
  });
  const hasModelText = snapshot?.descriptions.some((entry) => entry.source === "model") ?? false;

  async function generate() {
    if (disabledReason || generationActive || !snapshot) return;
    if (
      snapshot.descriptions.some((entry) => Boolean(entry.text?.trim())) &&
      !window.confirm(tr(S.confirm))
    ) {
      return;
    }

    setGenerationActive(true);
    onGenerationStateChange(true);
    setGenerationError(null);
    setGenerationSuccess(false);
    try {
      const result = await client.generate(productDraftId);
      editorRef.current?.replaceSnapshot(result.descriptionSnapshot);
      setSnapshot(result.descriptionSnapshot);
      onGenerated(result);
      setGenerationSuccess(true);
    } catch (error) {
      const code = errorCode(error);
      setGenerationError(generationErrorMessage(code));
      if (code === "product_description_generation_configuration_invalid") {
        setGenerationUnavailable(true);
      }
      const refreshScope = generationRefreshScope(code);
      if (refreshScope) {
        await onRefreshContext(refreshScope).catch(() => undefined);
        await editorRef.current?.refresh().catch(() => undefined);
      }
    } finally {
      setGenerationActive(false);
      onGenerationStateChange(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{tr(S.title)}</h2>
          </CardTitle>
          <CardDescription>{tr(S.introduction)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasModelText ? (
            <Alert>
              <AlertDescription>{tr(S.unreviewed)}</AlertDescription>
            </Alert>
          ) : null}
          {generationError ? (
            <Alert variant="destructive">
              <AlertDescription>{generationError}</AlertDescription>
            </Alert>
          ) : null}
          {generationSuccess ? (
            <Alert>
              <AlertDescription>{tr(S.generated)}</AlertDescription>
            </Alert>
          ) : null}
          {disabledReason && !generationActive ? (
            <p className="text-sm text-muted-foreground">{disabledReason}</p>
          ) : null}
          <Button type="button" disabled={Boolean(disabledReason)} onClick={() => void generate()}>
            {generationActive ? tr(S.generating) : tr(S.generate)}
          </Button>
        </CardContent>
      </Card>

      <ProductDraftDescriptionEditor
        ref={editorRef}
        productDraftId={productDraftId}
        client={client}
        disabled={coordination.product.publicationActive || generationActive}
        disabledReason={generationActive ? "generation" : "publication"}
        onStateChange={handleEditorStateChange}
        onReadStateChange={setReadState}
        onSnapshotChange={setSnapshot}
      />
    </div>
  );
}

function generationDisabledReason({
  snapshot,
  readState,
  editorState,
  coordination,
  generationActive,
  generationUnavailable,
  title,
}: {
  snapshot: ProductDraftDescriptionSnapshot | null;
  readState: ProductDraftDescriptionReadState;
  editorState: ProductDraftDescriptionEditorState;
  coordination: SellerDescriptionCoordinationState;
  generationActive: boolean;
  generationUnavailable: boolean;
  title: string;
}): string | null {
  if (generationActive) return tr(S.generating);
  if (generationUnavailable) return tr(S.unavailable);
  if (readState.loading || !readState.available || !snapshot) return tr(S.descriptionsUnavailable);
  if (!snapshot.generationEligibility.eligible) {
    return tr(
      snapshot.generationEligibility.reason === "category_missing" ? S.categoryMissing : S.notDraft,
    );
  }
  if (coordination.product.publicationActive) return tr(S.publicationActive);
  if (coordination.product.saving || coordination.facts.saving || editorState.saving)
    return tr(S.saveActive);
  if (coordination.product.dirty) return tr(S.unsavedProduct);
  if (coordination.facts.dirty) return tr(S.unsavedFacts);
  if (editorState.dirty) return tr(S.unsavedDescriptions);
  if (
    title.trim() &&
    snapshot.descriptions.every((description) => description.source === "human")
  ) {
    return tr(S.noTargets);
  }
  return null;
}

function generationRefreshScope(code: string | null): DescriptionGenerationRefreshScope | null {
  if (code === "product_description_generation_input_changed") return "product_and_facts";
  if (
    code === "product_description_generation_attempt_superseded" ||
    code === "product_description_generation_no_writable_targets" ||
    code === "product_description_generation_not_editable" ||
    code === "product_description_generation_category_missing" ||
    code === "product_description_generation_cover_missing" ||
    code === "product_description_generation_cover_not_ready"
  ) {
    return "product";
  }
  return null;
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function generationErrorMessage(code: string | null): string {
  switch (code) {
    case "product_description_generation_invalid":
      return tr(S.validation);
    case "product_description_generation_in_progress":
      return tr(S.inProgress);
    case "product_description_generation_input_changed":
      return tr(S.inputChanged);
    case "product_description_generation_attempt_superseded":
      return tr(S.superseded);
    case "product_description_generation_no_writable_targets":
      return tr(S.noTargets);
    case "product_description_generation_not_editable":
      return tr(S.notDraft);
    case "product_description_generation_category_missing":
      return tr(S.categoryMissing);
    case "product_description_generation_cover_missing":
      return tr(S.coverMissing);
    case "product_description_generation_cover_not_ready":
      return tr(S.coverNotReady);
    case "product_description_generation_cover_unsupported":
      return tr(S.coverUnsupported);
    case "product_description_generation_cover_unavailable":
      return tr(S.coverUnavailable);
    case "product_description_generation_image_not_usable":
      return tr(S.imageNotUsable);
    case "product_description_generation_provider_failed":
    case "product_description_generation_provider_timeout":
    case "product_description_generation_output_invalid":
      return tr(S.retryable);
    default:
      return tr(S.unavailable);
  }
}
