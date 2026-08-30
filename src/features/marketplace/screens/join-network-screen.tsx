import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PublicShell } from "@/components/layout/public-shell";
import { t, tr, type T } from "@/lib/i18n";

import { JoinAudiencePanels } from "../components/join-audience-panels";
import { JoinPageHero } from "../components/join-page-hero";
import { joinAudienceCopy } from "../join-audience-copy";
import type { PublicAudience } from "../public-audience";

type Benefit = {
  number: string;
  title: T;
  description: T;
};

const J = {
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
  sellerStartEyebrow: t(
    "Simple setup",
    "Prosta konfiguracja",
    "Einfacher Einstieg",
    "Thiết lập đơn giản",
  ),
  sellerStartTitle: t(
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
  howEyebrow: t("How it works", "Jak to działa", "So funktioniert es", "Cách hoạt động"),
  howTitle: t(
    "One simple path from catalogue to conversation.",
    "Prosta droga od katalogu do rozmowy.",
    "Ein einfacher Weg vom Katalog zum Gespräch.",
    "Một hành trình đơn giản từ danh mục đến cuộc trao đổi.",
  ),
  howPromise: t(
    "Browse online. Trade however works for you.",
    "Przeglądaj online. Handluj tak, jak Ci wygodnie.",
    "Online stöbern. Handeln, wie es für Sie passt.",
    "Xem hàng trực tuyến. Giao dịch theo cách phù hợp với bạn.",
  ),
  independentEyebrow: t(
    "Built on trust",
    "Zbudowane na zaufaniu",
    "Auf Vertrauen gebaut",
    "Xây dựng trên sự tin cậy",
  ),
  independentTitle: t(
    "One Network. Independent Businesses.",
    "Jedna sieć. Niezależne firmy.",
    "Ein Netzwerk. Unabhängige Unternehmen.",
    "Một mạng lưới. Các doanh nghiệp độc lập.",
  ),
  sellerKeepsTitle: t(
    "Sellers stay in control",
    "Sprzedawcy zachowują kontrolę",
    "Verkäufer behalten die Kontrolle",
    "Người bán luôn giữ quyền kiểm soát",
  ),
  sellerKeeps: t(
    "Your identity, catalogue, branding, prices, customers and business relationships remain yours.",
    "Twoja tożsamość, katalog, marka, ceny, klienci i relacje biznesowe pozostają Twoje.",
    "Identität, Katalog, Marke, Preise, Kunden und Geschäftsbeziehungen bleiben in Ihrer Hand.",
    "Danh tính, danh mục, thương hiệu, giá cả, khách hàng và quan hệ kinh doanh vẫn thuộc về bạn.",
  ),
  buyerGainsTitle: t(
    "Buyers gain a clearer view",
    "Kupujący zyskują lepszy przegląd",
    "Einkäufer gewinnen einen besseren Überblick",
    "Người mua có cái nhìn rõ ràng hơn",
  ),
  buyerGains: t(
    "Discover published products and suppliers in one place, then speak with the seller directly.",
    "Odkrywaj opublikowane produkty i dostawców w jednym miejscu, a następnie rozmawiaj bezpośrednio ze sprzedawcą.",
    "Entdecken Sie veröffentlichte Produkte und Lieferanten an einem Ort und sprechen Sie anschließend direkt mit dem Verkäufer.",
    "Khám phá sản phẩm và nhà cung cấp đã công bố tại một nơi, sau đó trao đổi trực tiếp với người bán.",
  ),
  finalEyebrow: t("Start here", "Zacznij tutaj", "Hier starten", "Bắt đầu tại đây"),
  finalTitle: t(
    "Take the next step with Bazoria.",
    "Zrób kolejny krok z Bazoria.",
    "Machen Sie den nächsten Schritt mit Bazoria.",
    "Bắt đầu bước tiếp theo cùng Bazoria.",
  ),
  finalLead: t(
    "Create a seller account or start exploring the wholesale catalogue—no buyer account required.",
    "Utwórz konto sprzedawcy lub zacznij przeglądać katalog hurtowy — konto kupującego nie jest wymagane.",
    "Erstellen Sie ein Verkäuferkonto oder entdecken Sie den Großhandelskatalog – ganz ohne Käuferkonto.",
    "Tạo tài khoản người bán hoặc bắt đầu khám phá danh mục bán buôn — không cần tài khoản người mua.",
  ),
  sellAction: t(
    "Sell on Bazoria",
    "Sprzedawaj na Bazoria",
    "Auf Bazoria verkaufen",
    "Bán hàng trên Bazoria",
  ),
};

const sellerBenefits: Benefit[] = [
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

const buyerBenefits: Benefit[] = [
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

const sellerStartSteps: Benefit[] = [
  {
    number: "01",
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

const networkSteps: Benefit[] = [
  {
    number: "01",
    title: t(
      "Seller publishes",
      "Sprzedawca publikuje",
      "Verkäufer veröffentlicht",
      "Người bán công bố",
    ),
    description: t(
      "Products appear in a branded wholesale catalogue.",
      "Produkty pojawiają się w markowym katalogu hurtowym.",
      "Produkte erscheinen in einem eigenen Großhandelskatalog.",
      "Sản phẩm xuất hiện trong danh mục bán buôn mang thương hiệu riêng.",
    ),
  },
  {
    number: "02",
    title: t("Buyer discovers", "Kupujący odkrywa", "Einkäufer entdeckt", "Người mua khám phá"),
    description: t(
      "A product or supplier is found through Bazoria.",
      "Produkt lub dostawca zostaje znaleziony przez Bazoria.",
      "Ein Produkt oder Lieferant wird über Bazoria gefunden.",
      "Sản phẩm hoặc nhà cung cấp được tìm thấy qua Bazoria.",
    ),
  },
  {
    number: "03",
    title: t(
      "Both sides connect",
      "Obie strony się kontaktują",
      "Beide Seiten verbinden sich",
      "Hai bên kết nối",
    ),
    description: t(
      "They continue through an inquiry, WhatsApp or a physical showroom.",
      "Kontynuują przez zapytanie, WhatsApp lub wizytę w showroomie.",
      "Der Austausch geht per Anfrage, WhatsApp oder im Showroom weiter.",
      "Họ tiếp tục qua yêu cầu, WhatsApp hoặc gặp tại showroom.",
    ),
  },
];

export function JoinNetworkScreen({ audience }: { audience: PublicAudience }) {
  return (
    <PublicShell marketplaceAudience={audience}>
      <JoinPageHero />

      <JoinAudiencePanels audience={audience} />

      <BenefitSection
        id="for-sellers"
        eyebrow={tr(joinAudienceCopy.seller.label)}
        title={tr(J.sellerTitle)}
        lead={tr(joinAudienceCopy.seller.lead)}
        promise={tr(J.sellerPromise)}
        benefits={sellerBenefits}
        action={<SellerGettingStarted />}
      />

      <BenefitSection
        id="for-buyers"
        eyebrow={tr(joinAudienceCopy.buyer.label)}
        title={tr(J.buyerTitle)}
        lead={tr(joinAudienceCopy.buyer.lead)}
        benefits={buyerBenefits}
        muted
      />

      <section className="border-y border-border/60 bg-primary/5">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
          <SectionHeading eyebrow={tr(J.howEyebrow)} title={tr(J.howTitle)} />
          <div className="mt-10 grid gap-px overflow-hidden border border-border/60 bg-border/60 md:grid-cols-3">
            {networkSteps.map((step) => (
              <article key={step.number} className="bg-background p-6 sm:p-8">
                <p className="font-display text-xs tracking-[0.2em] text-primary">{step.number}</p>
                <h3 className="mt-3 font-display text-xl font-semibold">{tr(step.title)}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {tr(step.description)}
                </p>
              </article>
            ))}
          </div>
          <p className="mt-8 font-display text-xl font-semibold text-primary sm:text-2xl">
            {tr(J.howPromise)}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
        <SectionHeading eyebrow={tr(J.independentEyebrow)} title={tr(J.independentTitle)} />
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <TrustPanel title={tr(J.sellerKeepsTitle)} body={tr(J.sellerKeeps)} />
          <TrustPanel title={tr(J.buyerGainsTitle)} body={tr(J.buyerGains)} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16 sm:pb-24">
        <div className="border border-primary/40 bg-primary/10 p-8 sm:p-12">
          <p className="text-xs uppercase tracking-[0.2em] text-primary/80">{tr(J.finalEyebrow)}</p>
          <h2 className="mt-3 max-w-3xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {tr(J.finalTitle)}
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            {tr(J.finalLead)}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/auth"
              search={(previous) => ({ ...previous })}
              className="inline-flex min-h-11 items-center justify-center bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {tr(J.sellAction)}
            </Link>
            <Link
              to="/c/$category"
              params={{ category: "fashion" }}
              search={(previous) => ({ ...previous, audience })}
              className="inline-flex min-h-11 items-center justify-center border border-primary/60 px-5 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {tr(joinAudienceCopy.actions.browseProducts)}
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

function BenefitSection({
  id,
  eyebrow,
  title,
  lead,
  promise,
  benefits,
  action,
  muted = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead: string;
  promise?: string;
  benefits: Benefit[];
  action?: ReactNode;
  muted?: boolean;
}) {
  return (
    <section
      id={id}
      tabIndex={-1}
      className={`scroll-mt-48 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset ${muted ? "bg-card/20" : "bg-background"}`}
    >
      <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
        <SectionHeading eyebrow={eyebrow} title={title} lead={lead} />
        {promise ? (
          <p className="mt-6 border-l-2 border-primary pl-4 font-display text-lg font-semibold text-primary">
            {promise}
          </p>
        ) : null}
        <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
          {benefits.map((benefit) => (
            <article key={benefit.number} className="grid grid-cols-[2.5rem_1fr] gap-3">
              <p className="pt-1 font-display text-xs tracking-[0.18em] text-primary">
                {benefit.number}
              </p>
              <div>
                <h3 className="font-display text-lg font-semibold">{tr(benefit.title)}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {tr(benefit.description)}
                </p>
              </div>
            </article>
          ))}
        </div>
        {action ? <div className="mt-10">{action}</div> : null}
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs uppercase tracking-[0.2em] text-primary/80">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {lead ? (
        <p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">{lead}</p>
      ) : null}
    </div>
  );
}

function TrustPanel({ title, body }: { title: string; body: string }) {
  return (
    <article className="border border-border/60 bg-card/30 p-6 sm:p-8">
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
    </article>
  );
}

function SellerGettingStarted() {
  return (
    <div className="border border-primary/40 bg-primary/5 p-6 sm:p-8">
      <p className="text-xs uppercase tracking-[0.2em] text-primary/80">
        {tr(J.sellerStartEyebrow)}
      </p>
      <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        {tr(J.sellerStartTitle)}
      </h3>
      <ol className="mt-7 grid gap-6 md:grid-cols-3">
        {sellerStartSteps.map((step) => (
          <li key={step.number} className="border-t border-border/60 pt-4">
            <p className="font-display text-xs tracking-[0.18em] text-primary">{step.number}</p>
            <h4 className="mt-2 font-display text-lg font-semibold">{tr(step.title)}</h4>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{tr(step.description)}</p>
          </li>
        ))}
      </ol>
      <Link
        to="/auth"
        search={(previous) => ({ ...previous })}
        className="mt-8 inline-flex min-h-11 items-center justify-center bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        {tr(joinAudienceCopy.actions.createSellerAccount)}
      </Link>
    </div>
  );
}
