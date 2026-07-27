import {
  authenticateSupabaseRequest,
  type AuthenticatedSupabaseRequest,
} from "@/lib/supabase/request-authentication";

import type { PrototypeAdministratorRequestContext } from "../prototype-administrator.middleware";
import {
  assertPrototypeAdministrator,
  readPrototypeAdministratorUserIds,
} from "./prototype-administrator-access";

export type { PrototypeAdministratorRequestContext };

export type PrototypeAdministratorRequestAuthenticator = (
  request: Request,
) => Promise<PrototypeAdministratorRequestContext>;

type SupabaseRequestAuthenticator = (request: Request) => Promise<AuthenticatedSupabaseRequest>;

export async function authenticatePrototypeAdministratorRequest(
  request: Request,
  authenticate: SupabaseRequestAuthenticator = authenticateSupabaseRequest,
  allowlistValue = process.env.BAZORIA_PROTOTYPE_ADMIN_USER_IDS,
): Promise<PrototypeAdministratorRequestContext> {
  const authenticated = await authenticate(request);
  assertPrototypeAdministrator(
    authenticated.userId,
    // Parse after authentication so anonymous callers never receive
    // administrator-configuration details.
    readPrototypeAdministratorUserIds(allowlistValue),
  );
  return {
    ...authenticated,
    prototypeAdministrator: true,
  };
}
