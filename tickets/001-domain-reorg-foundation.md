# Ticket 001 - Domain Reorg Foundation

## Status

Completed. The domain-owned feature and shared-component structure is present,
and route files retain URL ownership.

## Goal

Create the target project structure for domain-owned code while preserving the current UI and URLs.

## Context

TanStack Start routes must remain under `src/routes`. The reorg should move implementation details into domain folders and leave route files as thin wrappers.

The catalog-classifier integration does not change this foundation. Bazoria Web should keep classifier ingestion/review logic out of marketplace and seller code. The admin feature can later link to, embed, or call the classifier, but the classifier remains a separate bounded context.

## Scope

- Create:
  - `src/features/marketplace`
  - `src/features/auth`
  - `src/features/seller`
  - `src/features/admin`
  - `src/features/account`
  - `src/components/layout`
  - `src/components/product`
  - `src/lib/supabase`
- Use this local convention for each feature:
  - `README.md` for feature ownership notes
  - `screens/` for route-rendered view components
  - `components/` for domain-only UI
  - `queries.ts` for query options when needed
  - focused `*.functions.ts` files at the feature root for TanStack server functions
  - `server/` only for server-only helpers that are not imported by client-route code
- Keep `src/routes` as URL ownership only.
- Keep classifier-specific ingestion, grouping, and image-processing logic out of Bazoria Web feature modules.

## Acceptance Criteria

- Folder structure exists.
- Feature folders use `screens/`, not `pages/`.
- Server functions use focused `*.functions.ts` files, not one large feature-wide server file.
- The literal `server/` folder is not used for importable TanStack server functions because TanStack Start import protection treats it as server-only.
- No URL changes.
- No visual changes.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.
