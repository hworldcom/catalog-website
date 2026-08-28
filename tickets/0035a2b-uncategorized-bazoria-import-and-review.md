# Ticket 0035a2b: Uncategorized Bazoria Import And Review

## Status

Implemented in `catalog-website` on 2026-08-08.

## Ownership

- Repository: `catalog-website`
- Split from: `catalog-classifier/tickets/0035a2-uncategorized-classifier-approval-and-import.md`
- Migrated on: 2026-08-15
- Record type: completed implementation ticket

## Objective

Accept nullable approved classifier categories, import categoryless or unmapped
approved groups as image-backed uncategorized ProductDrafts, and keep category
and product-code requirements at the publication boundary.

## Response Compatibility

- Accept `approvedCategorySlug` as either a trimmed nonblank string or null.
- Reject missing fields, blank strings, invalid types, and malformed group or
  image snapshots.
- Carry null through preflight, import execution, retry, diagnostics, seller
  review, and delegated-administrator review without fabricating a category.
- Preserve browser authorization through opaque Bazoria workflow identifiers.

## Database And Import Contract

- Make `classifier_import_group_outcomes.approved_category_slug` nullable while
  retaining the nonblank constraint for present values.
- Update group-preparation functions to accept and preserve a nullable source
  slug and regenerate Supabase types.
- Resolve a supplied slug only against supported active Bazoria Fashion leaves.
- Create a blank-title, uncategorized, uncoded ProductDraft when the slug is
  null, unknown, unsupported, inactive, or affected by taxonomy drift.
- Treat that state as successful review work rather than
  `category_not_mapped` failure.
- Preserve source locking, attempt fencing, seller ownership, image promotion,
  source memberships, and idempotent reuse of an existing source identity.
- Never allocate a product code during import.

## Read Model And Interface

- Present uncategorized imports as successful and actionable.
- Show **Category not set** and **Assigned when publishing** rather than a group
  failure.
- Keep the immutable nullable classifier source slug separate from the current
  editable Bazoria category.
- Link sellers and delegated administrators to the existing draft editor.
- Continue returning `product_publication_category_required` until a supported
  category is saved.
- Keep **Approve group** available for a valid categoryless classifier group
  and explain that category remains required before publication.

## Deployment Order

1. Deploy website ticket `0035a1`.
2. Apply this ticket's Bazoria migration and deploy nullable parsing, import,
   read models, and interfaces.
3. Deploy classifier ticket `0035a2a` so nullable output is never sent to an
   older strict website parser.
4. Verify one categoryless end-to-end import.

## Acceptance Criteria

- Null is accepted without accepting blank or malformed category values.
- Categoryless and unmapped groups create one uncategorized, uncoded,
  image-backed draft with a successful outcome.
- Retry creates no second draft or product-code allocation.
- Seller and delegated review clearly defer category completion to
  publication.
- Publication remains blocked until a supported category is selected.
- Existing categorized import and seller isolation remain unchanged.

## Dependencies

- Ticket `0035a1-optional-website-drafts-and-publication-code-allocation`.
- Classifier ticket `0035a2a-uncategorized-classifier-approval-and-export`.
- Tickets `0024b1`, `0024b2`, `0029d1`, `0029d2`, `0029e1`, `0029i1`, and
  `0029i2`.

## Validation Result

- Website response parser, snapshot validation, database migration, import
  worker, history, delegated continuation, and publication-error tests passed.
- Automated lint and production-build validation passed as part of the
  completed parent delivery.
