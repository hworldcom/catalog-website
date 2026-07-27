# Ticket 011 - Split Seller Product Functions

## Goal

Move product CRUD server functions into a dedicated seller products module.

## Current Functions

- `listMyProducts`
- `getMyProduct`
- `saveMyProduct`
- `deleteMyProduct`
- `productSchema`

## Target Module

- `src/features/seller/products.functions.ts`
  - `listMyProducts`
  - `getMyProduct`
  - `saveMyProduct`
  - `deleteMyProduct`
  - private `productSchema`

## Call Sites To Update

- `src/features/seller/screens/overview-screen.tsx`
- `src/features/seller/screens/products-screen.tsx`
- `src/features/seller/screens/edit-product-screen.tsx`
- `src/features/seller/components/product-editor.tsx`

## Notes

- Keep `requireSupabaseAuth` middleware attached.
- Keep `listMyProducts` scoped through the current user's seller row.
- Preserve current draft/published mapping:
  - `publish: true` -> `status: "published"`
  - `publish: false` -> `status: "draft"`
- Preserve current field normalization in `saveMyProduct`, including empty
  strings becoming `null`.
- Preserve existing return shapes:
  - `listMyProducts` returns `{ products }`
  - `getMyProduct` returns `{ product }`
  - `saveMyProduct` returns `{ id }`
  - `deleteMyProduct` returns `{ ok: true }`
- Move `listMyProducts`, `getMyProduct`, `saveMyProduct`, and
  `deleteMyProduct` out of `src/lib/seller.functions.ts` in this ticket. Do
  not leave compatibility re-exports for these moved functions in the legacy
  module.
- Leave leads and category picker functions in `src/lib/seller.functions.ts`
  until ticket 012 moves them.
- `ProductEditor` should import `saveMyProduct` from
  `src/features/seller/products.functions.ts`, but should keep
  `listCategoriesForPicker` imported from `@/lib/seller.functions` until
  ticket 012.
- Keep `productSchema` private to `products.functions.ts` for now. Export it
  later only if tests or shared form validation need it.

## Security Behavior To Preserve For This Ticket

- Preserve current product ID scoping exactly:
  - `getMyProduct` queries by product ID only.
  - `deleteMyProduct` deletes by product ID only.
  - `saveMyProduct` update path updates by product ID only.
- This relies on Supabase row-level security or other database policy to block
  cross-seller access.
- Do not harden these queries in this ticket. Review and change ownership
  checks separately in ticket 014.

## Non-Goals

- Do not change product form UI or field names.
- Do not change product status options.
- Do not move category picker loading in this ticket.
- Do not change product ownership enforcement in this ticket.

## Acceptance Criteria

- Product list still loads for the current seller.
- Creating a product still works.
- Editing a product still works.
- Deleting a product still works.
- No changed file imports `listMyProducts`, `getMyProduct`, `saveMyProduct`,
  or `deleteMyProduct` from `@/lib/seller.functions`.
- Existing imports for functions not covered by this ticket may remain pointed
  at `@/lib/seller.functions` until ticket 012.
- `src/lib/seller.functions.ts` no longer exports `listMyProducts`,
  `getMyProduct`, `saveMyProduct`, or `deleteMyProduct`.
- `npm run test:node22` passes.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.

## Implementation Notes

- Implemented in `src/features/seller/products.functions.ts`.
- `src/lib/seller.functions.ts` no longer exports `listMyProducts`,
  `getMyProduct`, `saveMyProduct`, or `deleteMyProduct`.
- `productSchema` remains private to `products.functions.ts`.
- `ProductEditor` now imports `saveMyProduct` from the product feature module
  while keeping `listCategoriesForPicker` pointed at `@/lib/seller.functions`
  until ticket 012.
- Current product ID-only scoping was preserved exactly for this mechanical
  split.

## Verification

- `npm run test:node22`
- `npm run lint:node22`
- `npm run build:node22`
- Dev smoke:
  - `GET /seller?lang=EN`
  - `GET /seller/products?lang=EN`
  - `GET /seller/products/new?lang=EN`
