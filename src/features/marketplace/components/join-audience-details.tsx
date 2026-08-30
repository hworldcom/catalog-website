import { Link } from "@tanstack/react-router";
import { PackagePlus, Store, UserPlus, type LucideIcon } from "lucide-react";

import { PublicContainer } from "@/components/layout/public-container";
import { t, tr, type T } from "@/lib/i18n";

import { joinAudienceCopy } from "../join-audience-copy";
import type { PublicAudience } from "../public-audience";
import { JoinSectionHeading } from "./join-section-heading";

type DetailItem = {
  number: string;
  title: T;
  description: T;
};

type OnboardingStep = DetailItem & {
  icon: LucideIcon;
};

const D = {
  sellerTitle: t(
    "Show more. Send less. Reach further.",
    "Pokaż więcej. Wysyłaj mniej. Docieraj dalej.",
    "Mehr zeigen. Weniger senden. Weiter reichen.",
    "Trưng bày nhiều hơn. Gửi ít hơn. Vươn xa hơn.",
  ),
  sellerPromise: t(
    "Upload once. Share everywhere.",
    "Dodaj raz. Udostępniaj wszędzie.",
    "Einmal hochladen. Überall teilen.",
    "Tải lên một lần. Chia sẻ mọi nơi.",
  ),
  onboardingEyebrow: t(
    "Simple setup",
    "Prosta konfiguracja",
    "Einfacher Einstieg",
    "Thiết lập đơn giản",
  ),
  onboardingTitle: t(
    "Start selling in three steps",
    "Zacznij sprzedawać w trzech krokach",
    "In drei Schritten mit dem Verkauf starten",
    "Bắt đầu bán hàng trong ba bước",
  ),
  buyerTitle: t(
    "Discover more. Search faster. Source closer.",
    "Odkrywaj więcej. Szukaj szybciej. Kupuj bliżej.",
    "Mehr entdecken. Schneller suchen. Näher beschaffen.",
    "Khám phá nhiều hơn. Tìm nhanh hơn. Lấy hàng gần hơn.",
  ),
};

const SELLER_BENEFITS: DetailItem[] = [
  {
    number: "01",
    title: joinAudienceCopy.seller.benefitTitles.createCatalogue,
    description: t(
      "Present published products and images in one branded wholesale storefront.",
      "Prezentuj opublikowane produkty i zdjęcia w jednym markowym sklepie hurtowym.",
      "Präsentieren Sie veröffentlichte Produkte und Bilder in einem eigenen Großhandelsauftritt.",
      "Trưng bày sản phẩm và hình ảnh đã công bố trong một gian hàng bán buôn mang thương hiệu riêng.",
    ),
  },
  {
    number: "02",
    title: joinAudienceCopy.seller.benefitTitles.shareAnywhere,
    description: t(
      "Send a catalogue or product link through WhatsApp, social media, email or any channel your customers use.",
      "Wysyłaj link do katalogu lub produktu przez WhatsApp, media społecznościowe, e-mail lub inny kanał używany przez klientów.",
      "Teilen Sie Katalog- oder Produktlinks über WhatsApp, soziale Medien, E-Mail oder jeden anderen Kundenkanal.",
      "Gửi liên kết danh mục hoặc sản phẩm qua WhatsApp, mạng xã hội, email hoặc bất kỳ kênh nào khách hàng sử dụng.",
    ),
  },
  {
    number: "03",
    title: t(
      "Open the rest of your range",
      "Pokaż całą ofertę",
      "Öffnen Sie den Blick auf Ihr Sortiment",
      "Mở ra toàn bộ danh mục hàng hóa",
    ),
    description: t(
      "One product link can lead a buyer into the rest of your published catalogue.",
      "Jeden link do produktu może zaprowadzić kupującego do całego opublikowanego katalogu.",
      "Ein Produktlink kann Einkäufer zu Ihrem gesamten veröffentlichten Sortiment führen.",
      "Một liên kết sản phẩm có thể dẫn người mua đến toàn bộ danh mục đã công bố của bạn.",
    ),
  },
  {
    number: "04",
    title: joinAudienceCopy.seller.benefitTitles.reachBuyers,
    description: t(
      "Become discoverable beyond the customers and social audiences you already know.",
      "Daj się znaleźć poza gronem klientów i odbiorców społecznościowych, których już znasz.",
      "Werden Sie über Ihre bestehenden Kunden und Social-Media-Zielgruppen hinaus sichtbar.",
      "Được tìm thấy ngoài nhóm khách hàng và người theo dõi trên mạng xã hội mà bạn đã biết.",
    ),
  },
  {
    number: "05",
    title: joinAudienceCopy.seller.benefitTitles.keepSelling,
    description: t(
      "Keep WhatsApp, direct inquiries and showroom visits. Bazoria makes those relationships easier to start.",
      "Korzystaj dalej z WhatsApp, bezpośrednich zapytań i wizyt w showroomie. Bazoria ułatwia rozpoczęcie tych relacji.",
      "Nutzen Sie weiter WhatsApp, direkte Anfragen und Showroom-Besuche. Bazoria erleichtert den ersten Kontakt.",
      "Tiếp tục dùng WhatsApp, yêu cầu trực tiếp và gặp tại showroom. Bazoria giúp những mối quan hệ đó bắt đầu dễ dàng hơn.",
    ),
  },
];

