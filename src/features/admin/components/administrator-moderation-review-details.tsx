import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readOnlyModerationImageCredentialIdentity } from "@/features/moderation/read-only-moderation-refresh";
import { t, tr, useLang, type Lang } from "@/lib/i18n";

import type {
  AdministratorProductModerationDetail,
  AdministratorProductModerationRevision,
  AdministratorProductSubmissionImageDelivery,
  AdministratorSellerAssetDelivery,
  AdministratorSellerModerationDetail,
  SellerSubmissionSnapshot,
} from "../administrator-moderation.types";

export type AdministratorModerationCategory = {
  id: string;
  slug: string;
  name: string;
};

const S = {
  proposal: t(
    "Submitted proposal",
    "Zgłoszona propozycja",
    "Eingereichter Vorschlag",
    "Đề xuất đã gửi",
  ),
  approvedBaseline: t(
    "Approved baseline",
    "Zatwierdzona wersja bazowa",
    "Genehmigte Basis",
    "Bản chuẩn đã duyệt",
  ),
  noBaseline: t(
    "No approved baseline",
    "Brak zatwierdzonej wersji bazowej",
    "Keine genehmigte Basis",
    "Không có bản chuẩn đã duyệt",
  ),
  noBaselineDescription: t(
    "This is an initial submission.",
    "To jest pierwsze zgłoszenie.",
    "Dies ist eine Erst-Einreichung.",
    "Đây là lần gửi đầu tiên.",
  ),
  historical: t(
    "Historical review",
    "Przegląd historyczny",
    "Historische Prüfung",
    "Đánh giá lịch sử",
  ),
  historicalDescription: t(
    "A newer revision is currently approved. This comparison remains bound to the submitted historical baseline.",
    "Nowsza wersja jest obecnie zatwierdzona. To porównanie pozostaje powiązane z historyczną wersją bazową zgłoszenia.",
    "Eine neuere Revision ist derzeit genehmigt. Dieser Vergleich bleibt an die historische Einreichungsbasis gebunden.",
    "Một phiên bản mới hơn hiện đã được duyệt. So sánh này vẫn gắn với bản chuẩn lịch sử của lần gửi.",
  ),
  changedFields: t("Changed fields", "Zmienione pola", "Geänderte Felder", "Trường đã thay đổi"),
  noChangedFields: t(
    "No normalized field changes",
    "Brak znormalizowanych zmian pól",
    "Keine normalisierten Feldänderungen",
    "Không có thay đổi trường chuẩn hóa",
  ),
  name: t("Name", "Nazwa", "Name", "Tên"),
  slug: t("Store address", "Adres sklepu", "Shop-Adresse", "Địa chỉ cửa hàng"),
  city: t("City", "Miasto", "Stadt", "Thành phố"),
  country: t("Country", "Kraj", "Land", "Quốc gia"),
  whatsapp: t("WhatsApp", "WhatsApp", "WhatsApp", "WhatsApp"),
  email: t("Email", "E-mail", "E-Mail", "Email"),
  about: t("About", "O sprzedawcy", "Über", "Giới thiệu"),
  establishedYear: t("Established", "Rok założenia", "Gegründet", "Năm thành lập"),
  logo: t("Logo", "Logo", "Logo", "Logo"),
  cover: t("Cover", "Okładka", "Titelbild", "Ảnh bìa"),
  mediaPending: t("Media pending", "Media oczekują", "Medium ausstehend", "Phương tiện đang chờ"),
  mediaFailed: t("Media failed", "Błąd mediów", "Medium fehlgeschlagen", "Phương tiện lỗi"),
  mediaMissing: t("Media missing", "Brak mediów", "Medium fehlt", "Thiếu phương tiện"),
  mediaUnavailable: t(
    "Media unavailable",
    "Media niedostępne",
    "Medium nicht verfügbar",
    "Phương tiện không khả dụng",
  ),
  title: t("Title", "Tytuł", "Titel", "Tiêu đề"),
  titleSource: t("Title source", "Źródło tytułu", "Titelquelle", "Nguồn tiêu đề"),
  productCode: t("Product code", "Kod produktu", "Produktcode", "Mã sản phẩm"),
  allocationState: t(
    "Code allocation state",
    "Stan przydziału kodu",
    "Code-Zuweisungsstatus",
    "Trạng thái cấp mã",
  ),
  category: t("Category", "Kategoria", "Kategorie", "Danh mục"),
  categoryWarning: t(
    "The current category label could not be loaded. The immutable identifier is shown instead.",
    "Nie można załadować bieżącej etykiety kategorii. Zamiast niej pokazano niezmienny identyfikator.",
    "Die aktuelle Kategoriebezeichnung konnte nicht geladen werden. Stattdessen wird die unveränderliche Kennung angezeigt.",
    "Không thể tải nhãn danh mục hiện tại. Mã định danh bất biến được hiển thị thay thế.",
  ),
  audiences: t("Audiences", "Grupy odbiorców", "Zielgruppen", "Đối tượng"),
  descriptions: t("Descriptions", "Opisy", "Beschreibungen", "Mô tả"),
  noDescriptions: t(
    "No descriptions submitted",
    "Nie przesłano opisów",
    "Keine Beschreibungen eingereicht",
    "Không có mô tả được gửi",
  ),
  facts: t("Reviewed facts", "Sprawdzone dane", "Geprüfte Fakten", "Dữ liệu đã duyệt"),
  noFacts: t(
    "No structured facts submitted",
    "Nie przesłano danych strukturalnych",
    "Keine strukturierten Fakten eingereicht",
    "Không có dữ liệu có cấu trúc",
  ),
  minimumOrder: t("Minimum order", "Minimalne zamówienie", "Mindestbestellung", "Đơn tối thiểu"),
  packSize: t("Pack size", "Wielkość opakowania", "Packungsgröße", "Quy cách đóng gói"),
  price: t("Price", "Cena", "Preis", "Giá"),
  stock: t("Stock", "Stan magazynowy", "Bestand", "Tồn kho"),
  gallery: t("Submitted images", "Przesłane zdjęcia", "Eingereichte Bilder", "Ảnh đã gửi"),
  noImages: t(
    "No images submitted",
    "Nie przesłano zdjęć",
    "Keine Bilder eingereicht",
    "Không có ảnh được gửi",
  ),
  imagePending: t("Image pending", "Zdjęcie oczekuje", "Bild ausstehend", "Ảnh đang chờ"),
  imageFailed: t("Image failed", "Błąd zdjęcia", "Bild fehlgeschlagen", "Ảnh lỗi"),
  imageMissing: t("Image missing", "Brak zdjęcia", "Bild fehlt", "Thiếu ảnh"),
  imageUnavailable: t(
    "Image unavailable",
    "Zdjęcie niedostępne",
    "Bild nicht verfügbar",
    "Ảnh không khả dụng",
  ),
  notSet: t("Not set", "Nie ustawiono", "Nicht festgelegt", "Chưa đặt"),
  sourceHuman: t("Human", "Człowiek", "Mensch", "Con người"),
  sourceModel: t("Model", "Model", "Modell", "Mô hình"),
};

