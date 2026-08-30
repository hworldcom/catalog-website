import { Link } from "@tanstack/react-router";
import { Check, Search, Store, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { PublicContainer } from "@/components/layout/public-container";
import { t, tr, type T } from "@/lib/i18n";

import { joinAudienceCopy } from "../join-audience-copy";
import type { PublicAudience } from "../public-audience";

const P = {
  buyerAccountNote: t(
    "No buyer account required.",
    "Konto kupującego nie jest wymagane.",
    "Kein Käuferkonto erforderlich.",
    "Không cần tài khoản người mua.",
  ),
};

const BUYER_BENEFITS = [
  joinAudienceCopy.buyer.benefitTitles.discoverWholesalers,
  joinAudienceCopy.buyer.benefitTitles.browseCatalogues,
  joinAudienceCopy.buyer.benefitTitles.browseBeforeTravel,
  joinAudienceCopy.buyer.benefitTitles.sourceCloser,
];

const SELLER_BENEFITS = [
  joinAudienceCopy.seller.benefitTitles.createCatalogue,
  joinAudienceCopy.seller.benefitTitles.shareAnywhere,
  joinAudienceCopy.seller.benefitTitles.reachBuyers,
  joinAudienceCopy.seller.benefitTitles.keepSelling,
];

export function JoinAudiencePanels({ audience }: { audience: PublicAudience }) {
  return (
    <section className="py-12 sm:py-14 lg:py-20" data-testid="join-audience-panels">
      <PublicContainer>
        <div className="grid gap-5 lg:grid-cols-2">
          <AudiencePanel
            testId="join-buyer-panel"
            icon={Search}
            heading={tr(joinAudienceCopy.buyer.label)}
            description={tr(joinAudienceCopy.buyer.lead)}
            benefits={BUYER_BENEFITS}
            note={tr(P.buyerAccountNote)}
            action={
              <Link
                to="/c/$category"
                params={{ category: "fashion" }}
                search={(previous) => ({ ...previous, audience })}
                className="inline-flex min-h-11 max-w-full items-center justify-center rounded-sm bg-primary px-5 py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {tr(joinAudienceCopy.actions.browseProducts)}
              </Link>
            }
          />
          <AudiencePanel
            testId="join-seller-panel"
            icon={Store}
            heading={tr(joinAudienceCopy.seller.label)}
            description={tr(joinAudienceCopy.seller.lead)}
            benefits={SELLER_BENEFITS}
            action={
              <Link
                to="/auth"
                search={(previous) => ({ ...previous })}
                className="inline-flex min-h-11 max-w-full items-center justify-center rounded-sm bg-primary px-5 py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {tr(joinAudienceCopy.actions.createSellerAccount)}
              </Link>
            }
          />
        </div>
      </PublicContainer>
    </section>
  );
}

function AudiencePanel({
  testId,
  icon: Icon,
  heading,
  description,
  benefits,
  note,
  action,
}: {
  testId: string;
  icon: LucideIcon;
  heading: string;
  description: string;
  benefits: T[];
  note?: string;
  action: ReactNode;
}) {
  return (
    <article
      className="flex min-w-0 flex-col rounded-md border border-border bg-card p-6 sm:p-8"
      data-testid={testId}
    >
      <Icon
        aria-hidden="true"
        className="size-6 shrink-0 text-primary"
        data-testid={`${testId}-icon`}
        strokeWidth={1.75}
      />
      <h2 className="mt-5 break-words font-display text-2xl font-semibold">{heading}</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
      <ul className="mt-6 space-y-3">
        {benefits.map((benefit) => (
          <li key={benefit.EN} className="flex min-w-0 items-start gap-3 text-sm leading-6">
            <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
            <span className="min-w-0 break-words">{tr(benefit)}</span>
          </li>
        ))}
      </ul>
      {note ? <p className="mt-5 text-sm font-semibold text-primary">{note}</p> : null}
      <div className="mt-auto pt-8">{action}</div>
    </article>
  );
}
