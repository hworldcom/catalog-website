import { PublicContainer } from "@/components/layout/public-container";
import { t, tr } from "@/lib/i18n";

const H = {
  kicker: t(
    "Bringing Europe's traditional wholesale centres online.",
    "Przenosimy tradycyjne europejskie centra hurtowe do internetu.",
    "Wir bringen Europas traditionelle Großhandelszentren online.",
    "Đưa các trung tâm bán buôn truyền thống của châu Âu lên trực tuyến.",
  ),
  title: t(
    "Join the Wholesale Network",
    "Dołącz do sieci hurtowej",
    "Werden Sie Teil des Großhandelsnetzwerks",
    "Tham gia mạng lưới bán buôn",
  ),
  lead: t(
    "More visibility for sellers. Easier sourcing for buyers.",
    "Większa widoczność sprzedawców. Łatwiejsze zaopatrzenie dla kupujących.",
    "Mehr Sichtbarkeit für Verkäufer. Einfachere Beschaffung für Einkäufer.",
    "Người bán được biết đến nhiều hơn. Người mua tìm nguồn hàng dễ dàng hơn.",
  ),
  introduction: t(
    "Bazoria connects wholesalers and professional buyers across Europe while supporting the relationships and ways of trading they already trust.",
    "Bazoria łączy hurtowników i profesjonalnych kupujących w całej Europie, wspierając relacje i sposoby handlu, którym już ufają.",
    "Bazoria verbindet Großhändler und professionelle Einkäufer in ganz Europa und unterstützt dabei bewährte Geschäftsbeziehungen und Handelswege.",
    "Bazoria kết nối nhà bán buôn và người mua chuyên nghiệp trên khắp châu Âu, đồng thời hỗ trợ các mối quan hệ và cách giao dịch mà họ đã tin dùng.",
  ),
  buyerJump: t("I'm a buyer", "Jestem kupującym", "Ich kaufe ein", "Tôi là người mua"),
  sellerJump: t("I'm a seller", "Jestem sprzedawcą", "Ich verkaufe", "Tôi là người bán"),
};

export function JoinPageHero() {
  return (
    <section
      aria-labelledby="join-page-title"
      className="border-b border-border bg-accent py-12 text-center sm:py-16 lg:py-20"
      data-testid="join-page-hero"
    >
      <PublicContainer>
        <p className="mx-auto max-w-3xl text-xs font-semibold uppercase text-primary">
          {tr(H.kicker)}
        </p>
        <h1
          id="join-page-title"
          className="mx-auto mt-4 max-w-4xl break-normal font-display text-[1.625rem] font-semibold sm:text-5xl"
        >
          {tr(H.title)}
        </h1>
        <p className="mx-auto mt-5 max-w-3xl font-display text-xl text-foreground sm:text-2xl">
          {tr(H.lead)}
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          {tr(H.introduction)}
        </p>
        <div className="mx-auto mt-8 flex max-w-md flex-col justify-center gap-3 sm:max-w-none sm:flex-row">
          <JumpLink targetId="for-buyers">{tr(H.buyerJump)}</JumpLink>
          <JumpLink targetId="for-sellers">{tr(H.sellerJump)}</JumpLink>
        </div>
      </PublicContainer>
    </section>
  );
}

function JumpLink({ targetId, children }: { targetId: string; children: string }) {
  return (
    <a
      href={`#${targetId}`}
      aria-controls={targetId}
      onClick={() => document.getElementById(targetId)?.focus({ preventScroll: true })}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-sm border border-primary/60 bg-card/40 px-5 py-2.5 text-center text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
    >
      {children}
    </a>
  );
}