export function AdministratorSellerReviewDetails({
  detail,
}: {
  detail: AdministratorSellerModerationDetail;
}) {
  const [failedAssets, setFailedAssets] = useState<Set<string>>(new Set());
  const historical = isHistorical(
    detail.currentApprovedReference,
    { submissionId: detail.request.submissionId, revision: detail.request.revision },
    detail.comparisonBaseline,
  );
  return (
    <div className="space-y-5">
      {historical ? <HistoricalAlert /> : null}
      <ChangedFields fields={detail.changedFields} />
      <div className="grid gap-5 xl:grid-cols-2">
        <SellerSnapshotCard
          title={tr(S.proposal)}
          snapshot={detail.proposed.snapshot}
          assets={detail.proposed.assets}
          failedAssets={failedAssets}
          onAssetError={(assetId) => setFailedAssets((current) => new Set(current).add(assetId))}
        />
        {detail.comparisonBaseline ? (
          <SellerSnapshotCard
            title={tr(S.approvedBaseline)}
            snapshot={detail.comparisonBaseline.snapshot}
            assets={detail.comparisonBaseline.assets}
            failedAssets={failedAssets}
            onAssetError={(assetId) => setFailedAssets((current) => new Set(current).add(assetId))}
          />
        ) : (
          <NoBaselineCard />
        )}
      </div>
    </div>
  );
}

