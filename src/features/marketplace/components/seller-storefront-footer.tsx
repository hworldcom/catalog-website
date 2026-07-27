import { Link } from "@tanstack/react-router";
import { Mail, MapPin, MessageCircle } from "lucide-react";

import { t, tr } from "@/lib/i18n";

import { SellerBrand } from "./seller-brand";

const F = {
  subtitle: t("Wholesale storefront", "Sklep hurtowy", "Großhandels-Shop", "Gian hàng bán buôn"),
  contact: t("Contact", "Kontakt", "Kontakt", "Liên hệ"),
  location: t("Location", "Lokalizacja", "Standort", "Địa điểm"),
  whatsapp: t("WhatsApp seller", "WhatsApp sprzedawcy", "WhatsApp", "WhatsApp nhà bán"),
  powered: t(
    "Powered by Bazoria",
    "Obsługiwane przez Bazoria",
    "Bereitgestellt von Bazoria",
    "Được cung cấp bởi Bazoria",
  ),
  floating: t(
    "Chat with seller on WhatsApp",
    "Napisz do sprzedawcy na WhatsApp",
    "Mit Verkäufer auf WhatsApp chatten",
    "Chat với nhà bán trên WhatsApp",
  ),
};

export function SellerStorefrontFooter({
  sellerName,
  logoUrl,
  email,
  location,
  whatsappUrl,
}: {
  sellerName: string;
  logoUrl: string | null;
  email: string | null;
  location: string;
  whatsappUrl: string | null;
}) {
  const hasContact = Boolean(email || whatsappUrl);

  return (
    <footer
      id="contact"
      className="scroll-mt-20 border-t border-border/60 bg-background"
      aria-labelledby="storefront-contact-heading"
    >
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-8 lg:py-16">
        <div>
          <SellerBrand name={sellerName} logoUrl={logoUrl} subtitle={tr(F.subtitle)} />
        </div>

        {hasContact ? (
          <div>
            <h2
              id="storefront-contact-heading"
              className="font-display text-sm font-semibold uppercase tracking-wider"
            >
              {tr(F.contact)}
            </h2>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {email ? (
                <li>
                  <a
                    href={`mailto:${email}`}
                    className="inline-flex items-center gap-2 break-all hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {email}
                  </a>
                </li>
              ) : null}
              {whatsappUrl ? (
                <li>
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <MessageCircle className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {tr(F.whatsapp)}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        ) : (
          <h2 id="storefront-contact-heading" className="sr-only">
            {tr(F.contact)}
          </h2>
        )}

        {location ? (
          <div>
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider">
              {tr(F.location)}
            </h2>
            <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              {location}
            </p>
          </div>
        ) : null}
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>
            © {new Date().getFullYear()} {sellerName}
          </span>
          <Link
            to="/"
            className="hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {tr(F.powered)}
          </Link>
        </div>
      </div>
    </footer>
  );
}

export function FloatingSellerWhatsApp({ whatsappUrl }: { whatsappUrl: string | null }) {
  if (!whatsappUrl) return null;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-5 right-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-offset-2 sm:bottom-6 sm:right-6"
      aria-label={tr(F.floating)}
      title={tr(F.floating)}
    >
      <MessageCircle className="h-7 w-7" aria-hidden />
    </a>
  );
}
