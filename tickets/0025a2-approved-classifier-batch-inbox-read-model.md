# Ticket 0025a2: Approved Classifier Batch Inbox Read Model

## Status

Implemented in `catalog-website`.

## Ownership

- Repository: `catalog-website`
- Split from: `catalog-classifier/tickets/0025a-approved-classifier-batch-inbox.md`
- Migrated on: 2026-08-15
- Record type: completed implementation ticket

## Objective

Expose a read-only Bazoria administrator model containing approved classifier
batches and every matching durable Bazoria import record without requiring the
browser to know or call the classifier service.

## Website Contract

Add:

```http
GET /v1/admin/classifier-batches?limit=50&cursor={opaqueCursor}
```

- Call classifier ticket `0025a1` from Bazoria server code.
- Join each returned batch to all `classifier_import_runs` for the configured
  classifier organization.
- Preserve approved batches with no import as `imports: []`.
- Return each stored destination seller identifier and current seller name;
  retain the identifier with `name: null` when the seller no longer exists.
- Preserve the classifier page order and opaque `nextCursor`.
- Keep loading, refreshing, and pagination read-only; none may create, retry,
  reconcile, or dispatch an import.
- Keep classifier base URLs, organization identifiers, credentials, Supabase
  service-role credentials, and upstream error bodies out of browser output.
- Set `Cache-Control: no-store`.

## Error Contract

- Invalid website pagination input, including a forwarded malformed cursor,
  returns `400 classifier_batch_inbox_request_invalid`.
- Disabled classifier approved-group export, timeouts, connection failures, and
  upstream server failures return `503 classifier_batch_inbox_unavailable`.
- Malformed classifier data returns
  `502 classifier_batch_inbox_response_invalid`.

## Acceptance Criteria

- Imported and unimported approved batches appear together.
- All matching import rows and destination seller context are attached.
- Pagination neither duplicates batches nor mutates import rows.
- The browser receives no classifier or database credentials.
- Empty results, missing seller names, upstream failures, malformed data, and
  invalid pagination are covered by focused tests.

## Dependencies

- Classifier ticket `0025a1-approved-classifier-batch-listing`.
- Ticket `0024b3a-admin-import-api-corrections` for destination-seller status
  semantics.
- Ticket `0025b-batch-store-attribution` for the read-only prototype
  destination shown before authorization.

## Validation Result

- Implemented and validated with focused response parsing, pagination, join,
  failure mapping, missing-seller, and read-only behavior tests.
- Cross-repository manual verification was split into companion ticket
  `0025a2-approved-classifier-batch-inbox-read-model-qa`.
