import { createFileRoute, redirect } from "@tanstack/react-router";

import { legacyClassifierImportsRedirect } from "@/features/admin/classifier-import-legacy-navigation";
import { guardAdministratorClassifierRoute } from "@/features/classifier-release/classifier-assisted-upload.navigation";

export const Route = createFileRoute("/_authenticated/admin/classifier-imports")({
  beforeLoad: ({ search }) => {
    guardAdministratorClassifierRoute(search);
    throw redirect(legacyClassifierImportsRedirect(search.lang));
  },
});
