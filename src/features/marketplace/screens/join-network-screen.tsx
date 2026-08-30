import { PublicShell } from "@/components/layout/public-shell";

import { JoinAudienceDetails } from "../components/join-audience-details";
import { JoinAudiencePanels } from "../components/join-audience-panels";
import { JoinConnectionSection } from "../components/join-connection-section";
import { JoinFinalCta } from "../components/join-final-cta";
import { JoinPageHero } from "../components/join-page-hero";
import { JoinTrustSection } from "../components/join-trust-section";
import type { PublicAudience } from "../public-audience";

export function JoinNetworkScreen({ audience }: { audience: PublicAudience }) {
  return (
    <PublicShell marketplaceAudience={audience}>
      <JoinPageHero />
      <JoinAudiencePanels audience={audience} />
      <JoinAudienceDetails audience={audience} />
      <JoinConnectionSection />
      <JoinTrustSection />
      <JoinFinalCta audience={audience} />
    </PublicShell>
  );
}
