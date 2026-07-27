# Ticket 004 - Split Seller Feature

## Goal

Move seller dashboard UI code into `src/features/seller` while keeping existing seller routes and design stable.

This ticket is a mechanical route/body extraction, similar to the marketplace
split. Keep server function behavior and imports stable for now. The focused
seller server-function split is covered by tickets 008-013.

## Current Files

- `src/routes/_authenticated/seller.tsx`
- `src/routes/_authenticated/seller.index.tsx`
- `src/routes/_authenticated/seller.storefront.tsx`
- `src/routes/_authenticated/seller.products.tsx`
- `src/routes/_authenticated/seller.products_.new.tsx`
- `src/routes/_authenticated/seller.products_.$id.tsx`
- `src/routes/_authenticated/seller.leads.tsx`
- `src/routes/_authenticated/-product-editor.tsx`
- `src/components/image-upload.tsx`

## Target Locations

- `src/features/seller/screens/seller-layout-screen.tsx`
- `src/features/seller/screens/onboarding-screen.tsx`
- `src/features/seller/screens/overview-screen.tsx`
- `src/features/seller/screens/storefront-screen.tsx`
- `src/features/seller/screens/products-screen.tsx`
- `src/features/seller/screens/new-product-screen.tsx`
- `src/features/seller/screens/edit-product-screen.tsx`
- `src/features/seller/screens/leads-screen.tsx`
- `src/features/seller/components/seller-shell.tsx`
- `src/features/seller/components/side-nav.tsx`
- `src/features/seller/components/field.tsx`
- `src/features/seller/components/product-editor.tsx`
- `src/features/seller/components/image-upload.tsx`

## Scope

- Move seller dashboard layout, side nav, onboarding, overview, storefront, products, product editor, and leads views into `src/features/seller`.
- Move `ImageUpload` into `src/features/seller/components` because it is currently used only by seller storefront and product editor workflows.
- Leave authenticated route files as thin route wrappers.
- Keep existing imports from `@/lib/seller.functions` until tickets 008-013 split the server functions.
- Keep catalog-classifier ingestion out of the seller feature for now. The first classifier integration is admin-only.

## Out Of Scope

- Do not split, move, or delete `src/lib/seller.functions.ts` in this ticket.
- Do not create new seller server-function modules.
- Do not change seller authentication middleware.
- Do not change URLs.
- Do not change visible layout, styling, or copy unless required by the move.
- Do not expose classifier upload, processing, review, or import actions to sellers.

## Acceptance Criteria

- `/seller` and nested seller routes keep the same URLs.
- Seller onboarding, storefront edit, products, product editor, and leads still work.
- Seller route files are thin wrappers around feature screens.
- No active seller UI imports reference `src/routes/_authenticated/-product-editor.tsx`.
- `ImageUpload` imports point to the seller feature component.
- Existing `@/lib/seller.functions` imports may remain in seller feature files.
- No seller route exposes classifier upload, processing, review, or import actions.
- Auth middleware remains applied to protected routes.
- `npm run test:node22` passes.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.
