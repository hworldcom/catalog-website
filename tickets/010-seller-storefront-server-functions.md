# Ticket 010 - Split Seller Storefront Functions

## Goal

Move storefront update and publishing server functions into a dedicated module.

## Current Functions

- `setStorefrontPublished`
- `updateStorefront`
- `storefrontSchema`

## Target Module

- `src/features/seller/storefront.functions.ts`
  - `setStorefrontPublished`
  - `updateStorefront`
  - private `storefrontSchema`

## Call Sites To Update

- `src/features/seller/screens/overview-screen.tsx`
- `src/features/seller/screens/storefront-screen.tsx`

## Notes

- Keep `requireSupabaseAuth` middleware attached.
- Keep owner scoping on update:
  - `.eq("id", data.id)`
  - `.eq("owner_id", userId)`
- Preserve current field normalization, including empty strings becoming `null`.
- Preserve existing return shapes:
  - `setStorefrontPublished` returns `{ ok: true }`
  - `updateStorefront` returns `{ ok: true }`
- Move `setStorefrontPublished` and `updateStorefront` out of
  `src/lib/seller.functions.ts` in this ticket. Do not leave compatibility
  re-exports for these moved functions in the legacy module.
- Leave product, leads, and category picker functions in
  `src/lib/seller.functions.ts` until tickets 011-012 move them.
- Keep `storefrontSchema` private to `storefront.functions.ts` for now. Export
  it later only if tests or shared form validation need it.

## Non-Goals

- Do not change storefront form UI or field names.
- Do not change slug validation rules.
- Do not move category picker loading in this ticket.
- Do not harden or redesign publish eligibility rules in this ticket.

## Acceptance Criteria

- Seller overview publish toggle still works.
- Storefront edit form still saves all current fields.
- Unauthorized users cannot update another seller by ID.
- No changed file imports `setStorefrontPublished` or `updateStorefront` from
  `@/lib/seller.functions`.
- Existing imports for functions not covered by this ticket may remain pointed
  at `@/lib/seller.functions` until tickets 011-012.
- `src/lib/seller.functions.ts` no longer exports `setStorefrontPublished` or
  `updateStorefront`.
- `npm run test:node22` passes.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.

## Implementation Notes

- Implemented in `src/features/seller/storefront.functions.ts`.
- `src/lib/seller.functions.ts` no longer exports `setStorefrontPublished` or
  `updateStorefront`.
- `storefrontSchema` remains private to `storefront.functions.ts`.
- Remaining product, leads, and category picker imports still point to
  `@/lib/seller.functions` until tickets 011-012.

## Verification

- `npm run test:node22`
- `npm run lint:node22`
- `npm run build:node22`
- Dev smoke:
  - `GET /seller?lang=EN`
  - `GET /seller/storefront?lang=EN`
  - `GET /auth?lang=EN`
