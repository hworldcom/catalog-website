# Ticket 014 - Seller Server Hardening Follow-Ups

## Status

Implemented. Product reads and mutations are explicitly seller-scoped and use
the shared current-seller service.

## Goal

After the mechanical split, review seller server functions for authorization and consistency gaps.

## Findings To Review

- `getMyProduct` currently fetches by product ID without explicitly joining/scoping to the current seller.
- `deleteMyProduct` currently deletes by product ID without explicitly joining/scoping to the current seller.
- `saveMyProduct` checks the current seller for create, but update only filters by product ID.
- Several functions repeat current seller lookup logic.

## Scope

- Add a shared helper for current seller ID lookup.
- Explicitly scope product reads, updates, and deletes to the current user's
  seller.
- Preserve row-level security as the primary database guard, but do not rely on
  it as the only application-level ownership check.
- Keep API return shapes stable.

## Target Helper

- `src/features/seller/server/current-seller.service.ts`
  - `getCurrentSellerId({ supabase, userId })`
    - returns the current seller ID when one exists
    - returns `null` when the authenticated user has no seller row
    - throws the Supabase error message when the lookup errors
  - `requireCurrentSellerId({ supabase, userId })`
    - returns the current seller ID when one exists
    - throws `Create your storefront first` when the authenticated user has no
      seller row
- The helper should accept the request-scoped Supabase client from
  `requireSupabaseAuth`; it should not import `client.server`.
- Use the helper in product server functions and in `listMyLeads` where it
  removes meaningful duplication.

## Product Ownership Behavior

- `listMyProducts`
  - keep current behavior: no seller row returns `{ products: [] }`
  - product query must remain scoped with `.eq("seller_id", sellerId)`
- `getMyProduct`
  - first resolve the current seller ID
  - no seller row returns `{ product: null }`
  - missing or non-owned product returns `{ product: null }`
  - query must include both `.eq("id", data.id)` and
    `.eq("seller_id", sellerId)`
- `saveMyProduct`
  - create path keeps current behavior: no seller row throws
    `Create your storefront first`
  - create path inserts with `seller_id: sellerId`
  - update path must include both `.eq("id", data.id)` and
    `.eq("seller_id", sellerId)`
  - missing or non-owned product on update throws `Product not found`
  - update must not silently return the requested ID when no row was updated
- `deleteMyProduct`
  - first resolve the current seller ID
  - no seller row throws `Product not found`
  - delete path must include both `.eq("id", data.id)` and
    `.eq("seller_id", sellerId)`
  - missing or non-owned product on delete throws `Product not found`

## Non-Goals

- Do not change product form UI or routes.
- Do not change product return shapes.
- Do not change marketplace/public product queries.
- Do not change Supabase RLS policies in this ticket.
- Do not add admin-level product access in this ticket.

## Tests

- Add focused tests for the current seller helper:
  - returns a seller ID when the lookup succeeds
  - returns `null` from `getCurrentSellerId` when no seller exists
  - throws `Create your storefront first` from `requireCurrentSellerId` when no
    seller exists
  - throws the Supabase error message when the lookup errors
- Product server functions can remain covered by build/smoke unless a small,
  non-brittle test seam emerges during implementation.

## Acceptance Criteria

- Product read/update/delete paths are explicitly seller-owned.
- Missing or non-owned product reads return `{ product: null }`.
- Missing or non-owned product updates throw `Product not found`.
- Missing or non-owned product deletes throw `Product not found`.
- Product create still throws `Create your storefront first` when the user has
  no seller row.
- Shared seller lookup helper avoids meaningful duplication in product/leads
  functions.
- Seller product flows still work.
- `npm run test:node22` passes.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.

## Implementation Notes

- Added `src/features/seller/server/current-seller.service.ts` with:
  - `getCurrentSellerId`
  - `requireCurrentSellerId`
- Added focused helper tests in
  `src/features/seller/server/current-seller.service.test.ts`.
- Updated `src/features/seller/products.functions.ts` so product read, update,
  and delete paths include `seller_id` scoping.
- Updated product update/delete paths to throw `Product not found` when no
  scoped row is changed.
- Updated `src/features/seller/leads.functions.ts` to reuse
  `getCurrentSellerId`.

## Verification

- `npm run test:node22`
- `npm run lint:node22`
- `npm run build:node22`
- Dev smoke:
  - `GET /seller?lang=EN`
  - `GET /seller/products?lang=EN`
  - `GET /seller/products/new?lang=EN`
  - `GET /seller/leads?lang=EN`
