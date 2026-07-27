# Supabase Library

Supabase client setup, server clients, auth middleware, and generated database
types live here.

Use `client.ts` for browser/session-aware Supabase access, `client.server.ts`
for service-role server operations, and `auth-middleware.ts` /
`auth-attacher.ts` for TanStack server function authentication.
`request-authentication.ts` owns the same bearer-token verification for raw
server routes. Feature authorization must run after this authentication and
before any service-role client is created.
