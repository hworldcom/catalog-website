# Ticket 009 - Split Seller Current And Onboarding Functions

## Status

Implemented.

## Goal

Move current seller lookup, seller onboarding, role assignment, and slug creation out of `src/lib/seller.functions.ts`.

## Current Functions

- `getMySeller`
- `onboardSeller`
- private `ensureSellerRole`
- private `slugify`
- `onboardSchema`

## Target Modules

- `src/features/seller/current-seller.functions.ts`
  - `getMySeller`
- `src/features/seller/onboarding.functions.ts`
  - `onboardSeller`
  - `onboardSchema`
- `src/features/seller/server/seller-role.service.ts`
  - `ensureSellerRole`
- `src/features/seller/server/seller-slug.ts`
  - `slugify`
  - optional unique slug helper if extracted from `onboardSeller`

## Call Sites To Update

- `src/features/seller/screens/seller-layout-screen.tsx`
- `src/features/seller/screens/overview-screen.tsx`
- `src/features/seller/screens/onboarding-screen.tsx`

## Notes

- Keep `requireSupabaseAuth` middleware attached to both server functions.
- Move `getMySeller` and `onboardSeller` out of
  `src/lib/seller.functions.ts` in this ticket. Do not leave compatibility
  re-exports for these moved functions in the legacy module.
- Leave unrelated seller functions in `src/lib/seller.functions.ts` until
  tickets 010-013 move them.
- Keep existing return shapes:
  - `getMySeller` returns `{ seller }`
  - `onboardSeller` returns `{ seller }`
- Keep the existing slug collision behavior unless deliberately changed in a later ticket.
- Do not top-level import from `src/features/seller/server/*` in files that are
  imported by route/client code. If `onboarding.functions.ts` needs a
  server-only helper, load it inside the server function handler with a dynamic
  import, following the existing `client.server.ts` pattern.
- If slug generation is extracted to `server/seller-slug.ts`, load it inside the
  server function handler and preserve the current collision sequence exactly.

## Acceptance Criteria

- Seller onboarding still creates a seller row and assigns the `seller` role.
- Existing seller users still load their seller dashboard.
- No behavior changes to generated slugs.
- No changed file imports `getMySeller` or `onboardSeller` from
  `@/lib/seller.functions`.
- Existing imports for functions not covered by this ticket may remain pointed
  at `@/lib/seller.functions` until tickets 010-013.
- `src/lib/seller.functions.ts` no longer exports `getMySeller` or
  `onboardSeller`.
- `npm run test:node22` passes.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.

## Implementation Notes

- Implemented in:
  - `src/features/seller/current-seller.functions.ts`
  - `src/features/seller/onboarding.functions.ts`
  - `src/features/seller/server/seller-role.service.ts`
  - `src/features/seller/server/seller-slug.ts`
- `src/lib/seller.functions.ts` no longer exports `getMySeller` or
  `onboardSeller`.
- `onboarding.functions.ts` loads server-only helpers with dynamic imports
  inside the server function handler.
- Also updated `src/features/seller/screens/storefront-screen.tsx`, because it
  uses `getMySeller` in addition to the call sites listed above.

## Verification

- `npm run test:node22`
- `npm run lint:node22`
- `npm run build:node22`
