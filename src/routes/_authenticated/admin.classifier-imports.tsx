import { createFileRoute, redirect } from "@tanstack/react-router";

import { legacyClassifierImportsRedirect } from "@/features/admin/classifier-import-legacy-navigation";

export const Route = createFileRoute("/_authenticated/admin/classifier-imports")({
  beforeLoad: ({ search }) => {
    throw redirect(legacyClassifierImportsRedirect(search.lang));
  },
});
