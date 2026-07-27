# Ticket 012 - Split Seller Leads And Category Picker Functions

## Goal

Move seller leads and authenticated category picker functions into focused modules.

## Current Functions

- `listMyLeads`
- `listCategoriesForPicker`

## Target Modules

- `src/features/seller/leads.functions.ts`
  - `listMyLeads`
- `src/features/seller/categories.functions.ts`
  - `listCategoriesForPicker`

## Call Sites To Update

- `src/features/seller/screens/leads-screen.tsx`
- `src/features/seller/screens/overview-screen.tsx`
- `src/features/seller/screens/onboarding-screen.tsx`
- `src/features/seller/screens/storefront-screen.tsx`
- `src/features/seller/components/product-editor.tsx`

## Notes

- Keep `requireSupabaseAuth` middleware attached.
- Keep `listMyLeads` scoped through the current user's seller row.
- Preserve existing return shapes:
  - `listMyLeads` returns `{ leads }`
  - `listCategoriesForPicker` returns `{ categories }`
- Move `listMyLeads` and `listCategoriesForPicker` out of
  `src/lib/seller.functions.ts` in this ticket. Do not leave compatibility
  re-exports for these moved functions in the legacy module.
- Keep `listCategoriesForPicker` authenticated for now. Revisit whether
  categories should later move to a shared catalog/admin module once admin scope
  is defined.

## Non-Goals

- Do not change the leads inbox UI.
- Do not change category picker query fields or sort order.
- Do not move categories to a shared catalog/admin module in this ticket.
- Do not delete `src/lib/seller.functions.ts` in this ticket. Leave deletion
  for ticket 013.

## Acceptance Criteria

- Seller leads inbox still loads.
- Storefront and product forms still load category options.
- Category picker output is unchanged.
- No changed file imports `listMyLeads` or `listCategoriesForPicker` from
  `@/lib/seller.functions`.
- `src/lib/seller.functions.ts` no longer exports `listMyLeads` or
  `listCategoriesForPicker`.
- `npm run test:node22` passes.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.

## Implementation Notes

- Implemented in:
  - `src/features/seller/leads.functions.ts`
  - `src/features/seller/categories.functions.ts`
- `src/lib/seller.functions.ts` no longer exports `listMyLeads` or
  `listCategoriesForPicker`.
- `src/lib/seller.functions.ts` remains present and empty for ticket 013 to
  delete.
- Category picker remains authenticated.

## Verification

- `npm run test:node22`
- `npm run lint:node22`
- `npm run build:node22`
- Dev smoke:
  - `GET /seller?lang=EN`
  - `GET /seller/leads?lang=EN`
  - `GET /seller/storefront?lang=EN`
  - `GET /seller/products/new?lang=EN`
