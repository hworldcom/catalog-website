# Ticket 003 - Extract Layout And Product Components

## Status

Completed. Shared layout and product components are extracted and the legacy
`src/components/bazoria.tsx` module is removed.

## Goal

Split shared marketplace UI out of `src/components/bazoria.tsx` into focused component modules.

## Current Files

- `src/components/bazoria.tsx`

## Target Locations

- `src/components/layout/public-shell.tsx`
- `src/components/layout/not-found.tsx`
- `src/components/layout/page-error.tsx`
- `src/components/product/product-card.tsx`
- `src/components/product/product-format.ts`
- `src/components/product/product-format.test.ts`
- domain-local feature components when a component is not shared

## Scope

- Move public shell/navigation/footer into `src/components/layout`.
- Move error and not-found surfaces into layout or marketplace shared components.
- Move `ProductCard`, `formatPrice`, and stock label helpers into `src/components/product`.
- Rename the current public `Shell` export to `PublicShell`.
- Remove `src/components/bazoria.tsx` entirely.
- Update imports to direct focused modules instead of keeping a compatibility barrel.
- Move the current `src/components/bazoria.test.ts` coverage to product helper tests.
- Keep UI classes unchanged unless required by the move.
- Avoid broad visual refactors.
- Start this ticket only after ticket 002 has moved marketplace page bodies and catalog server functions into `src/features/marketplace`.
- Prefer starting this ticket after ticket 002a adds the test harness, so helper
  extraction can include focused regression tests.

## Out Of Scope

- Do not change visible layout, styling, or copy.
- Do not extract the seller dashboard shell from `src/routes/_authenticated/seller.tsx`.
- Do not fix unrelated Fast Refresh warnings in `src/components/ui/*` or `src/lib/i18n.tsx`.

## Acceptance Criteria

- `src/components/bazoria.tsx` is removed.
- No active imports reference `@/components/bazoria`.
- Product cards look and behave the same.
- Public shell looks and behaves the same.
- Product helper behavior has focused tests where practical.
- The two Fast Refresh warnings from `src/components/bazoria.tsx` are gone.
- Remaining Fast Refresh warnings in unrelated files are documented but not fixed in this ticket.
- `npm run lint:node22` passes with no new errors.
- `npm run test:node22` passes.
- `npm run build:node22` passes.
