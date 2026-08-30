import { useSuspenseQuery } from "@tanstack/react-query";

import { PublicShell } from "@/components/layout/public-shell";

import { MarketplaceCategoryDiscovery } from "../components/marketplace-category-discovery";
import { MarketplaceHomeHero } from "../components/marketplace-home-hero";
import { MarketplaceProductRail } from "../components/marketplace-product-rail";
import { MarketplaceProcessSection } from "../components/marketplace-process-section";
import { MarketplaceSellerCta } from "../components/marketplace-seller-cta";
import { MarketplaceSupplierGrid } from "../components/marketplace-supplier-grid";
import type { PublicAudience } from "../public-audience";
import { audienceNavigationQueryOptions, marketplaceQueryOptions } from "../queries";

export function MarketplaceHomeScreen({ audience }: { audience: PublicAudience }) {
  const { data } = useSuspenseQuery(marketplaceQueryOptions(audience));
  const { data: navigation } = useSuspenseQuery(audienceNavigationQueryOptions(audience));

  return (
    <PublicShell marketplaceAudience={audience}>
      <MarketplaceHomeHero audience={audience} />

      <MarketplaceProductRail audience={audience} products={data.trending} />

      <MarketplaceCategoryDiscovery audience={audience} categories={navigation.categories} />

      <MarketplaceSupplierGrid audience={audience} sellers={data.sellers} />

      <MarketplaceProcessSection />

      <MarketplaceSellerCta />
    </PublicShell>
  );
}
