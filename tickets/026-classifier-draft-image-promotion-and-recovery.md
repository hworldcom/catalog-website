# Ticket 026 - Classifier Draft Image Promotion and Recovery

## Status

Implemented on 2026-07-19

## Goal

Implement classifier ticket `0024b2` in Bazoria Web: persist auditable source
memberships and draft-image promotions, copy normalized classifier JPEG images
into Bazoria-owned storage, and recover safely from retries, expired claims,
existing objects, and explicit reconciliation.

## Approved Behavior

- Use the existing `product-images` bucket.
- Use deterministic destination keys:
  `product-drafts/{productDraftId}/images/{classifierImageId}.jpg`.
- Every approved exported membership receives one source-audit row.
- Only non-duplicate memberships receive draft-image, promotion, and storage
  objects.
- Storage writes are create-only and use exact classifier identity and trusted
  source-length metadata.
- Promotion and owning import-run attempt tokens fence every external write and
  terminal database transition.
- Missing objects are recreated only through explicit reconciliation.
- Conflicting objects are never overwritten.
- A classifier cover becomes the draft cover only when the draft has no
  operator-selected cover.
- The implementation exposes a server-only one-run worker entry. Deployment
  scheduling remains outside HTTP request handling.

## Non-goals

- ProductDraft creation or seller mapping.
- Browser interface work.
- Publishing ProductDrafts.
- Production service-to-service authentication.
- Deployment-specific worker scheduling.

## Validation

- Added focused configuration, classifier-client, storage, promotion-state,
  recovery, retry, reconciliation, stale-claim, and cover-preservation tests.
- Exercised the migrations and state transitions in isolated PostgreSQL,
  including duplicate suppression, token fencing, publication blocking, retry
  reset, and mixed missing/conflicting reconciliation results.
- A two-session PostgreSQL contention check confirmed that only one worker can
  claim a promotion row.
- `npm run test:node22`: 72 tests passed across 14 files.
- `npm run lint:node22`: passed with no errors and twelve unchanged Fast
  Refresh warnings.
- `npm run build:node22`: passed.
