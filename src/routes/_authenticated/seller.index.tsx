import { createFileRoute } from "@tanstack/react-router";

import { OverviewScreen } from "@/features/seller/screens/overview-screen";

export const Route = createFileRoute("/_authenticated/seller/")({
  component: OverviewScreen,
});
