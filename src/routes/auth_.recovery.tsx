import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RecoveryScreen } from "@/features/auth/screens/recovery-screen";
import { normalizeLanguage } from "@/lib/i18n";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth_/recovery")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Recover account · Bazoria" },
      { name: "description", content: "Complete Bazoria account recovery." },
    ],
  }),
  validateSearch: (search) => searchSchema.parse(search),
  component: RecoveryRoute,
});

function RecoveryRoute() {
  const search = Route.useSearch();
  return <RecoveryScreen lang={normalizeLanguage(search.lang)} redirect={search.redirect} />;
}
