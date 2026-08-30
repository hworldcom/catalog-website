import { BookOpen, MessageCircle, Search, type LucideIcon } from "lucide-react";

import { PublicContainer } from "@/components/layout/public-container";
import { t, tr, type T } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { JoinSectionHeading } from "./join-section-heading";

type ConnectionStep = {
  number: string;
  icon: LucideIcon;
  title: T;
  description: T;
};

const C = {
  eyebrow: t("How it works", "Jak to działa", "So funktioniert es", "Cách hoạt động"),
  title: t(
    "One simple path from catalogue to conversation.",
    "Prosta droga od katalogu do rozmowy.",
    "Ein einfacher Weg vom Katalog zum Gespräch.",
    "Một hành trình đơn giản từ danh mục đến cuộc trao đổi.",
  ),
  promise: t(
    "Browse online. Trade however works for you.",
    "Przeglądaj online. Handluj tak, jak Ci wygodnie.",
    "Online stöbern. Handeln, wie es für Sie passt.",
    "Xem hàng trực tuyến. Giao dịch theo cách phù hợp với bạn.",
  ),
};

const CONNECTION_STEPS: ConnectionStep[] = [
  {
    number: "01",
    icon: BookOpen,
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
    icon: Search,
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
    icon: MessageCircle,
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

export function JoinConnectionSection() {
  return (
    <section className="border-y border-border bg-secondary" data-testid="join-connection-section">
      <PublicContainer className="py-14 sm:py-20">
        <JoinSectionHeading eyebrow={tr(C.eyebrow)} title={tr(C.title)} />
        <ol className="mt-10 grid md:grid-cols-3" data-testid="join-connection-steps">
          {CONNECTION_STEPS.map((step, index) => {
            const Icon = step.icon;

            return (
              <li
                key={step.number}
                className={cn(
                  "min-w-0 py-6 first:pt-0 last:pb-0 md:py-0",
                  index > 0 && "border-t border-border md:border-l md:border-t-0 md:pl-8",
                  index < CONNECTION_STEPS.length - 1 && "md:pr-8",
                )}
              >
                <div className="flex items-center justify-between gap-4 text-primary">
                  <span className="font-display text-xs">{step.number}</span>
                  <Icon
                    aria-hidden="true"
                    className="size-5 shrink-0"
                    data-testid={`join-connection-icon-${step.number}`}
                    strokeWidth={1.75}
                  />
                </div>
                <h3 className="mt-4 break-words font-display text-xl font-semibold">
                  {tr(step.title)}
                </h3>
                <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
                  {tr(step.description)}
                </p>
              </li>
            );
          })}
        </ol>
        <p className="mt-10 break-words font-display text-xl font-semibold text-primary sm:text-2xl">
          {tr(C.promise)}
        </p>
      </PublicContainer>
    </section>
  );
}
