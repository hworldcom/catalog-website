# Ticket 002 - Split Marketplace Feature

## Status

Completed. Marketplace server operations and screen bodies live under
`src/features/marketplace`, with route files retaining routing concerns.

## Goal

Move buyer-facing marketplace code into `src/features/marketplace` while preserving the current design.

## Current Files

- `src/routes/index.tsx`
- `src/routes/c.$category.tsx`
- `src/routes/s.$sellerSlug.tsx`
- `src/routes/p.$productId.tsx`
- `src/lib/catalog.functions.ts`
- marketplace pieces currently exported from `src/components/bazoria.tsx`

## Scope

- Move catalog server functions to `src/features/marketplace/catalog.functions.ts`.
- Move marketplace query options to `src/features/marketplace/queries.ts`.
- Move marketplace page bodies out of route files and into:
  - `src/features/marketplace/screens/marketplace-home-screen.tsx`
  - `src/features/marketplace/screens/category-screen.tsx`
  - `src/features/marketplace/screens/seller-storefront-screen.tsx`
  - `src/features/marketplace/screens/product-detail-screen.tsx`
- Keep route files as thin wrappers that own:
  - URL path declaration;
  - route params;
  - loaders;
  - `head` metadata;
  - route-level error and not-found components.
- Keep route paths unchanged:
  - `/`
  - `/c/$category`
  - `/s/$sellerSlug`
  - `/p/$productId`

## Out Of Scope

- Do not extract `Shell`, `NotFound`, or `PageError` from `src/components/bazoria.tsx` in this ticket.
- Do not extract `ProductCard`, `formatPrice`, or `getStockLabel` from `src/components/bazoria.tsx` in this ticket.
- Do not create or change visible UI.
- Do not change URLs or route behavior.
- Shared layout and product component extraction belongs to ticket 003.

## Acceptance Criteria

- Buyer-facing pages render the same content and layout.
- Existing product/category/seller/product detail data flows still work.
- No active imports reference `@/lib/catalog.functions`.
- No deprecated TanStack server function warnings return.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.
