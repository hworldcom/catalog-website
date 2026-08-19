import { Link } from "@tanstack/react-router";

import type { SellerProfileModerationSnapshot } from "@/features/seller/seller-profile-moderation.types";
import { t, tr, type T } from "@/lib/i18n";

type SellerApprovalBannerSnapshot = Pick<
  SellerProfileModerationSnapshot,
  "approvalState" | "latestSubmission"
>;

type BannerContent = {
  action: T;
  description: T;
  title: T;
  tone: "attention" | "pending" | "rejected";
};

const copy = {
  completeProfile: t(
    "Complete profile",
    "Uzupełnij profil",
    "Profil vervollständigen",
    "Hoàn thiện hồ sơ",
  ),
  draftTitle: t(
    "Seller profile approval required",
    "Wymagane zatwierdzenie profilu sprzedawcy",
    "Freigabe des Verkäuferprofils erforderlich",
    "Cần phê duyệt hồ sơ người bán",
  ),
  draftDescription: t(
    "Complete your profile and submit it before your storefront or products can become public.",
    "Uzupełnij profil i wyślij go, zanim sklep lub produkty będą mogły stać się publiczne.",
    "Vervollständige dein Profil und reiche es ein, bevor dein Shop oder deine Produkte öffentlich werden können.",
    "Hoàn thiện và gửi hồ sơ trước khi gian hàng hoặc sản phẩm có thể được công khai.",
  ),
  waitingTitle: t(
    "Waiting for administrator approval",
    "Oczekiwanie na zatwierdzenie administratora",
    "Warten auf die Freigabe der Administration",
    "Đang chờ quản trị viên phê duyệt",
  ),
  waitingDescription: t(
    "Your submitted seller profile is under review. Your storefront and products remain private.",
    "Wysłany profil sprzedawcy jest sprawdzany. Sklep i produkty pozostają prywatne.",
    "Dein eingereichtes Verkäuferprofil wird geprüft. Shop und Produkte bleiben privat.",
    "Hồ sơ người bán đã gửi đang được xét duyệt. Gian hàng và sản phẩm vẫn ở chế độ riêng tư.",
  ),
  viewSubmission: t(
    "View submission",
    "Zobacz zgłoszenie",
    "Einreichung ansehen",
    "Xem hồ sơ đã gửi",
  ),
  changesTitle: t(
    "Seller profile changes requested",
    "Wymagane zmiany profilu sprzedawcy",
    "Änderungen am Verkäuferprofil erforderlich",
    "Yêu cầu chỉnh sửa hồ sơ người bán",
  ),
  changesDescription: t(
    "Review the administrator feedback, update your profile, and submit it again.",
    "Sprawdź uwagi administratora, zaktualizuj profil i wyślij go ponownie.",
    "Prüfe die Rückmeldung, aktualisiere dein Profil und reiche es erneut ein.",
    "Xem phản hồi của quản trị viên, cập nhật hồ sơ và gửi lại.",
  ),
  reviewChanges: t("Review changes", "Sprawdź zmiany", "Änderungen prüfen", "Xem thay đổi"),
  rejectedTitle: t(
    "Seller profile was rejected",
    "Profil sprzedawcy został odrzucony",
    "Verkäuferprofil wurde abgelehnt",
    "Hồ sơ người bán đã bị từ chối",
  ),
  rejectedDescription: t(
    "Review the administrator feedback, edit your profile, and submit a new revision.",
    "Sprawdź uwagi administratora, edytuj profil i wyślij nową wersję.",
    "Prüfe die Rückmeldung, bearbeite dein Profil und reiche eine neue Version ein.",
    "Xem phản hồi của quản trị viên, chỉnh sửa hồ sơ và gửi phiên bản mới.",
  ),
  editAndResubmit: t(
    "Edit and resubmit",
    "Edytuj i wyślij ponownie",
    "Bearbeiten und erneut einreichen",
    "Chỉnh sửa và gửi lại",
  ),
  feedback: t(
    "Administrator feedback",
    "Uwagi administratora",
    "Rückmeldung der Administration",
    "Phản hồi của quản trị viên",
  ),
};

const toneClasses: Record<BannerContent["tone"], string> = {
  attention: "border-amber-500/40 bg-amber-500/5",
  pending: "border-blue-500/40 bg-blue-500/5",
  rejected: "border-destructive/40 bg-destructive/5",
};

export function SellerApprovalBanner({ snapshot }: { snapshot: SellerApprovalBannerSnapshot }) {
  if (snapshot.approvalState !== "not_approved") return null;

  const content = bannerContent(snapshot.latestSubmission?.status ?? null);
  const feedback =
    snapshot.latestSubmission?.status === "changes_requested" ||
    snapshot.latestSubmission?.status === "rejected"
      ? snapshot.latestSubmission.sellerVisibleReason
      : null;

  return (
    <section
      role="status"
      data-state={snapshot.latestSubmission?.status ?? "not_submitted"}
      className={`border p-4 ${toneClasses[content.tone]}`}
    >
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold">{tr(content.title)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{tr(content.description)}</p>
          {feedback ? (
            <p className="mt-2 whitespace-pre-wrap text-sm">
              <span className="font-medium">{tr(copy.feedback)}:</span> {feedback}
            </p>
          ) : null}
        </div>
        <Link
          to="/seller/storefront"
          className="shrink-0 border border-border bg-background px-3 py-2 text-sm font-medium hover:border-primary"
        >
          {tr(content.action)}
        </Link>
      </div>
    </section>
  );
}

function bannerContent(
  status: SellerProfileModerationSnapshot["latestSubmission"] extends infer Submission
    ? Submission extends { status: infer Status }
      ? Status | null
      : null
    : null,
): BannerContent {
  if (status === "pending") {
    return {
      action: copy.viewSubmission,
      description: copy.waitingDescription,
      title: copy.waitingTitle,
      tone: "pending",
    };
  }
  if (status === "changes_requested") {
    return {
      action: copy.reviewChanges,
      description: copy.changesDescription,
      title: copy.changesTitle,
      tone: "attention",
    };
  }
  if (status === "rejected") {
    return {
      action: copy.editAndResubmit,
      description: copy.rejectedDescription,
      title: copy.rejectedTitle,
      tone: "rejected",
    };
  }
  return {
    action: copy.completeProfile,
    description: copy.draftDescription,
    title: copy.draftTitle,
    tone: "attention",
  };
}
