import { createFileRoute, Outlet } from "@tanstack/react-router";

import {
  getAdministratorNavigationContext,
  type AdministratorNavigationContext,
} from "@/features/admin/administrator-moderation.functions";
import { AdministratorNavigationProvider } from "@/features/admin/administrator-navigation.provider";
import { requireAuthenticatedUser } from "@/features/auth/require-authenticated-user";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const authenticated = await requireAuthenticatedUser(location);
    return {
      ...authenticated,
      administratorNavigation: await loadAdministratorNavigationContext(),
    };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { administratorNavigation } = Route.useRouteContext();
  return (
    <AdministratorNavigationProvider value={administratorNavigation}>
      <Outlet />
    </AdministratorNavigationProvider>
  );
}

async function loadAdministratorNavigationContext(): Promise<AdministratorNavigationContext> {
  try {
    return await getAdministratorNavigationContext();
  } catch (error) {
    console.error("[Administrator navigation] Context request failed.", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
    });
    return { prototypeAdministrator: false };
  }
}
