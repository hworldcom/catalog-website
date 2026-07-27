# Ticket 023 - Replace Lovable Runtime And Tooling

## Status

Repository implementation complete; external OAuth verification pending.

The direct Supabase Google OAuth slice was implemented after only a partial
planning update. The repository-level runtime and tooling replacement is now
complete. Supabase provider configuration and a real Google round trip remain
external follow-up work.

## Resolved Post-Implementation Development Regression

After removing the Lovable Vite wrapper, authenticated seller dashboard queries
can fail in development with `Invalid server function ID` for multiple valid
server functions.

Observed behavior:

- The affected identifiers decode to existing `*.functions.ts` handlers.
- Production builds register the same handlers correctly.
- Restarting Vite and clearing generated caches does not reliably prevent the
  error.
- The failure occurs when a client caller module is reused before TanStack's
  in-memory development server-function registry has transformed the
  corresponding source module.

Approved fix:

- Add a project-owned, serve-only Vite plugin that discovers
  `src/**/*.functions.ts`.
- Warm the matching client modules sequentially so TanStack's shared compiler
  registry is not mutated by concurrent module transforms.
- Keep the warmup limited to server-function declaration modules.
- Exclude generated `.vercel/` output from ESLint traversal.
- Do not change server-function implementations, identifiers, authentication,
  or production Nitro configuration.

Rejected attempt:

- Vite's built-in `server.warmup.clientFiles` glob starts matching transforms
  concurrently. Validation registered some functions but missed the
  multi-handler products module and caused a later transform to stall.

Regression validation:

- Start Vite with clean generated caches.
- Request known seller server-function identifiers before manually opening
  their source modules.
- Confirm the requests pass TanStack's identifier validator.
- Re-run tests, lint, and the Vercel production build.

Resolution:

- `vite.config.ts` now discovers all `src/**/*.functions.ts` modules when the
  development server starts.
- A serve-only Vite plugin warms those modules sequentially in the client
  environment before accepting application traffic.
- `eslint.config.js` ignores generated `.vercel/` output.
- No server-function implementation or production identifier changed.

## Resolved Development Hydration Regression

The first warmup implementation called the client environment from Vite's
`configureServer` hook before the dependency optimizer had initialized. This
could cache raw CommonJS imports from React or `use-sync-external-store`,
prevent client hydration, and leave server-rendered controls such as menus and
filters non-interactive.

Resolution:

- Keep the project-owned sequential server-function warmup.
- Start it behind a one-time first-request middleware gate, after Vite has
  initialized the client environment.
- Wait for Vite's static import crawl and dependency optimization requests to
  become idle before allowing that first request to continue.
- Reuse the same warmup promise for concurrent initial requests.

Regression validation:

- Start the Node 22 development server from a cold browser profile.
- Confirm the storefront hydrates without React or
  `use-sync-external-store` module export exceptions.
- Confirm category selection/reset and the mobile navigation menu respond on
  the first loaded page.
- Confirm existing server-function-backed routes render without an invalid
  server-function identifier.

## Dependency

Ticket 022 is complete. The `.lovable/` project metadata and obsolete
repository instructions have been removed.

The already-completed OAuth slice can remain in place because it is independent
of repository metadata and the hosting adapter.

## Goal

Remove active Lovable runtime and build-tool dependencies while preserving
authentication behavior, error-boundary behavior, styling, local development,
server/client import boundaries, and production deployment through Vercel.

## Original Lovable Dependencies

- `@lovable.dev/cloud-auth-js`
- `@lovable.dev/vite-tanstack-config`
- `src/integrations/lovable/index.ts`
- `src/lib/lovable-error-reporting.ts`
- Lovable-specific metadata in `src/routes/__root.tsx`
- The Lovable scaffold favicon in `public/favicon.ico`
- Lovable-specific comments and implicit configuration in `vite.config.ts`

## Approved Decisions

### Authentication

Use direct Supabase Google OAuth.

- Start Google sign-in with the existing browser Supabase client and
  `supabase.auth.signInWithOAuth`.
