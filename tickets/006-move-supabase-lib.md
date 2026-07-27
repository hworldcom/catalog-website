# Ticket 006 - Move Supabase Integration To Lib

## Goal

Move Supabase integration files from `src/integrations/supabase` to `src/lib/supabase`.

## Current Files

- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/client.server.ts`
- `src/integrations/supabase/auth-attacher.ts`
- `src/integrations/supabase/auth-middleware.ts`
- `src/integrations/supabase/types.ts`

## Target Files

- `src/lib/supabase/client.ts`
- `src/lib/supabase/client.server.ts`
- `src/lib/supabase/auth-attacher.ts`
- `src/lib/supabase/auth-middleware.ts`
- `src/lib/supabase/types.ts`

## Scope

- Move files into `src/lib/supabase`.
- Update all imports.
- Do not leave compatibility re-export files in `src/integrations/supabase`.
- Delete `src/integrations/supabase` if it is empty after the move.
- Keep Lovable integration code under `src/integrations/lovable`.
- Update the Lovable integration's Supabase import to the new
  `@/lib/supabase/client` path, but do not otherwise refactor Lovable auth in
  this ticket.
- Remove stale "generated" / "do not edit" comments from the moved Supabase
  files because they become project-owned library code after this migration.
- Replace Supabase missing-environment messages that mention Lovable Cloud with
  neutral project-owned wording.
- Check dynamic imports in server functions after the move.
- Replace the dynamic Supabase client import in `src/routes/__root.tsx` with a
  static import if it is only attempting to avoid bundle cost.
- Keep dynamic imports of `client.server.ts` in server functions where they are
  used to avoid shipping the service-role client to the browser bundle.
- Re-evaluate the existing build warning where the Supabase client is both
  statically and dynamically imported.

## Out Of Scope

- Do not remove `.lovable` metadata in this ticket.
- Do not replace `@lovable.dev/cloud-auth-js` in this ticket.
- Do not replace `@lovable.dev/vite-tanstack-config` in this ticket.
- Do not remove or rename Lovable error-reporting code in this ticket.

## Acceptance Criteria

- No imports reference `@/integrations/supabase`.
- `src/integrations/supabase` no longer exists unless a non-migrated file has a
  documented reason to remain.
- Auth session handling still works.
- Server functions still receive Supabase auth context.
- Moved Supabase files no longer contain stale generated-file warnings or
  Lovable Cloud environment instructions.
- `npm run test:node22` passes.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.
- Dev smoke checks pass for:
  - `/`
  - `/auth`
  - `/seller`
  - one server-function-backed public page such as `/s/kesar-textiles` or a
    known product detail route
