# Ticket 008 - Seller Server Functions Split Plan

## Status

Completed through tickets `009` through `014`.

## Goal

Replace the single `src/lib/seller.functions.ts` module with smaller seller feature server modules.

## Current Problem

`src/lib/seller.functions.ts` currently owns too many responsibilities:

- current seller lookup
- onboarding
- role assignment
- storefront publish/update
- product CRUD
- leads inbox
- category picker data
- slug generation

This makes the seller feature harder to extend safely.

## Proposed Target

Create focused TanStack server function modules under `src/features/seller`:

- `current-seller.functions.ts`
- `onboarding.functions.ts`
- `storefront.functions.ts`
- `products.functions.ts`
- `leads.functions.ts`
- `categories.functions.ts`

Create server-only helper modules under `src/features/seller/server` when the
helper must never be imported by client-route code:

- `seller-role.service.ts`
- `seller-slug.ts`

## Migration Strategy

1. Create the new modules with one responsibility each.
2. Move functions without behavior changes.
3. Update route imports either directly to the new modules or through a temporary feature barrel.
4. Delete `src/lib/seller.functions.ts` once no imports reference it.

## Acceptance Criteria

- No file imports from `@/lib/seller.functions`.
- Seller server functions are grouped by responsibility.
- Behavior is unchanged.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.
