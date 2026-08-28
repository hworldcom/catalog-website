# Ticket 013 - Remove Legacy Seller Functions Module

## Status

Implemented. The legacy module and all imports from it are removed.

## Goal

Delete `src/lib/seller.functions.ts` after all seller server functions have moved into feature modules.

## Scope

- Update every import from `@/lib/seller.functions`.
- Prefer direct imports from focused modules unless a feature-level barrel is intentionally kept.
- Run `rg "@/lib/seller\\.functions" src` and resolve all matches.
- Delete `src/lib/seller.functions.ts`.
- Check that generated route code still builds after the move.

## Acceptance Criteria

- `src/lib/seller.functions.ts` no longer exists.
- `rg "@/lib/seller\\.functions" src` returns no imports.
- Seller routes still compile and run.
- `npm run test:node22` passes.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.

## Implementation Notes

- Deleted `src/lib/seller.functions.ts`.
- Updated the legacy import search to check the exact
  `@/lib/seller.functions` path, because valid feature modules such as
  `current-seller.functions.ts` contain the broader `seller.functions`
  substring.
- No `@/lib/seller.functions` imports remain under `src`.

## Verification

- `rg "@/lib/seller\\.functions" src`
- `npm run test:node22`
- `npm run lint:node22`
- `npm run build:node22`
- Dev smoke:
  - `GET /seller?lang=EN`
  - `GET /seller/leads?lang=EN`
  - `GET /seller/storefront?lang=EN`
  - `GET /seller/products?lang=EN`
