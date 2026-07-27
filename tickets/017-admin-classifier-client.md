# Ticket 017 - Admin Classifier API Client

## Goal

Add a small Bazoria Web server-side client for reading approved classifier data.

## Dependency

Requires classifier production authentication and an approved-group export endpoint, or an explicit decision to temporarily use the approved batch groups endpoint.

## Target Files

- `src/features/admin/server/classifier-client.ts`
- `src/features/admin/server/classifier.types.ts`

## Scope

- Add server-side configuration for classifier API base URL.
- Add server-side authentication mechanism once chosen.
- Read approved classifier batches or approved groups.
- Validate response payloads with Zod.
- Keep classifier API credentials out of browser code.
- Do not read classifier database tables directly.

## Acceptance Criteria

- Bazoria Web can fetch approved classifier group data server-side.
- Unapproved or unreviewed groups are not importable.
- Classifier API credentials are not exposed to client bundles.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.

