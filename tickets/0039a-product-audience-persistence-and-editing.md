# Ticket 0039a: Product Audience Persistence And Editing

## Status

Implemented on 2026-08-10. Automated validation and local PostgreSQL migration
quality assurance passed. Manual authenticated seller and delegated-
administrator browser quality assurance remains.

Tickets `0040b` and `0040c` complete the later published-product update path.

## Ownership

- Repository: `catalog-website`
- Migrated from: `catalog-classifier/tickets/0039a-product-audience-persistence-and-editing.md`
- Migrated on: 2026-08-15
- Record type: completed implementation ticket

## Objective

Persist one or more ProductDraft audience memberships independently from its
singular garment category and let sellers and delegated administrators select
them during product editing.

## Data Contract

Add a `product_audience_memberships` table with:

```text
product_id uuid
audience text
created_at timestamptz
```

Use `(product_id, audience)` as the primary key, reference `products(id)` with
`ON DELETE CASCADE`, and constrain audience to exactly `women`, `men`, or
`kids`. A ProductDraft may therefore have zero to three memberships. Duplicate
memberships and unsupported values are invalid.

`product_audience_memberships` is the authoritative audience set for an
unpublished ProductDraft and the last administrator-approved live audience set
for a published product. It is never a working-copy store for edits to an
already published product.

Draft and archived products may have no memberships. A published product must
have at least one. Because a row-level product constraint cannot enforce the
existence of a child membership, enforce this through the protected publication
and audience-write database functions:

- publication locks the product and rejects zero memberships before product-
  code allocation or public-image work;
- audience replacement locks the product, validates and deduplicates the
  complete requested set, writes it atomically for an unpublished ProductDraft,
  and rejects seller or delegated-administrator replacement on an already-
  published product with `product_audience_moderation_required`; and
- browser roles cannot insert, update, or delete membership rows directly.

Add one protected complete-set replacement database function. It accepts the
product identifier, server-resolved owning seller identifier, and requested
audience array. It locks the product, rechecks that the product belongs to that
seller, normalizes the complete set, deletes and inserts in one transaction, and
returns the persisted set. The server may deduplicate repeated request values,
while the table primary key remains the final duplicate-prevention boundary.

Ticket `0040b` owns published-product working revisions. A proposed published-
product audience change is stored only in that private working revision and its
immutable moderation snapshot. Ticket `0040c` replaces the live
`product_audience_memberships` set atomically from the approved snapshot during
activation. Until those tickets are deployed, changing a published product's
audience is unavailable rather than applied directly.

The authenticated Bazoria server operation must establish authority before any
service-role call:

1. a seller request uses the requester-scoped Supabase client to resolve the
   current seller and prove product ownership;
2. a delegated-administrator request passes the existing server-derived
   administrator gate and resolves the destination seller server-side; and
3. only then may the server invoke the service-role complete-set replacement
   function with the resolved seller and product identifiers.

The browser cannot choose a trusted seller identifier, call the replacement
function directly, or mutate membership rows. Do not implement replacement as
independent deletes and inserts because that can expose partial state.

Do not infer memberships for existing published products. Before deployment,
an explicit User Acceptance Testing (UAT) reset or operator-owned assignment
must leave every retained published product with at least one membership. The
migration or deployment preflight must fail rather than silently assigning all
products to Women, Men, or Kids.

Audience memberships do not change `category_id`, category code allocation,
product code, classifier category slugs, or the Clothing taxonomy. A product
continues to have at most one garment category because that category determines
its product-code prefix.

## Editing Contract

- Add an Audience multi-select to seller and delegated-administrator
  ProductDraft editing.
- Show only Women, Men, and Kids in those authenticated editors.
- Saving a draft permits zero, one, two, or three selections.
- Publishing with no selection returns the stable actionable error
  `product_publication_audience_required` before public-image work begins.
- After ticket `0040b`, moderation submission also rejects an empty set with
  `product_moderation_audience_required`; activation retains
  `product_publication_audience_required` as a defensive recheck.
- Selecting Women and Men is the supported representation of an adult product
  offered to both. Do not store or display an Unisex value.
- Existing title, category, description, image, and product-code rules remain
  unchanged.
- Classifier imports initially create ProductDrafts with no audience
  memberships. The seller or delegated administrator chooses at least one
  before publication.

## Public Contract

This ticket does not add audience labels to public product cards or product
detail pages.

## Acceptance Criteria

- Draft creation and saving support zero to three Women, Men, and Kids
  memberships.
- Unsupported values are rejected at the database boundary.
- Repeated request values are deduplicated before persistence, and the database
  primary key prevents duplicate stored memberships.
- Seller and delegated-administrator edits atomically preserve the complete
  selected membership set.
- Publication rejects zero memberships with a specific recoverable error.
- A published product cannot lose its last membership through a later edit.
- Browser roles cannot modify membership rows directly.
- Classifier imports remain compatible and do not fabricate memberships.
- Existing category and product-code behavior is unchanged.

## Stable Errors

- `product_audience_invalid` (400)
- `product_audience_product_not_found` (404)
- `product_audience_moderation_required` (409)
- `product_publication_audience_required` (409)
- `product_moderation_audience_required` (409, after `0040b`)
- `product_audience_unavailable` (503)

## Dependencies

- Current ProductDraft save and publication database functions.
- Seller and delegated-administrator product editors.
- Tickets `0040b` and `0040c` for edits to already published products.

## Validation Notes

- Add migration tests for accepted values, rejected values, duplicate
  prevention, zero-membership drafts, and required-publication state.
- Add concurrency and rollback tests for atomic complete-set replacement.
- Prove a published-product replacement attempt cannot change the live set and
  that approved activation replaces the entire set atomically.
- Add permission tests proving browser roles cannot mutate rows directly.
- Add server tests for seller ownership and delegated-administrator ownership.
- Add editor tests for multi-selection, clear, save, and publication error
  mapping.
- Run lint, the production build, and browser checks for direct and classifier-
  imported drafts.

## Implementation Notes

- Added the service-role-only `product_audience_memberships` persistence and
  complete-set replacement contract in Bazoria Web.
- Added database publication, retry, finalization, product-code allocation,
  and release-preflight enforcement.
- Added audience reads and writes to seller and delegated-administrator
  ProductDraft flows without changing classifier category contracts.
- The hosted UAT rollout retained four existing ProductDrafts. Their audiences
  were inspected and recorded explicitly in a separate data migration: three
  dress drafts/products use Women and one photographed trousers product uses
  Men. The subsequent preflight still fails for any other retained published
  product without an operator-owned assignment.
- Added the shared Women, Men, and Kids multi-select and actionable publication
  errors. Published-product audience editing remains disabled pending `0040b`.
- Validated the migration against local PostgreSQL, including canonical
  ordering, deduplication, unsupported values, ownership, empty publication,
  published-product moderation, and browser-role permissions.
- Passed 151 test files with 939 tests, lint with no errors, PostgreSQL schema
  lint with no new findings, and the Node.js 22 production build.
