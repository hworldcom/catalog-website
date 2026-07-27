# Ticket 025 - Durable Classifier Import Coordination

## Status

Implemented

## Goal

Implement classifier ticket `0024b1` in Bazoria Web: create durable import runs,
read approved classifier groups server-side, create or reuse seller-owned draft
products, and expose start, status, retry, and reconciliation endpoints.

## Approved Behavior

- The browser supplies only a classifier batch identifier.
- Server-only configuration supplies the classifier base URL, classifier
  organization identifier, and Bazoria seller identifier.
- Existing `products` rows with `status = 'draft'` are the Bazoria ProductDraft
  representation.
- Imported drafts start with an empty title for later human completion.
- Categories map by exact existing category slug.
- The configured seller must exist and be published.
- One durable import row exists per classifier organization and batch.
- One draft product exists per classifier organization and group.
- A dedicated worker claims database work using expiring attempt tokens.
- Stale workers cannot finalize run or group state.
- The image-preparation boundary is injected. Ticket `0024b2` provides its
  production storage and promotion implementation.
- Public retry and reconciliation requests only mutate durable database state;
  they never call classifier or storage services in the request.

## Implementation Notes

- Use PostgreSQL functions for short atomic claim, retry, and reconciliation
  transitions. Call them through the server-only Supabase service-role client.
- Keep classifier network calls outside database transactions.
- Use TanStack Start server routes for:
  - `POST /v1/admin/classifier-imports`
  - `GET /v1/admin/classifier-imports/{importId}`
  - `POST /v1/admin/classifier-imports/{importId}/retry`
  - `POST /v1/admin/classifier-imports/{importId}/reconcile`
- Application-level admin authentication remains postponed for the prototype.

## Non-goals

- Normalized-image reads.
- Draft-image and promotion persistence.
- Destination storage writes.
- Cover assignment.
- Browser interface work.
- Publishing imported drafts.

## Validation

- Add focused tests for configuration, response validation, error mapping,
  idempotency, action eligibility, retry and reconciliation state transitions,
  worker lease recovery, and stale attempt tokens.
- Run `npm run test:node22`, `npm run lint:node22`, and `npm run build:node22`.

Completed validation:

- 54 automated tests pass;
- lint passes with only the existing Fast Refresh warnings;
- the production build passes;
- an isolated PostgreSQL migration exercise confirms idempotent draft creation,
  retry requeueing, attempt-token rotation, and stale-token rejection.
