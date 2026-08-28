# Ticket 016 - Plan Classifier ProductDraft Import

## Status

Superseded; do not reopen. The approved-group export, ProductDraft import,
seller attribution, category mapping, idempotency, and publication boundaries
were defined and delivered through the later durable classifier workflow.

## Goal

Define the Bazoria-side import contract for converting approved classifier groups into Bazoria `ProductDraft` records.

## Context

The classifier does not yet provide a production product-draft export endpoint. Until that exists, approved classifier groups are reviewed internal ingestion results, not Bazoria products.

## Scope

- Define the Bazoria `ProductDraft` schema needed for classifier imports.
- Define source traceability fields:
  - `sourceSystem`
  - `sourceBatchId`
  - `sourceGroupId`
  - `sourceImageIds`
  - `pipelineVersion`
  - classifier warnings, if imported
- Define category mapping from classifier approved category to Bazoria category.
- Define seller or organization mapping:
  - Bazoria `seller.id`
  - catalog-classifier `organizationId`
- Define idempotency rules for repeated imports.
- Define what remains manual after import:
  - product name
  - slug
  - public description
  - price
  - minimum order quantity
  - stock
  - material/sizes/certifications

## Out Of Scope

- Calling the classifier API.
- Copying images.
- Creating actual draft rows.
- Publishing products.

## Acceptance Criteria

- ProductDraft import schema is documented.
- Required mappings are documented.
- Import idempotency approach is documented.
- The plan confirms approved groups create drafts only, never public products.
