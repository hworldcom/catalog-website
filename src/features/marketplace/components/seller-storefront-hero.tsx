import { ArrowRight, CalendarDays, CheckCircle, MapPin, MessageCircle } from "lucide-react";

import { t, tr } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

import { SocialShareMenu } from "./social-share-menu";

const H = {
  verified: t(
    "Verified wholesale seller",
    "Zweryfikowany sprzedawca hurtowy",
    "Verifizierter Großhändler",
    "Nhà bán buôn đã xác minh",
  ),
  established: t("Established", "Założono", "Gegründet", "Thành lập"),
  browse: t("Browse catalog", "Przeglądaj katalog", "Katalog ansehen", "Xem danh mục"),
  quote: t("Request a quote", "Poproś o wycenę", "Angebot anfordern", "Yêu cầu báo giá"),
  whatsapp: t("Chat on WhatsApp", "Napisz na WhatsApp", "Auf WhatsApp chatten", "Chat WhatsApp"),
};

export function SellerStorefrontHero({
  sellerName,
  coverImageUrl,
  verified,
  description,
  location,
  establishedYear,
  whatsappUrl,
  hasProducts,
  shareTitle,
  shareUrl,
  language,
}: {
  sellerName: string;
  coverImageUrl: string | null;
  verified: boolean;
  description: string | null;
  location: string;
  establishedYear: number | null;
  whatsappUrl: string | null;
  hasProducts: boolean;
  shareTitle: string;
  shareUrl: string;
  language: Lang;
}) {
  return (
    <section id="top" className="relative scroll-mt-20 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-secondary via-background to-primary/10">
        {coverImageUrl ? (
          <img
            src={coverImageUrl}
            alt=""
            className="h-full w-full object-cover opacity-50"
            fetchPriority="high"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/40 via-transparent to-transparent" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
        <div className="max-w-3xl">
          {verified ? (
            <div className="mb-6 inline-flex items-center gap-2 border border-primary/35 bg-primary/10 px-3 py-1 text-primary">
              <CheckCircle className="h-4 w-4" aria-hidden />
              <span className="text-xs font-medium uppercase tracking-wider">{tr(H.verified)}</span>
            </div>
          ) : null}

          <h1 className="font-display text-5xl font-bold leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            {sellerName}
          </h1>

          {description ? (
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {description}
            </p>
          ) : null}

          {location || establishedYear ? (
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {location ? (
                <span className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" aria-hidden />
                  {location}
                </span>
              ) : null}
              {establishedYear ? (
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
                  {tr(H.established)} {establishedYear}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {hasProducts ? (
              <a
                href="#catalog"
                className="inline-flex min-h-11 items-center justify-center gap-2 bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                {tr(H.browse)}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            ) : null}
            <a
              href="#inquiry"
              className="inline-flex min-h-11 items-center justify-center border border-foreground/20 bg-background/70 px-5 py-2.5 text-sm font-medium text-foreground hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              {tr(H.quote)}
            </a>
            {whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 border border-primary/50 bg-primary/5 px-5 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                {tr(H.whatsapp)}
              </a>
            ) : null}
            <SocialShareMenu
              title={shareTitle}
              url={shareUrl}
              language={language}
              className="border-foreground/20 bg-background/70 hover:bg-background"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
