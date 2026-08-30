import { Handshake, MessageCircle, Search, type LucideIcon } from "lucide-react";

import { PublicContainer } from "@/components/layout/public-container";
import { t, tr, type T } from "@/lib/i18n";

const P = {
  title: t("How it works", "Jak to działa", "So funktioniert's", "Cách hoạt động"),
  subtitle: t(
    "Three steps, zero fees to browse",
    "Trzy kroki, przeglądanie za darmo",
    "Drei Schritte, kostenloses Stöbern",
    "Ba bước, duyệt miễn phí",
  ),
  browseTitle: t("Browse", "Przeglądaj", "Stöbern", "Duyệt"),
  browseDescription: t(
    "Explore catalogs across categories and suppliers.",
    "Przeglądaj katalogi w różnych kategoriach i u dostawców.",
    "Kataloge über Kategorien und Lieferanten hinweg erkunden.",
    "Khám phá danh mục theo phân loại và nhà cung cấp.",
  ),
  inquireTitle: t("Inquire", "Zapytaj", "Anfragen", "Yêu cầu"),
  inquireDescription: t(
    "Send a message or open WhatsApp with the seller directly.",
    "Wyślij wiadomość lub otwórz WhatsApp bezpośrednio ze sprzedawcą.",
    "Nachricht senden oder WhatsApp direkt mit dem Verkäufer öffnen.",
    "Gửi tin nhắn hoặc mở WhatsApp trực tiếp với nhà bán.",
  ),
  dealTitle: t("Deal", "Umowa", "Abschluss", "Chốt đơn"),
  dealDescription: t(
    "Negotiate pricing, MOQ and shipping off-platform.",
    "Negocjuj ceny, MOQ i wysyłkę poza platformą.",
    "Preis, MBM und Versand außerhalb der Plattform aushandeln.",
    "Thương lượng giá, SL tối thiểu và vận chuyển ngoài nền tảng.",
  ),
};

const PROCESS_STEPS: Array<{
  number: string;
  icon: LucideIcon;
  iconTestId: string;
  title: T;
  description: T;
}> = [
  {
    number: "01",
    icon: Search,
    iconTestId: "process-icon-browse",
    title: P.browseTitle,
    description: P.browseDescription,
  },
  {
    number: "02",
    icon: MessageCircle,
    iconTestId: "process-icon-inquire",
    title: P.inquireTitle,
    description: P.inquireDescription,
  },
  {
    number: "03",
    icon: Handshake,
    iconTestId: "process-icon-deal",
    title: P.dealTitle,
    description: P.dealDescription,
  },
];

export function MarketplaceProcessSection() {
  return (
    <section className="bg-secondary py-12 sm:py-14 lg:py-20" data-testid="marketplace-process">
      <PublicContainer>
        <div className="text-center">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">{tr(P.title)}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{tr(P.subtitle)}</p>
        </div>

        <ol className="mt-8 grid sm:mt-10 sm:grid-cols-3">
          {PROCESS_STEPS.map((step, index) => {
            const Icon = step.icon;
            const hasSeparator = index < PROCESS_STEPS.length - 1;

            return (
              <li
                key={step.number}
                className={`min-w-0 py-6 first:pt-0 last:pb-0 sm:px-8 sm:py-0 sm:first:pl-0 sm:last:pr-0 ${
                  hasSeparator ? "border-b border-border sm:border-b-0 sm:border-r" : ""
                }`}
              >
                <div className="flex h-6 items-center gap-3 text-primary">
                  <Icon
                    aria-hidden="true"
                    className="size-5 shrink-0"
                    data-testid={step.iconTestId}
                    strokeWidth={1.75}
                  />
                  <span className="text-xs font-semibold tabular-nums">{step.number}</span>
                </div>
                <h3 className="mt-4 break-words font-display text-xl font-semibold">
                  {tr(step.title)}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {tr(step.description)}
                </p>
              </li>
            );
          })}
        </ol>
      </PublicContainer>
    </section>
  );
}