const BUYER_BENEFITS: DetailItem[] = [
  {
    number: "01",
    title: joinAudienceCopy.buyer.benefitTitles.discoverWholesalers,
    description: t(
      "Look beyond existing contacts and explore suppliers across the network.",
      "Wyjdź poza dotychczasowe kontakty i odkrywaj dostawców w całej sieci.",
      "Blicken Sie über bestehende Kontakte hinaus und entdecken Sie Lieferanten im gesamten Netzwerk.",
      "Tìm kiếm ngoài các mối liên hệ hiện có và khám phá nhà cung cấp trong toàn mạng lưới.",
    ),
  },
  {
    number: "02",
    title: joinAudienceCopy.buyer.benefitTitles.browseCatalogues,
    description: t(
      "See the products sellers have published without collecting separate photos and messages.",
      "Zobacz produkty opublikowane przez sprzedawców bez zbierania osobnych zdjęć i wiadomości.",
      "Sehen Sie veröffentlichte Produkte, ohne einzelne Fotos und Nachrichten zusammensuchen zu müssen.",
      "Xem sản phẩm người bán đã công bố mà không phải tập hợp từng ảnh và tin nhắn riêng lẻ.",
    ),
  },
  {
    number: "03",
    title: joinAudienceCopy.buyer.benefitTitles.browseBeforeTravel,
    description: t(
      "Review a seller's range online, then ask questions or plan a showroom visit.",
      "Sprawdź ofertę sprzedawcy online, a potem zadaj pytania lub zaplanuj wizytę w showroomie.",
      "Prüfen Sie das Sortiment online und stellen Sie danach Fragen oder planen Sie einen Showroom-Besuch.",
      "Xem danh mục của người bán trực tuyến, sau đó đặt câu hỏi hoặc lên kế hoạch đến showroom.",
    ),
  },
  {
    number: "04",
    title: joinAudienceCopy.buyer.benefitTitles.sourceCloser,
    description: t(
      "Find European wholesalers who may offer shorter lead times, easier replenishment or local pickup.",
      "Znajdź europejskich hurtowników, którzy mogą oferować krótszy czas dostawy, łatwiejsze uzupełnianie zapasów lub odbiór osobisty.",
      "Finden Sie europäische Großhändler mit möglicherweise kürzeren Lieferzeiten, einfacherer Nachbestellung oder Abholung vor Ort.",
      "Tìm các nhà bán buôn châu Âu có thể cung cấp thời gian giao ngắn hơn, bổ sung hàng dễ hơn hoặc nhận hàng tại chỗ.",
    ),
  },
];

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    number: "01",
    icon: UserPlus,
    title: t("Create your account", "Utwórz konto", "Konto erstellen", "Tạo tài khoản"),
    description: t(
      "Continue with Google or sign up with email and password.",
      "Kontynuuj przez Google lub zarejestruj się za pomocą adresu e-mail i hasła.",
      "Mit Google fortfahren oder mit E-Mail-Adresse und Passwort registrieren.",
      "Tiếp tục với Google hoặc đăng ký bằng email và mật khẩu.",
    ),
  },
  {
    number: "02",
    icon: Store,
    title: t(
      "Set up your seller profile",
      "Skonfiguruj profil sprzedawcy",
      "Verkäuferprofil einrichten",
      "Thiết lập hồ sơ người bán",
    ),
    description: t(
      "Add your company and storefront information.",
      "Dodaj informacje o firmie i sklepie.",
      "Fügen Sie Ihre Unternehmens- und Shop-Informationen hinzu.",
      "Thêm thông tin doanh nghiệp và gian hàng của bạn.",
    ),
  },
  {
    number: "03",
    icon: PackagePlus,
    title: t(
      "Build your catalogue",
      "Zbuduj swój katalog",
      "Katalog aufbauen",
      "Xây dựng danh mục",
    ),
    description: t(
      "Upload products and prepare them for publication.",
      "Dodaj produkty i przygotuj je do publikacji.",
      "Laden Sie Produkte hoch und bereiten Sie sie für die Veröffentlichung vor.",
      "Tải sản phẩm lên và chuẩn bị để công bố.",
    ),
  },
];

