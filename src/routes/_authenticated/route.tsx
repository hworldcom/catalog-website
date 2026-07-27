import { createFileRoute, Outlet } from "@tanstack/react-router";

import { requireAuthenticatedUser } from "@/features/auth/require-authenticated-user";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: ({ location }) => requireAuthenticatedUser(location),
  component: () => <Outlet />,
});
