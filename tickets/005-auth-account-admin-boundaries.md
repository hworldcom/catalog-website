# Ticket 005 - Auth Account Admin Boundaries

## Status

Completed. Authentication, account, and administrator feature boundaries are
established; later tickets expanded their product behavior.

## Goal

Prepare feature boundaries for auth, account, and admin without prematurely building product scope.

The admin boundary now has one known future responsibility: admin-only integration with catalog-classifier approved batches and Bazoria product drafts.

## Current Files

- `src/routes/auth.tsx`
- `src/routes/_authenticated/route.tsx`
- `src/features/auth/README.md`
- `src/features/account/README.md`
- `src/features/admin/README.md`

## Target Locations

- `src/features/auth/screens/auth-screen.tsx`
- `src/features/auth/require-authenticated-user.ts`

## Scope

- Move the `/auth` page body into `src/features/auth/screens/auth-screen.tsx`.
- Keep `src/routes/auth.tsx` as the route wrapper that owns:
  - URL path declaration;
  - head metadata;
  - search validation;
  - route search param access.
- Move reusable authenticated-route guard behavior into
  `src/features/auth/require-authenticated-user.ts`.
- Keep `src/routes/_authenticated/route.tsx` as the route wrapper that owns:
  - the `_authenticated` route declaration;
  - `ssr: false`;
  - redirect wiring;
  - the outlet.
- Ensure placeholder feature directories for `account` and `admin` exist.
- Keep `account` as a placeholder until buyer/user requirements are defined.
- Create `admin` as a real boundary, but do not build visible admin screens except where a specific admin ticket requires it.
- Document likely route ownership:
  - `features/auth` owns sign-in/sign-up/session UI.
  - `features/account` owns buyer/user profile and preferences.
  - `features/admin` owns internal moderation/admin workflows and future classifier import workflows.

## Out Of Scope

- Do not create `/admin` or `/account` routes in this ticket.
- Do not build visible account or admin screens.
- Do not add role checks beyond preserving the existing authenticated-route guard.
- Do not change `/auth` visible layout, styling, copy, redirects, or sign-in/sign-up behavior.
- Do not move Lovable or Supabase integration files in this ticket.

## Classifier Integration Boundary

- First classifier integration is admin-only.
- Seller-facing classifier upload/import is explicitly out of scope for now.
- Bazoria Web should not duplicate classifier upload, hashing, embedding, grouping, thumbnail generation, or review semantics.
- Bazoria Web should import approved classifier groups as `ProductDraft` records only after explicit server-side import.
- Nothing from classifier approval should become a public product automatically.

## Acceptance Criteria

- Existing `/auth` behavior is unchanged.
- Existing authenticated route guard behavior is unchanged.
- `src/routes/auth.tsx` is a thin wrapper around the auth feature screen.
- `src/routes/_authenticated/route.tsx` delegates reusable guard behavior to the auth feature helper.
- `features/admin` and `features/account` exist with clear placeholders or README notes only.
- Admin notes document the classifier boundary and ProductDraft import principle.
- `npm run test:node22` passes.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.
