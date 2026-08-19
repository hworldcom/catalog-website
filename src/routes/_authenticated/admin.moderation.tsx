import { createFileRoute, useNavigate } from "@tanstack/react-router";

import {
  administratorModerationSearchForRequest,
  parseAdministratorModerationRouteSearch,
} from "@/features/admin/administrator-moderation.navigation";
import type { AdministratorModerationRequest } from "@/features/admin/administrator-moderation.types";
import { AdministratorModerationQueueScreen } from "@/features/admin/screens/administrator-moderation-queue-screen";

export const Route = createFileRoute("/_authenticated/admin/moderation")({
  head: () => ({ meta: [{ title: "Moderation requests · Bazoria" }] }),
  validateSearch: (search) => search,
  component: AdministratorModerationRoute,
});

function AdministratorModerationRoute() {
  const routeState = parseAdministratorModerationRouteSearch(Route.useSearch());
  const navigate = useNavigate({ from: Route.fullPath });

  function changeRequest(request: AdministratorModerationRequest) {
    void navigate({
      search: (previous) => ({
        ...previous,
        ...administratorModerationSearchForRequest(request),
      }),
    });
  }

  return (
    <AdministratorModerationQueueScreen routeState={routeState} onRequestChange={changeRequest} />
  );
}
