import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { productDraftFactsDocumentSchema } from "@/features/product-draft-facts/product-draft-facts.types";
import type {
  ProductActivationDisplayState,
  ProductModerationReviewStatus,
  ProductModerationStatusDetail,
  ProductModerationSubmittedImage,
} from "../product-moderation-status.types";
import { productModerationImageCredentialIdentity } from "../product-moderation-status-refresh";
import { t, tr, type T } from "@/lib/i18n";

const publicLabels: Record<ProductModerationStatusDetail["publicState"], T> = {
  draft: t("Not public", "Niepubliczny", "Nicht öffentlich", "Chưa công khai"),
  published: t("Published", "Opublikowany", "Veröffentlicht", "Đã xuất bản"),
  archived: t("Archived", "Zarchiwizowany", "Archiviert", "Đã lưu trữ"),
};

const reviewLabels: Record<ProductModerationReviewStatus, T> = {
  pending: t("Pending review", "Oczekuje na weryfikację", "Prüfung ausstehend", "Đang chờ duyệt"),
  changes_requested: t(
    "Changes requested",
    "Wymagane zmiany",
    "Änderungen erforderlich",
    "Yêu cầu thay đổi",
  ),
  approved: t("Approved", "Zatwierdzony", "Genehmigt", "Đã phê duyệt"),
  rejected: t("Rejected", "Odrzucony", "Abgelehnt", "Bị từ chối"),
  withdrawn: t("Withdrawn", "Wycofany", "Zurückgezogen", "Đã rút"),
};

const activationLabels: Record<ProductActivationDisplayState, T> = {
  waiting_for_dispatch: t(
    "Waiting to publish",
    "Oczekuje na publikację",
    "Wartet auf Veröffentlichung",
    "Đang chờ xuất bản",
  ),
  dispatch_failed: t(
    "Publication could not start",
    "Nie udało się rozpocząć publikacji",
    "Veröffentlichung konnte nicht starten",
    "Không thể bắt đầu xuất bản",
  ),
  publishing: t("Publishing", "Publikowanie", "Wird veröffentlicht", "Đang xuất bản"),
  activation_failed: t(
    "Publication failed",
    "Publikacja nie powiodła się",
    "Veröffentlichung fehlgeschlagen",
    "Xuất bản thất bại",
  ),
  abandonment_cleanup: t(
    "Discarding failed publication",
    "Usuwanie nieudanej publikacji",
    "Fehlgeschlagene Veröffentlichung wird verworfen",
    "Đang hủy lần xuất bản thất bại",
  ),
  abandonment_cleanup_required: t(
    "Cleanup retry required",
    "Wymagane ponowienie czyszczenia",
    "Bereinigung muss wiederholt werden",
    "Cần thử dọn dẹp lại",
  ),
  public_cleanup: t(
    "Published; finishing cleanup",
    "Opublikowany; kończenie czyszczenia",
    "Veröffentlicht; Bereinigung läuft",
    "Đã xuất bản; đang hoàn tất dọn dẹp",
  ),
  public_cleanup_required: t(
    "Published; administrator cleanup required",
    "Opublikowany; wymagane czyszczenie przez administratora",
    "Veröffentlicht; Administrator-Bereinigung erforderlich",
    "Đã xuất bản; cần quản trị viên dọn dẹp",
  ),
  completed: t("Completed", "Ukończono", "Abgeschlossen", "Hoàn tất"),
  abandoned: t("Abandoned", "Porzucono", "Verworfen", "Đã hủy"),
};

export function ProductModerationAxes({ status }: { status: ProductModerationStatusDetail }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <AxisCard
        title={tr(t("Public", "Publiczny", "Öffentlich", "Công khai"))}
        value={tr(publicLabels[status.publicState])}
      />
      <AxisCard
        title={tr(t("Review", "Weryfikacja", "Prüfung", "Duyệt"))}
        value={
          status.review
            ? tr(reviewLabels[status.review.status])
            : tr(t("Not submitted", "Nie wysłano", "Nicht eingereicht", "Chưa gửi"))
        }
      />
      <AxisCard
        title={tr(t("Activation", "Aktywacja", "Aktivierung", "Kích hoạt"))}
        value={
          status.activation
            ? tr(activationLabels[status.activation.displayState])
            : tr(t("Not started", "Nie rozpoczęto", "Nicht gestartet", "Chưa bắt đầu"))
        }
      />
    </div>
  );
}

function AxisCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-base">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export function ProductModerationFeedback({ reason }: { reason: string }) {
  return (
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="text-base">
          {tr(
            t(
              "Administrator feedback",
              "Uwagi administratora",
              "Administrator-Feedback",
              "Phản hồi của quản trị viên",
            ),
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="whitespace-pre-wrap text-sm">{reason}</CardContent>
    </Card>
  );
}

export function ProductModerationSubmittedRevisionView({
  status,
  categoryName,
  failedCredentialIdentities = new Set(),
  onImageError,
}: {
  status: ProductModerationStatusDetail;
  categoryName: string;
  failedCredentialIdentities?: ReadonlySet<string>;
  onImageError?(submissionId: string, image: ProductModerationSubmittedImage): void;
}) {
  const submitted = status.submittedRevision;
  if (!submitted) return null;
  const snapshot = submitted.snapshot;
  const imageById = new Map(submitted.images.map((image) => [image.productDraftImageId, image]));
  const orderedImages = snapshot.imageIds
    .map((id) => imageById.get(id))
    .filter((image): image is NonNullable<typeof image> => Boolean(image));
  const submittedFacts = snapshot.facts
    ? productDraftFactsDocumentSchema.safeParse(snapshot.facts.facts)
    : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {tr(
              t("Submitted revision", "Wysłana wersja", "Eingereichte Version", "Phiên bản đã gửi"),
            )}
          </CardTitle>
          <CardDescription>
            {tr(
              t(
                "This is the immutable version being reviewed or published.",
                "To niezmienna wersja poddawana weryfikacji lub publikacji.",
                "Dies ist die unveränderliche Version, die geprüft oder veröffentlicht wird.",
                "Đây là phiên bản cố định đang được duyệt hoặc xuất bản.",
              ),
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <ReadField
            label={tr(t("Title", "Tytuł", "Titel", "Tiêu đề"))}
            value={snapshot.title || unavailable()}
          />
          <ReadField
            label={tr(t("Category", "Kategoria", "Kategorie", "Danh mục"))}
            value={categoryName}
          />
          <ReadField
            label={tr(t("Audiences", "Odbiorcy", "Zielgruppen", "Đối tượng"))}
            value={snapshot.audiences.join(", ") || unavailable()}
          />
          <ReadField
            label={tr(t("Product code", "Kod produktu", "Produktcode", "Mã sản phẩm"))}
            value={snapshot.productCode ?? unavailable()}
          />
          <ReadField
            label={tr(t("Price", "Cena", "Preis", "Giá"))}
            value={
              snapshot.price === null ? unavailable() : `${snapshot.price} ${snapshot.currency}`
            }
          />
          <ReadField
            label={tr(t("Stock", "Stan", "Bestand", "Tồn kho"))}
            value={snapshot.stock.replaceAll("_", " ")}
          />
          <ReadField
            label={tr(
              t("Minimum order", "Minimalne zamówienie", "Mindestbestellmenge", "Đơn tối thiểu"),
            )}
            value={snapshot.minimumOrder === null ? unavailable() : String(snapshot.minimumOrder)}
          />
          <ReadField
            label={tr(t("Pack size", "Wielkość opakowania", "Packungsgröße", "Quy cách đóng gói"))}
            value={snapshot.packSize ?? unavailable()}
          />
        </CardContent>
      </Card>

      {snapshot.descriptions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{tr(t("Descriptions", "Opisy", "Beschreibungen", "Mô tả"))}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {snapshot.descriptions.map((description) => (
              <div key={description.language}>
                <Badge variant="outline">{description.language.toUpperCase()}</Badge>
                <p className="mt-2 whitespace-pre-wrap text-sm">{description.descriptionText}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {snapshot.facts ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {tr(
                t(
                  "Submitted product facts",
                  "Przesłane dane produktu",
                  "Eingereichte Produktdaten",
                  "Thông tin sản phẩm đã gửi",
                ),
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <ReadField
              label={tr(t("Colors", "Kolory", "Farben", "Màu sắc"))}
              value={
                submittedFacts?.success && submittedFacts.data.colors.length > 0
                  ? submittedFacts.data.colors.join(", ")
                  : unavailable()
              }
            />
            <ReadField
              label={tr(
                t(
                  "Material composition",
                  "Skład materiału",
                  "Materialzusammensetzung",
                  "Thành phần chất liệu",
                ),
              )}
              value={
                submittedFacts?.success
                  ? (submittedFacts.data.materialComposition ?? unavailable())
                  : unavailable()
              }
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {tr(t("Submitted images", "Wysłane zdjęcia", "Eingereichte Bilder", "Hình ảnh đã gửi"))}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {orderedImages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{unavailable()}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {orderedImages.map((image, index) => {
                const credentialIdentity = productModerationImageCredentialIdentity(
                  submitted.submissionId,
                  image,
                );
                const credentialFailed = Boolean(
                  credentialIdentity && failedCredentialIdentities.has(credentialIdentity),
                );
                return (
                  <div key={image.productDraftImageId} className="border border-border bg-card">
                    {image.url && image.deliveryStatus === "available" && !credentialFailed ? (
                      <img
                        src={image.url}
                        alt={`${snapshot.title || "Product"} ${index + 1}`}
                        className="aspect-square w-full object-cover"
                        onError={() => onImageError?.(submitted.submissionId, image)}
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center bg-muted p-4 text-center text-sm text-muted-foreground">
                        {tr(
                          t(
                            "Image unavailable",
                            "Zdjęcie niedostępne",
                            "Bild nicht verfügbar",
                            "Hình ảnh không khả dụng",
                          ),
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                      <span>{index + 1}</span>
                      {image.isCover ? (
                        <Badge variant="secondary">
                          {tr(t("Cover", "Okładka", "Titelbild", "Ảnh bìa"))}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function PublishedProductLink({ productId }: { productId: string }) {
  return (
    <Link
      to="/p/$id"
      params={{ id: productId }}
      className="inline-flex border border-border px-4 py-2 text-sm font-medium hover:border-primary"
    >
      {tr(
        t(
          "View published product",
          "Zobacz opublikowany produkt",
          "Veröffentlichtes Produkt ansehen",
          "Xem sản phẩm đã xuất bản",
        ),
      )}
    </Link>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

function unavailable() {
  return tr(t("Not available", "Niedostępne", "Nicht verfügbar", "Không khả dụng"));
}
