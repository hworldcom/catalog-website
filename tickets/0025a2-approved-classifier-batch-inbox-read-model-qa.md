# Ticket 0025a2: Approved Classifier Batch Inbox Read Model Quality Assurance

## Status

Completed implementation verification record.

## Ownership

- Repository: `catalog-website`
- Split from: `catalog-classifier/tickets/0025a-approved-classifier-batch-inbox-qa.md`
- Migrated on: 2026-08-15

## Purpose

Verify the Bazoria-owned half of ticket `0025a`: server-side classifier reads,
import-history joins, deterministic pagination, safe error mapping, no-store
responses, and absence of import side effects.

## Preconditions

- The classifier ticket `0025a1` endpoint is running with approved-groups
  export enabled.
- Bazoria Web is configured server-side for the same classifier organization.
- The disposable test data contains at least one imported approved batch and
  one approved batch without an import.

## Verification

1. Record the complete current `classifier_import_runs` snapshot.
2. Request `/v1/admin/classifier-batches` with a small valid limit.
3. Confirm Bazoria preserves classifier batch order and `nextCursor`.
4. Confirm imported batches include every matching run and destination seller.
5. Confirm an unimported approved batch remains visible with `imports: []`.
6. Traverse the next cursor and confirm there are no duplicate batch
   identifiers.
7. Repeat inbox reads and compare the complete import-run snapshot; identifiers,
   statuses, operation kinds, and update timestamps must remain unchanged.
8. Confirm invalid limits and malformed cursors return
   `classifier_batch_inbox_request_invalid` without exposing upstream bodies.
9. Confirm disabled export and unavailable classifier responses map to
   `classifier_batch_inbox_unavailable`.
10. Confirm the successful response includes `Cache-Control: no-store`.

## Completion Criteria

- The read model returns complete batch and import history.
- Pagination is deterministic and read-only.
- Upstream errors are safely normalized.
- No browser-visible value exposes server secrets or private classifier
  configuration.