- Send the user back to `/auth` after the provider callback.
- Preserve the validated local `redirect` destination through the OAuth round
  trip.
- Reject external, protocol-relative, and backslash-based redirect
  destinations.
- Keep the existing user-facing auth layout and translated copy unchanged.

Deployment prerequisites outside this repository:

- Google authentication is enabled for the Supabase project.
- Google OAuth credentials are configured for that provider.
- Local, preview, and production `/auth` callback URLs are included in the
  Supabase redirect allow-list.

### Hosting

Use Vercel for the current production target.

- Build the TanStack Start server with Nitro's explicit `vercel` preset.
- Produce Vercel Build Output under `.vercel/output`.
- Keep Vercel functions in one region close to the Supabase project region.
- Do not enable multi-region functions while the Supabase database remains
  single-region.
- Keep `src/server.ts` as the custom TanStack Start server entry.
- Add `.vercel/` to `.gitignore`.
- Do not create, connect, or deploy a Vercel project in this ticket.

### Client Error Reporting

Replace the Lovable browser hook with a neutral project-owned seam.

- Replace `src/lib/lovable-error-reporting.ts` with
  `src/lib/client-error-reporting.ts`.
- Expose a neutral `reportClientError(error, context)` helper.
- Log errors and route/boundary context to the browser console for now.
- Keep the helper small enough to connect to a future observability provider
  without changing error-boundary components again.
- Remove all `window.__lovableEvents` types and calls.
- Avoid logging the same root-boundary error twice.

### Root Metadata

Remove Lovable ownership and preview metadata.

- Change the document author from `Lovable` to `Bazoria`.
- Remove the Lovable Twitter account.
- Remove Lovable-hosted Open Graph and Twitter preview image URLs.
- Replace the Lovable scaffold favicon with a project-owned Bazoria favicon.
- Use a normal summary Twitter card until Bazoria owns a suitable social image.
- Keep the existing Bazoria title and description metadata.

## Explicit Vite And TanStack Start Configuration

Replace `@lovable.dev/vite-tanstack-config` with project-owned Vite
configuration.

Required plugins and behavior:

- `@tailwindcss/vite`
- `@tanstack/react-start/plugin/vite`
- `@vitejs/plugin-react`
- `nitro/vite` for production builds with `preset: "vercel"`
- TanStack Start custom server entry: `server.entry = "server"`
- TanStack Start client import protection:
  - reject imports from `**/server/**`;
  - reject the `server-only` specifier.
- Vite 8 native `resolve.tsconfigPaths: true`
- React and TanStack Query dependency deduplication
- React dependency pre-bundling and stale optimized-dependency request
  tolerance equivalent to the current wrapper
- local development host `::` and port `8080`

CSS behavior:

- Keep Lightning CSS as the Vite CSS transformer to preserve the current
  development/production styling pipeline.
- Add `lightningcss` as a direct project development dependency after removing
  the Lovable wrapper that currently provides it transitively.

Lovable-only development behavior must not be recreated:

- Lovable sandbox detection
- Lovable asset proxying
- Lovable development-server bridge
- Lovable hot-module-replacement gate
- Lovable build diagnostic markers
- Lovable-specific server-function and server-rendering log transport

Other wrapper-provided development instrumentation intentionally omitted:

- Do not add `@tanstack/devtools-vite` as a direct dependency in this ticket.
  The wrapper currently uses it for development source injection, but the app
  does not expose or depend on those developer tools.

Vite already exposes `VITE_*` environment variables through `import.meta.env`;
do not recreate the wrapper's manual environment `define` injection.

## Dependency Changes

Remove:

- `@lovable.dev/cloud-auth-js`
- `@lovable.dev/vite-tanstack-config`
- `vite-tsconfig-paths`

Add as a direct development dependency:

- `lightningcss`

Regenerate `package-lock.json` through npm. No `@lovable.dev` packages should
remain in the active dependency tree after the clean install.

## Implementation Slices