export function AdministratorProductReviewDetails({
  detail,
  categories,
  categoryWarning,
  failedCredentialIdentities,
  onImageError,
}: {
  detail: AdministratorProductModerationDetail;
  categories: AdministratorModerationCategory[];
  categoryWarning: boolean;
  failedCredentialIdentities: ReadonlySet<string>;
  onImageError(submissionId: string, image: AdministratorProductSubmissionImageDelivery): void;
}) {
  const historical = isHistorical(
    detail.currentApprovedReference,
    { submissionId: detail.request.submissionId, revision: detail.request.revision },
    detail.comparisonBaseline,
  );
  const hasUnresolvedCategory = [
    detail.proposed.snapshot.categoryId,
    detail.comparisonBaseline?.snapshot.categoryId ?? null,
  ].some(
    (categoryId) =>
      categoryId !== null && !categories.some((category) => category.id === categoryId),
  );
  return (
    <div className="space-y-5">
      {historical ? <HistoricalAlert /> : null}
      {categoryWarning || hasUnresolvedCategory ? (
        <Alert>
          <AlertTitle>{tr(S.category)}</AlertTitle>
          <AlertDescription>{tr(S.categoryWarning)}</AlertDescription>
        </Alert>
      ) : null}
      <ChangedFields fields={detail.changedFields} />
      <div className="grid gap-5 xl:grid-cols-2">
        <ProductSnapshotCard
          title={tr(S.proposal)}
          revision={detail.proposed}
          submissionId={detail.request.submissionId}
          categories={categories}
          failedCredentialIdentities={failedCredentialIdentities}
          onImageError={onImageError}
        />
        {detail.comparisonBaseline ? (
          <ProductSnapshotCard
            title={tr(S.approvedBaseline)}
            revision={detail.comparisonBaseline}
            submissionId={detail.comparisonBaseline.submissionId ?? detail.request.submissionId}
            categories={categories}
            failedCredentialIdentities={failedCredentialIdentities}
            onImageError={onImageError}
          />
        ) : (
          <NoBaselineCard />
        )}
      </div>
    </div>
  );
}

