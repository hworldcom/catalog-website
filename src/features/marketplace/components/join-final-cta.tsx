import { Link } from "@tanstack/react-router";

import { PublicContainer } from "@/components/layout/public-container";
import { t, tr } from "@/lib/i18n";

import { joinAudienceCopy } from "../join-audience-copy";
import type { PublicAudience } from "../public-audience";
import { JoinSectionHeading } from "./join-section-heading";

const F = {
  eyebrow: t("Start here", "Zacznij tutaj", "Hier starten", "Bắt đầu tại đây"),
  title: t(
    "Take the next step with Bazoria.",
    "Zrób kolejny krok z Bazoria.",
    "Machen Sie den nächsten Schritt mit Bazoria.",
    "Bắt đầu bước tiếp theo cùng Bazoria.",
  ),
  lead: t(
    "Create a seller account or start exploring the wholesale catalogue—no buyer account required.",
    "Utwórz konto sprzedawcy lub zacznij przeglądać katalog hurtowy — konto kupującego nie jest wymagane.",
    "Erstellen Sie ein Verkäuferkonto oder entdecken Sie den Großhandelskatalog – ganz ohne Käuferkonto.",
    "Tạo tài khoản người bán hoặc bắt đầu khám phá danh mục bán buôn — không cần tài khoản người mua.",
  ),
};

export function JoinFinalCta({ audience }: { audience: PublicAudience }) {
  return (
    <section className="border-y border-border bg-accent" data-testid="join-final-cta">
      <PublicContainer className="py-14 sm:py-20">
        <JoinSectionHeading
          eyebrow={tr(F.eyebrow)}
          title={tr(F.title)}
          lead={tr(F.lead)}
          align="center"
        />
        <div className="mx-auto mt-8 flex max-w-md flex-col justify-center gap-3 sm:max-w-none sm:flex-row">
          <Link
            to="/auth"
            search={(previous) => ({ ...previous })}
            className="inline-flex min-h-11 max-w-full items-center justify-center rounded-sm bg-primary px-5 py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {tr(joinAudienceCopy.actions.createSellerAccount)}
          </Link>
          <Link
            to="/c/$category"
            params={{ category: "fashion" }}
            search={(previous) => ({ ...previous, audience })}
            className="inline-flex min-h-11 max-w-full items-center justify-center rounded-sm border border-primary/60 bg-card/30 px-5 py-2.5 text-center text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {tr(joinAudienceCopy.actions.browseProducts)}
          </Link>
        </div>
      </PublicContainer>
    </section>
  );
}