1. Replace Lovable client error reporting and root metadata.
2. Replace the Vite wrapper with the explicit Vercel-targeted configuration.
3. Update dependencies, lockfile, and ignore rules.
4. Run automated validation and local route smoke checks.
5. Verify a real Google OAuth round trip after the external Supabase provider
   configuration is ready.

Keep each slice reviewable. Do not combine unrelated product or visual changes
with this ticket.

## Non-Goals

- Do not change user-facing authentication semantics except where required to
  remove Lovable OAuth.
- Do not remove or replace Supabase.
- Do not add a new external observability provider.
- Do not deploy the application or mutate a Vercel project.
- Do not add Cloudflare configuration.
- Do not redesign pages or change user-facing copy.
- Do not address unrelated bundle-size or Fast Refresh warnings.

## Acceptance Criteria

### Authentication

- `package.json` and `package-lock.json` do not contain
  `@lovable.dev/cloud-auth-js`.
- `src/integrations/lovable/index.ts` no longer exists.
- Google sign-in starts through direct Supabase OAuth.
- Google OAuth preserves safe local post-login destinations.
- Unsafe post-login destinations fall back to `/seller`.
- A real Google sign-in round trip succeeds after external Supabase
  configuration is ready.

### Runtime And Tooling

- `package.json` and `package-lock.json` contain no `@lovable.dev` packages.
- `vite.config.ts` imports no Lovable package.
- Vite configuration explicitly owns Tailwind, TanStack Start, React, path
  aliases, import protection, Lightning CSS, and the Vercel Nitro build.
- `vite-tsconfig-paths` is removed.
- `src/server.ts` remains the production server entry.
- A production build creates `.vercel/output/config.json`.
- `.vercel/` is ignored.
- Development startup warms server-function declaration modules sequentially
  so TanStack's in-memory function registry is ready for cached client callers.
- ESLint ignores generated Vercel Build Output.

### Error Reporting And Metadata

- `src/lib/lovable-error-reporting.ts` no longer exists.
- Active source contains no `window.__lovableEvents` reference.
- Root and page error boundaries report through the neutral project helper.
- The neutral client error helper has a focused test covering error and
  route/boundary context logging.
- Root metadata contains no Lovable author, account, domain, or preview image.
- The browser tab loads a project-owned Bazoria favicon rather than the
  Lovable scaffold icon.

### Verification

- `rg -n -i "lovable" src package.json package-lock.json vite.config.ts`
  returns no matches.
- `npm run ci:node22` succeeds from the regenerated lockfile.
- `npm run test:node22` passes.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.
- Local smoke checks pass for:
  - `/`
  - `/auth`
  - `/seller`
- The production output targets Vercel rather than Cloudflare.

## Implementation Notes

Completed before the full planning correction:

- `src/features/auth/screens/auth-screen.tsx` now starts Google OAuth through
  the existing browser Supabase client.
- OAuth returns through `/auth` and preserves the validated local post-login
  destination.
- `src/features/auth/auth-redirect.ts` owns safe redirect and callback URL
  construction.
- `src/features/auth/auth-redirect.test.ts` covers local, external,
  protocol-relative, and backslash-based redirect inputs.
- `src/integrations/lovable/index.ts` and
  `@lovable.dev/cloud-auth-js` have been removed.
- Ticket 022 removed `.lovable/` metadata and obsolete repository
  instructions.

Completed in the remaining implementation:

- `src/lib/client-error-reporting.ts` now provides the project-owned browser
  reporting seam.
- Root and page error boundaries report through the neutral helper without
  duplicate root logging.
- Root author and social metadata are now Bazoria-owned and no longer use a
  Lovable account or preview image.
- The Lovable scaffold `favicon.ico` was removed. Root metadata now loads the
  project-owned `public/favicon.svg` Bazoria mark.
- `vite.config.ts` explicitly owns Tailwind, TanStack Start, React, client
  import protection, native TypeScript path resolution, dependency
  optimization, Lightning CSS, and build-only Nitro configuration.
- Nitro uses the explicit `vercel` preset and retains `src/server.ts` as the
  custom server entry.