function SellerSnapshotCard({
  title,
  snapshot,
  assets,
  failedAssets,
  onAssetError,
}: {
  title: string;
  snapshot: SellerSubmissionSnapshot;
  assets: {
    logo: AdministratorSellerAssetDelivery | null;
    cover: AdministratorSellerAssetDelivery | null;
  };
  failedAssets: ReadonlySet<string>;
  onAssetError(assetId: string): void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {snapshot.submissionKind} · revision {snapshot.revision}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Definition label={tr(S.name)} value={snapshot.name} />
          <Definition label={tr(S.slug)} value={snapshot.slug} mono />
          <Definition label={tr(S.city)} value={display(snapshot.city)} />
          <Definition label={tr(S.country)} value={display(snapshot.country)} />
          <Definition label={tr(S.whatsapp)} value={display(snapshot.whatsapp)} />
          <Definition label={tr(S.email)} value={display(snapshot.email)} />
          <Definition
            label={tr(S.establishedYear)}
            value={snapshot.establishedYear?.toString() ?? tr(S.notSet)}
          />
        </div>
        <Definition label={tr(S.about)} value={display(snapshot.about)} multiline />
        <div className="grid gap-4 sm:grid-cols-2">
          <SellerAsset
            label={tr(S.logo)}
            asset={assets.logo}
            failed={Boolean(assets.logo && failedAssets.has(assets.logo.assetId))}
            onError={onAssetError}
          />
          <SellerAsset
            label={tr(S.cover)}
            asset={assets.cover}
            failed={Boolean(assets.cover && failedAssets.has(assets.cover.assetId))}
            onError={onAssetError}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ProductSnapshotCard({
  title,
  revision,
  submissionId,
  categories,
  failedCredentialIdentities,
  onImageError,
}: {
  title: string;
  revision: AdministratorProductModerationRevision;
  submissionId: string;
  categories: AdministratorModerationCategory[];
  failedCredentialIdentities: ReadonlySet<string>;
  onImageError(submissionId: string, image: AdministratorProductSubmissionImageDelivery): void;
}) {
  const snapshot = revision.snapshot;
  const category = categories.find((candidate) => candidate.id === snapshot.categoryId);
  const lang = useLang();
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {revision.revision
            ? `revision ${revision.revision}`
            : `schema ${revision.snapshotSchemaVersion}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Definition label={tr(S.title)} value={snapshot.title || tr(S.notSet)} />
          <Definition
            label={tr(S.titleSource)}
            value={
              snapshot.titleSource === "human"
                ? tr(S.sourceHuman)
                : snapshot.titleSource === "model"
                  ? tr(S.sourceModel)
                  : tr(S.notSet)
            }
          />
          <Definition label={tr(S.productCode)} value={snapshot.productCode ?? tr(S.notSet)} mono />
          <Definition
            label={tr(S.category)}
            value={
              snapshot.categoryId
                ? category
                  ? `${category.name} (${category.slug}) · ${snapshot.categoryId}`
                  : snapshot.categoryId
                : tr(S.notSet)
            }
          />
          <Definition
            label={tr(S.audiences)}
            value={snapshot.audiences.length ? snapshot.audiences.join(", ") : tr(S.notSet)}
          />
          <Definition
            label={tr(S.minimumOrder)}
            value={snapshot.minimumOrder?.toString() ?? tr(S.notSet)}
          />
          <Definition label={tr(S.packSize)} value={snapshot.packSize ?? tr(S.notSet)} />
          <Definition
            label={tr(S.price)}
            value={
              snapshot.price === null
                ? tr(S.notSet)
                : `${formatNumber(snapshot.price, lang)} ${snapshot.currency}`
            }
          />
          <Definition label={tr(S.stock)} value={snapshot.stock} />
        </div>
        {snapshot.productCode ? null : (
          <Definition
            label={tr(S.allocationState)}
            value={snapshot.productCodeInput ? prettyJson(snapshot.productCodeInput) : tr(S.notSet)}
            mono
            multiline
          />
        )}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{tr(S.descriptions)}</h3>
          {snapshot.descriptions.length ? (
            <div className="space-y-2">
              {snapshot.descriptions.map((description) => (
                <div key={description.language} className="border border-border bg-muted/20 p-3">
                  <div className="mb-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{description.language.toUpperCase()}</Badge>
                    <span>{description.source}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{description.descriptionText}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{tr(S.noDescriptions)}</p>
          )}
        </section>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{tr(S.facts)}</h3>
          {snapshot.facts ? (
            <pre className="max-h-80 overflow-auto border border-border bg-muted/30 p-3 text-xs">
              {prettyJson(snapshot.facts.facts)}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">{tr(S.noFacts)}</p>
          )}
        </section>
        <ProductGallery
          images={revision.images}
          submissionId={submissionId}
          failedCredentialIdentities={failedCredentialIdentities}
          onImageError={onImageError}
        />
      </CardContent>
    </Card>
  );
}

function ProductGallery({
  images,
  submissionId,
  failedCredentialIdentities,
  onImageError,
}: {
  images: AdministratorProductSubmissionImageDelivery[];
  submissionId: string;
  failedCredentialIdentities: ReadonlySet<string>;
  onImageError(submissionId: string, image: AdministratorProductSubmissionImageDelivery): void;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{tr(S.gallery)}</h3>
      {images.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image) => {
            const identity = readOnlyModerationImageCredentialIdentity(submissionId, image);
            const failed = Boolean(identity && failedCredentialIdentities.has(identity));
            return (
              <div key={image.productDraftImageId} className="min-w-0 border border-border">
                {image.deliveryStatus === "available" && image.url && !failed ? (
                  <img
                    src={image.url}
                    alt={`${tr(S.gallery)} ${image.position + 1}`}
                    className="aspect-square w-full object-cover"
                    onError={() => onImageError(submissionId, image)}
                  />
                ) : (
                  <ImagePlaceholder status={failed ? "unavailable" : image.deliveryStatus} />
                )}
                <div className="flex flex-wrap items-center gap-1 p-2 text-xs text-muted-foreground">
                  <span>#{image.position + 1}</span>
                  {image.isCover ? <Badge variant="secondary">{tr(S.cover)}</Badge> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{tr(S.noImages)}</p>
      )}
    </section>
  );
}

function SellerAsset({
  label,
  asset,
  failed,
  onError,
}: {
  label: string;
  asset: AdministratorSellerAssetDelivery | null;
  failed: boolean;
  onError(assetId: string): void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {asset?.deliveryStatus === "available" && asset.url && !failed ? (
        <img
          src={asset.url}
          alt={label}
          className="aspect-video w-full border border-border object-cover"
          onError={() => onError(asset.assetId)}
        />
      ) : (
        <ImagePlaceholder status={failed ? "unavailable" : (asset?.deliveryStatus ?? "missing")} />
      )}
    </div>
  );
}

function ImagePlaceholder({ status }: { status: string }) {
  const label =
    status === "pending"
      ? S.imagePending
      : status === "failed"
        ? S.imageFailed
        : status === "missing"
          ? S.imageMissing
          : S.imageUnavailable;
  return (
    <div className="flex aspect-video items-center justify-center bg-muted p-3 text-center text-xs text-muted-foreground">
      {tr(label)}
    </div>
  );
}

function ChangedFields({ fields }: { fields: string[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{tr(S.changedFields)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {fields.length ? (
          fields.map((field) => (
            <Badge key={field} variant="secondary">
              {field}
            </Badge>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{tr(S.noChangedFields)}</p>
        )}
      </CardContent>
    </Card>
  );
}

function HistoricalAlert() {
  return (
    <Alert>
      <AlertTitle>{tr(S.historical)}</AlertTitle>
      <AlertDescription>{tr(S.historicalDescription)}</AlertDescription>
    </Alert>
  );
}

function NoBaselineCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr(S.noBaseline)}</CardTitle>
        <CardDescription>{tr(S.noBaselineDescription)}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function Definition({
  label,
  value,
  mono = false,
  multiline = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 break-words text-sm ${mono ? "font-mono text-xs" : ""} ${
          multiline ? "whitespace-pre-wrap" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function isHistorical(
  current: { submissionId: string; revision: number } | null,
  proposed: { submissionId: string; revision: number },
  baseline: { submissionId?: string; revision?: number } | null,
): boolean {
  if (!current) return false;
  if (current.submissionId === proposed.submissionId && current.revision === proposed.revision) {
    return false;
  }
  return !(
    baseline?.submissionId === current.submissionId && baseline.revision === current.revision
  );
}

function display(value: string | null): string {
  return value?.trim() || tr(S.notSet);
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatNumber(value: number, lang: Lang): string {
  const locale: Record<Lang, string> = { EN: "en", PL: "pl", DE: "de", VI: "vi" };
  return new Intl.NumberFormat(locale[lang], { maximumFractionDigits: 2 }).format(value);
}
