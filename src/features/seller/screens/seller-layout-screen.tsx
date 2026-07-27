import { useQuery } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { getMySeller } from "@/features/seller/current-seller.functions";

import { SellerShell } from "../components/seller-shell";
import { SideNav } from "../components/side-nav";
import { OnboardingScreen } from "./onboarding-screen";

export function SellerLayoutScreen() {
  const getSeller = useServerFn(getMySeller);
  const { data, isLoading } = useQuery({
    queryKey: ["my-seller"],
    queryFn: () => getSeller(),
  });

  if (isLoading) {
    return (
      <SellerShell>
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      </SellerShell>
    );
  }

  if (!data?.seller) {
    return (
      <SellerShell>
        <OnboardingScreen />
      </SellerShell>
    );
  }

  return (
    <SellerShell>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-8 md:grid-cols-[220px_1fr]">
        <SideNav sellerSlug={data.seller.slug} />
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </SellerShell>
  );
}
