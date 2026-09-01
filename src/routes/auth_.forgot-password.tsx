import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ForgotPasswordScreen } from "@/features/auth/screens/forgot-password-screen";
import { normalizeLanguage } from "@/lib/i18n";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth_/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password · Bazoria" },
      { name: "description", content: "Request a Bazoria password-reset email." },
    ],
  }),
  validateSearch: (search) => searchSchema.parse(search),
  component: ForgotPasswordRoute,
});

function ForgotPasswordRoute() {
  const search = Route.useSearch();
  return <ForgotPasswordScreen lang={normalizeLanguage(search.lang)} redirect={search.redirect} />;
}