- `@lovable.dev/vite-tanstack-config` and `vite-tsconfig-paths` were removed.
- `lightningcss` is now a direct development dependency.
- `package-lock.json` was regenerated through npm.
- `.vercel/` is ignored.

## Remaining Implementation Checklist

Repository changes:

- [x] Add `src/lib/client-error-reporting.ts` and a focused test.
- [x] Update root and page error boundaries to use the neutral helper without
      duplicate root logging.
- [x] Delete `src/lib/lovable-error-reporting.ts`.
- [x] Replace Lovable-owned root author, Twitter, and preview-image metadata.
- [x] Replace the Lovable scaffold favicon with a Bazoria-owned icon.
- [x] Replace the Lovable Vite wrapper with explicit Tailwind, TanStack Start,
      React, native path aliases, import protection, Lightning CSS, and
      build-only Nitro configuration.
- [x] Set Nitro production preset to `vercel` while retaining
      `src/server.ts` as the server entry.
- [x] Preserve the current neutral React deduplication and dependency
      pre-bundling behavior.
- [x] Remove `@lovable.dev/vite-tanstack-config` and
      `vite-tsconfig-paths`.
- [x] Add `lightningcss` as a direct development dependency.
- [x] Regenerate `package-lock.json`.
- [x] Add `.vercel/` to `.gitignore`.
- [x] Warm development server-function modules sequentially.
- [x] Exclude `.vercel/` output from ESLint traversal.

Automated verification:

- [x] Confirm active source, package files, and Vite configuration contain no
      Lovable references.
- [x] Run a clean `npm run ci:node22`.
- [x] Run `npm run test:node22`.
- [x] Run `npm run lint:node22`.
- [x] Remove or ignore stale generated Cloudflare output before validating the
      new production build.
- [x] Run `npm run build:node22`.
- [x] Confirm `.vercel/output/config.json` exists and describes Vercel output.
- [x] Smoke-check `/`, `/auth`, and unauthenticated `/seller`.

External verification:

- [ ] Enable/configure Google in Supabase if it is not already configured.
- [ ] Allow-list local, preview, and production `/auth` callback URLs.
- [ ] Complete a real Google provider round trip and confirm the safe
      post-login destination.

## Verification Results

Completed on 2026-07-18:

- `rg -n -i "lovable" src package.json package-lock.json vite.config.ts`
  returned no matches.
- `npm run ci:node22` succeeded from the regenerated lockfile with no
  vulnerabilities.
- `npm run test:node22` passed: 4 files and 14 tests.
- `npm run lint:node22` passed with 0 errors and the same 12 existing Fast
  Refresh warnings.
- `npm run build:node22` passed.
- Nitro reported the `vercel` preset and Node.js 22 runtime.
- `.vercel/output/config.json` was generated using Vercel Build Output version
  3 and routes dynamic requests to the Nitro server function.
- `/favicon.svg` returns the project-owned Bazoria icon with the
  `image/svg+xml` content type, and the rendered root document references it.
- Production-preview browser smoke checks passed:
  - `/` rendered the Bazoria marketplace.
  - `/auth` rendered the Bazoria sign-in screen.
  - unauthenticated `/seller` redirected to
    `/auth?redirect=%2Fseller%3Flang%3DEN&lang=EN`.
- A clean forced Vite development server accepted the cold identifiers for
  `getMySeller`, `listMyProducts`, and `listMyLeads` without first requesting
  their source modules.
- After correcting the warmup timing, direct calls to all three identifiers
  returned HTTP 200 serialized authorization responses rather than an invalid
  server-function identifier.
- A cold browser loaded and hydrated the seller storefront without React or
  `use-sync-external-store` module export exceptions; category filtering and
  mobile navigation responded on the first page.
- Regression validation after the fix passed:
  - `npm run test:node22` — 4 files and 14 tests.
  - `npm run lint:node22` — 0 errors and the same 12 existing Fast Refresh
    warnings.
  - `npm run build:node22` — Vercel production build completed.

The build retains the existing large-client-chunk warning. Addressing bundle
splitting remains outside this ticket.
