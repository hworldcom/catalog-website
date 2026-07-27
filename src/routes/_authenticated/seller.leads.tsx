import { createFileRoute } from "@tanstack/react-router";

import { LeadsScreen } from "@/features/seller/screens/leads-screen";

export const Route = createFileRoute("/_authenticated/seller/leads")({
  component: LeadsScreen,
});
