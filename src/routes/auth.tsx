import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthScreen } from "@/features/auth/screens/auth-screen";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · Bazoria" },
      { name: "description", content: "Sign in or create a seller account on Bazoria." },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthRoute,
});

function AuthRoute() {
  const search = Route.useSearch();
  return <AuthScreen redirect={search.redirect} />;
}
