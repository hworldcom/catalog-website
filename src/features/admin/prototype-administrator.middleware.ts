import { createMiddleware } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { AuthenticatedSupabaseRequest } from "@/lib/supabase/request-authentication";

export type PrototypeAdministratorRequestContext = AuthenticatedSupabaseRequest & {
  prototypeAdministrator: true;
};

export const requirePrototypeAdministrator = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { assertPrototypeAdministrator } =
      await import("./server/prototype-administrator-access");
    assertPrototypeAdministrator(context.userId);
    return next({
      context: {
        prototypeAdministrator: true as const,
      },
    });
  });