export function JoinAudienceDetails({ audience }: { audience: PublicAudience }) {
  return (
    <>
      <AudienceDetailSection
        id="for-sellers"
        eyebrow={tr(joinAudienceCopy.seller.label)}
        title={tr(D.sellerTitle)}
        lead={tr(joinAudienceCopy.seller.lead)}
        promise={tr(D.sellerPromise)}
        benefits={SELLER_BENEFITS}
        testId="join-seller-details"
      />

      <SellerOnboarding audience={audience} />

      <AudienceDetailSection
        id="for-buyers"
        eyebrow={tr(joinAudienceCopy.buyer.label)}
        title={tr(D.buyerTitle)}
        lead={tr(joinAudienceCopy.buyer.lead)}
        benefits={BUYER_BENEFITS}
        muted
        testId="join-buyer-details"
      />
    </>
  );
}

function AudienceDetailSection({
  id,
  eyebrow,
  title,
  lead,
  promise,
  benefits,
  muted = false,
  testId,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead: string;
  promise?: string;
  benefits: DetailItem[];
  muted?: boolean;
  testId: string;
}) {
  return (
    <section
      id={id}
      tabIndex={-1}
      className={`scroll-mt-48 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset ${muted ? "bg-card/20" : "bg-background"}`}
      data-testid={testId}
    >
      <PublicContainer className="py-14 sm:py-20">
        <JoinSectionHeading eyebrow={eyebrow} title={title} lead={lead} />
        {promise ? (
          <p className="mt-6 border-l-2 border-primary pl-4 font-display text-lg font-semibold text-primary">
            {promise}
          </p>
        ) : null}
        <DetailList items={benefits} />
      </PublicContainer>
    </section>
  );
}

function DetailList({ items }: { items: DetailItem[] }) {
  return (
    <ol className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
      {items.map((item) => (
        <li key={item.number} className="grid min-w-0 grid-cols-[2.5rem_1fr] gap-3">
          <span className="pt-1 font-display text-xs text-primary">{item.number}</span>
          <div className="min-w-0">
            <h3 className="break-words font-display text-lg font-semibold">{tr(item.title)}</h3>
            <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
              {tr(item.description)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function SellerOnboarding({ audience }: { audience: PublicAudience }) {
  return (
    <section className="border-y border-border bg-secondary" data-testid="join-seller-onboarding">
      <PublicContainer className="py-14 sm:py-20">
        <JoinSectionHeading eyebrow={tr(D.onboardingEyebrow)} title={tr(D.onboardingTitle)} />
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {ONBOARDING_STEPS.map((step) => {
            const Icon = step.icon;

            return (
              <li key={step.number} className="min-w-0 border-t border-border pt-5">
                <div className="flex items-center justify-between gap-4 text-primary">
                  <span className="font-display text-xs">{step.number}</span>
                  <Icon
                    aria-hidden="true"
                    className="size-5 shrink-0"
                    data-testid={`join-onboarding-icon-${step.number}`}
                    strokeWidth={1.75}
                  />
                </div>
                <h3 className="mt-4 break-words font-display text-lg font-semibold">
                  {tr(step.title)}
                </h3>
                <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
                  {tr(step.description)}
                </p>
              </li>
            );
          })}
        </ol>
        <Link
          to="/auth"
          search={(previous) => ({ ...previous, audience: previous.audience ?? audience })}
          className="mt-10 inline-flex min-h-11 max-w-full items-center justify-center rounded-sm bg-primary px-5 py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {tr(joinAudienceCopy.actions.createSellerAccount)}
        </Link>
      </PublicContainer>
    </section>
  );
}
