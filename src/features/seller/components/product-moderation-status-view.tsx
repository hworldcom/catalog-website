import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { productDraftFactsDocumentSchema } from "@/features/product-draft-facts/product-draft-facts.types";
import { productModerationDescriptionWarnings } from "../product-moderation-description-freshness";
import type {
  ProductActivationDisplayState,
  ProductMarketplaceVisibility,
  ProductModerationReviewStatus,
  ProductModerationStatusDetail,
  ProductModerationSubmittedImage,
} from "../product-moderation-status.types";
import { productModerationImageCredentialIdentity } from "../product-moderation-status-refresh";
import { t, tr, type T } from "@/lib/i18n";

const publicLabels: Record<ProductModerationStatusDetail["publicState"], T> = {
  draft: t("Draft", "Szkic", "Entwurf", "Bản nháp"),
  published: t("Published", "Opublikowany", "Veröffentlicht", "Đã xuất bản"),
  archived: t("Archived", "Zarchiwizowany", "Archiviert", "Đã lưu trữ"),
};

const marketplaceVisibilityLabels: Record<ProductMarketplaceVisibility, T> = {
  not_published: t("Not visible", "Niewidoczny", "Nicht sichtbar", "Chưa hiển thị"),
  visible: t("Visible", "Widoczny", "Sichtbar", "Đang hiển thị"),
  storefront_disabled: t(
    "Storefront disabled",
    "Sklep wyłączony",
    "Shop deaktiviert",
    "Gian hàng bị tắt",
  ),
  seller_approval_required: t(
    "Seller approval required",
    "Wymagane zatwierdzenie sprzedawcy",
    "Verkäufergenehmigung erforderlich",
    "Cần duyệt người bán",
  ),
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
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <AxisCard
        title={tr(t("Product state", "Stan produktu", "Produktstatus", "Trạng thái sản phẩm"))}
        value={tr(publicLabels[status.publicState])}
      />
      <AxisCard
        title={tr(t("Marketplace", "Rynek", "Marktplatz", "Marketplace"))}
        value={tr(marketplaceVisibilityLabels[status.marketplaceVisibility])}
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

export function ProductModerationOutcomeNotice({
  status,
}: {
  status: ProductModerationStatusDetail;
}) {
  const notice = productModerationOutcomeNotice(status);
  if (!notice) return null;

  return (
    <Card className={notice.className} role="status">
      <CardHeader>
        <CardTitle className="text-base">{notice.title}</CardTitle>
        <CardDescription className="text-current">{notice.description}</CardDescription>
      </CardHeader>
      {notice.action ? (
        <CardContent>
          {notice.action === "public_product" ? (
            <PublishedProductLink productId={status.productId} />
          ) : (
            <StorefrontSettingsLink />
          )}
        </CardContent>
      ) : null}
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
  const descriptionWarnings = new Map(
    productModerationDescriptionWarnings(snapshot).map((warning) => [warning.language, warning]),
  );

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
            {snapshot.descriptions.map((description) => {
              const warning = descriptionWarnings.get(description.language);
              return (
                <div
                  key={description.language}
                  className={warning ? "border border-amber-400 bg-amber-50 p-3" : undefined}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{description.language.toUpperCase()}</Badge>
                    {warning ? (
                      <Badge variant="outline">
                        {tr(t("Older facts", "Starsze dane", "Ältere Fakten", "Thông tin cũ"))}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{description.descriptionText}</p>
                  {warning ? (
                    <p className="mt-2 text-xs font-medium text-amber-900">
                      {tr(
                        t(
                          "This description uses facts revision {description}; the submitted facts are revision {current}.",
                          "Ten opis używa wersji danych {description}; przesłane dane są w wersji {current}.",
                          "Diese Beschreibung verwendet Faktenversion {description}; die eingereichten Fakten haben Version {current}.",
                          "Mô tả này dùng phiên bản thông tin {description}; thông tin đã gửi là phiên bản {current}.",
                        ),
                      )
                        .replace(
                          "{description}",
                          warning.descriptionFactsRevision?.toString() ?? "-",
                        )
                        .replace("{current}", warning.currentFactsRevision?.toString() ?? "-")}
                    </p>
                  ) : null}
                </div>
              );
            })}
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

function StorefrontSettingsLink() {
  return (
    <Link
      to="/seller/storefront"
      search={(previous) => previous}
      className="inline-flex border border-orange-500 bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
    >
      {tr(
        t(
          "Open storefront settings",
          "Otwórz ustawienia sklepu",
          "Shop-Einstellungen öffnen",
          "Mở cài đặt gian hàng",
        ),
      )}
    </Link>
  );
}

type ProductModerationOutcomeNoticeContent = {
  title: string;
  description: string;
  className: string;
  action: "public_product" | "storefront_settings" | null;
};

function productModerationOutcomeNotice(
  status: ProductModerationStatusDetail,
): ProductModerationOutcomeNoticeContent | null {
  const activationState = status.activation?.displayState;
  const isUpdate = status.review?.kind === "update";
  if (
    activationState === "dispatch_failed" ||
    activationState === "activation_failed" ||
    activationState === "abandonment_cleanup_required"
  ) {
    return {
      title: tr(
        t(
          "Publication failed",
          "Publikacja nie powiodła się",
          "Veröffentlichung fehlgeschlagen",
          "Xuất bản thất bại",
        ),
      ),
      description: tr(
        isUpdate
          ? t(
              "The submitted update is not public. The previous public version remains visible while recovery is available.",
              "Przesłana aktualizacja nie jest publiczna. Poprzednia wersja pozostaje widoczna, gdy dostępne jest odzyskiwanie.",
              "Das eingereichte Update ist nicht öffentlich. Die vorherige öffentliche Version bleibt während der Wiederherstellung sichtbar.",
              "Bản cập nhật đã gửi chưa công khai. Phiên bản công khai trước đó vẫn hiển thị trong khi có thể khôi phục.",
            )
          : t(
              "The product is not public. Use the available recovery action or contact an administrator.",
              "Produkt nie jest publiczny. Użyj dostępnej akcji naprawczej lub skontaktuj się z administratorem.",
              "Das Produkt ist nicht öffentlich. Nutzen Sie die verfügbare Wiederherstellungsaktion oder kontaktieren Sie einen Administrator.",
              "Sản phẩm chưa công khai. Hãy dùng thao tác khôi phục có sẵn hoặc liên hệ quản trị viên.",
            ),
      ),
      className: "border-destructive bg-destructive/10 text-destructive",
      action: null,
    };
  }

  if (
    (status.review?.status === "approved" && status.publicState !== "published") ||
    activationState === "waiting_for_dispatch" ||
    activationState === "publishing" ||
    activationState === "public_cleanup"
  ) {
    return {
      title: tr(
        t(
          "Approved; publication in progress",
          "Zatwierdzono; publikacja trwa",
          "Genehmigt; Veröffentlichung läuft",
          "Đã duyệt; đang xuất bản",
        ),
      ),
      description: tr(
        isUpdate
          ? t(
              "The approved update is being prepared. The previous public version remains visible until it is replaced.",
              "Zatwierdzona aktualizacja jest przygotowywana. Poprzednia wersja pozostaje widoczna do czasu zastąpienia.",
              "Das genehmigte Update wird vorbereitet. Die vorherige öffentliche Version bleibt bis zur Ersetzung sichtbar.",
              "Bản cập nhật đã duyệt đang được chuẩn bị. Phiên bản công khai trước đó vẫn hiển thị cho đến khi được thay thế.",
            )
          : t(
              "The approved revision is being prepared for the marketplace.",
              "Zatwierdzona wersja jest przygotowywana do publikacji.",
              "Die genehmigte Version wird für den Marktplatz vorbereitet.",
              "Phiên bản đã duyệt đang được chuẩn bị cho marketplace.",
            ),
      ),
      className: "border-sky-400 bg-sky-50 text-sky-950",
      action: null,
    };
  }

  if (status.review?.status === "pending") {
    return {
      title: tr(
        t(
          "Pending administrator review",
          "Oczekuje na weryfikację administratora",
          "Wartet auf Administratorprüfung",
          "Đang chờ quản trị viên duyệt",
        ),
      ),
      description: tr(
        isUpdate
          ? t(
              "The submitted update is awaiting a decision. The current public version remains visible.",
              "Przesłana aktualizacja oczekuje na decyzję. Obecna wersja publiczna pozostaje widoczna.",
              "Das eingereichte Update wartet auf eine Entscheidung. Die aktuelle öffentliche Version bleibt sichtbar.",
              "Bản cập nhật đã gửi đang chờ quyết định. Phiên bản công khai hiện tại vẫn hiển thị.",
            )
          : t(
              "The submitted revision is not public yet. This page will update when a decision is made.",
              "Przesłana wersja nie jest jeszcze publiczna. Ta strona zaktualizuje się po podjęciu decyzji.",
              "Die eingereichte Version ist noch nicht öffentlich. Diese Seite wird nach der Entscheidung aktualisiert.",
              "Phiên bản đã gửi chưa công khai. Trang này sẽ cập nhật khi có quyết định.",
            ),
      ),
      className: "border-amber-400 bg-amber-50 text-amber-950",
      action: null,
    };
  }

  if (status.review?.status === "changes_requested") {
    return {
      title: tr(
        t("Changes requested", "Wymagane zmiany", "Änderungen erforderlich", "Yêu cầu thay đổi"),
      ),
      description:
        status.review.sellerVisibleReason ??
        tr(
          t(
            "Review the product and submit a corrected revision.",
            "Sprawdź produkt i prześlij poprawioną wersję.",
            "Prüfen Sie das Produkt und reichen Sie eine korrigierte Version ein.",
            "Hãy xem lại sản phẩm và gửi phiên bản đã sửa.",
          ),
        ),
      className: "border-orange-400 bg-orange-50 text-orange-950",
      action: null,
    };
  }

  if (status.review?.status === "rejected") {
    return {
      title: tr(
        isUpdate
          ? t(
              "Product update rejected",
              "Aktualizacja produktu odrzucona",
              "Produktupdate abgelehnt",
              "Bản cập nhật sản phẩm bị từ chối",
            )
          : t("Product rejected", "Produkt odrzucony", "Produkt abgelehnt", "Sản phẩm bị từ chối"),
      ),
      description:
        status.review.sellerVisibleReason ??
        tr(
          t(
            "The submitted revision was not approved.",
            "Przesłana wersja nie została zatwierdzona.",
            "Die eingereichte Version wurde nicht genehmigt.",
            "Phiên bản đã gửi không được duyệt.",
          ),
        ),
      className: "border-destructive bg-destructive/10 text-destructive",
      action: null,
    };
  }

  if (status.publicState === "published") {
    if (status.marketplaceVisibility === "storefront_disabled") {
      return {
        title: tr(
          t(
            "Product published; storefront disabled",
            "Produkt opublikowany; sklep wyłączony",
            "Produkt veröffentlicht; Shop deaktiviert",
            "Sản phẩm đã xuất bản; gian hàng bị tắt",
          ),
        ),
        description: tr(
          t(
            "The product is ready, but it will not appear in the marketplace until you enable your storefront.",
            "Produkt jest opublikowany, ale pozostanie ukryty, dopóki nie włączysz sklepu.",
            "Das Produkt ist veröffentlicht, bleibt aber verborgen, bis Sie Ihren Shop aktivieren.",
            "Sản phẩm đã xuất bản nhưng sẽ bị ẩn cho đến khi bạn bật gian hàng.",
          ),
        ),
        className: "border-amber-400 bg-amber-50 text-amber-950",
        action: "storefront_settings",
      };
    }

    if (status.marketplaceVisibility === "seller_approval_required") {
      return {
        title: tr(
          t(
            "Product hidden; seller approval required",
            "Produkt ukryty; wymagane zatwierdzenie sprzedawcy",
            "Produkt verborgen; Verkäufergenehmigung erforderlich",
            "Sản phẩm bị ẩn; cần duyệt người bán",
          ),
        ),
        description: tr(
          t(
            "The product is published, but the seller profile must be approved before it can appear in the marketplace.",
            "Produkt jest opublikowany, ale profil sprzedawcy musi zostać zatwierdzony, zanim pojawi się na rynku.",
            "Das Produkt ist veröffentlicht, aber das Verkäuferprofil muss genehmigt werden, bevor es auf dem Marktplatz erscheint.",
            "Sản phẩm đã xuất bản nhưng hồ sơ người bán phải được duyệt trước khi sản phẩm xuất hiện trên marketplace.",
          ),
        ),
        className: "border-destructive bg-destructive/10 text-destructive",
        action: null,
      };
    }

    return {
      title: tr(
        t(
          "Product published",
          "Produkt opublikowany",
          "Produkt veröffentlicht",
          "Sản phẩm đã xuất bản",
        ),
      ),
      description:
        status.activation?.displayState === "public_cleanup_required"
          ? tr(
              t(
                "The product is public. An administrator must finish internal cleanup.",
                "Produkt jest publiczny. Administrator musi dokończyć wewnętrzne czyszczenie.",
                "Das Produkt ist öffentlich. Ein Administrator muss die interne Bereinigung abschließen.",
                "Sản phẩm đã công khai. Quản trị viên phải hoàn tất dọn dẹp nội bộ.",
              ),
            )
          : tr(
              t(
                "The approved product is now visible in the marketplace.",
                "Zatwierdzony produkt jest teraz widoczny na rynku.",
                "Das genehmigte Produkt ist jetzt auf dem Marktplatz sichtbar.",
                "Sản phẩm đã duyệt hiện hiển thị trên marketplace.",
              ),
            ),
      className: "border-emerald-500 bg-emerald-50 text-emerald-950",
      action: "public_product",
    };
  }

  return null;
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
