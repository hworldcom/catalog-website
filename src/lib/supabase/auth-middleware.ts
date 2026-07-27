import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { authenticateSupabaseRequest } from "./request-authentication";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const authenticated = await authenticateSupabaseRequest(getRequest());

    return next({
      context: {
        supabase: authenticated.supabase,
        userId: authenticated.userId,
        claims: authenticated.claims,
      },
    });
  },
);
