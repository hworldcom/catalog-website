# Ticket 0037: Supported Manual Product Ingestion

## Status

Implemented. Automated validation passes; manual browser availability and
responsive-layout QA remain.

## Ownership

- Repository: `catalog-website`
- Migrated from: `catalog-classifier/tickets/0037-supported-manual-product-ingestion.md`
- Migrated on: 2026-08-15
- Record type: completed implementation ticket

## Objective

Promote the direct seller product path from a legacy remnant to a supported,
always-available manual ingestion flow that is a peer of classifier-assisted
ingestion.

A seller must be able to create, complete, and publish a full multi-image
product while no classifier component is reachable, by entering everything
manually.

## Problem

Ticket `0029` made classifier-assisted ingestion the one supported
new-product ingestion flow and kept the direct product path only as an
unpromoted legacy remnant.

That leaves one availability gap: when the classifier service is unreachable,
the supported ingestion flow fails, and the seller has no supported way to add
a product even though the website, its database, and its image storage are
healthy.

The direct path has since gained most of the pieces a supported manual flow
needs:

- publication preflight validation and actionable errors from ticket `0029h`;
- optional draft fields, blank durable ProductDrafts, and category-optional
  text generation from the ticket `0035` family; and
- a private multi-image draft gallery with durable publication from tickets
  `0036a` and `0036b`.

What remains is the product decision, the entry point, the parity audit, and
the guarantee that no manual operation depends on the classifier.

## Product Decisions

- Bazoria Web supports exactly two new-product ingestion paths:
  - classifier-assisted ingestion, unchanged from the `0029` family; and
  - manual ingestion through the direct product path.
- Both paths are always presented to the seller. Availability of one path
  never hides, replaces, or automatically activates the other.
- The manual path never calls any classifier operation. Category suggestion,
  duplicate detection, and grouping are classifier-assisted features and are
  intentionally absent from manual ingestion.
- There is no health-based switching. Bazoria Web does not probe classifier
  availability to decide which flow to offer.
- A classifier-assisted workflow interrupted by classifier unavailability is
  recovered through its existing durable retry contracts. It is never
  converted into a manual product.
- Manual products intentionally have no classifier source membership. The
  absence of classifier source records is normal for a manual product and must
  never be treated as missing or corrupted data.
- Classifier-assisted ProductDrafts still require their immutable classifier
  source membership. Missing membership for a product that claims classifier
  provenance is invalid state rather than a reason to reinterpret it as manual.
- Both sources converge on the same seller-facing title, category, facts,
  description, publication, public-product, and ordinary non-image editing
  capabilities. Provenance-specific draft-gallery behavior remains intentional:
  manual draft galleries are editable, while classifier-imported galleries
  retain the read-only composition rule from ticket `0036b`.

## Scope

### Entry Points

- The seller products page header and empty state both present these peer entry
  actions:
  - **Add product manually** routes to `/seller/products/new`; and
  - **Upload photos for automatic grouping** routes to
    `/seller/classifier-batches/new`.
- Both actions remain rendered regardless of classifier configuration or
  availability.
- Remove legacy framing from the direct path in seller-facing wording, code
  comments, and developer documentation.
- When seller classifier creation, upload, processing, review, or import returns
  the exact existing `seller_classifier_unavailable` outcome, its error
  presentation adds the localized static guidance **Automatic grouping is
  temporarily unavailable. You can still add a product manually.** with a
  client-side router link to `/seller/products/new`.
- Do not show that guidance for unrelated database, validation, import-only, or
  configuration failures. This is static recovery guidance after an actual
  classifier request fails, not classifier health detection.

### Parity Audit And Closure

Audit every seller-facing product surface and remove any assumption that a
product originated from classifier import:

- seller product list and previews;
- ProductDraft editor, title, and category selection;
- structured facts editing;
- description generation and editing;
- private draft image gallery and cover selection;
- publication, publication status, and publication error presentation; and
- seller history and navigation.

Each surface must handle a product without classifier source records as a
normal product. Fix every import-only assumption found by the audit within
this ticket unless it requires schema changes, in which case record a
follow-up ticket before completion.

Record the audit in `docs/manual-ingestion-parity.md`. For every surface, keep
the discovered assumption, intended resolution, implementation source, and
focused test evidence current. The audit is a completion gate for this ticket,
not a runtime feature.

The seller products list is the shared inventory and resume surface for manual
and classifier-created ProductDrafts. Classifier history remains limited to
real classifier workflows and their upload, processing, review, approval,
import, and recovery state. Do not fabricate a classifier batch or history row
for a manual ProductDraft. A future unified seller activity history is outside
this ticket.

### Availability Guarantee

- No server operation used by the manual path may read classifier
  configuration, call the classifier client, or fail when classifier
  configuration is absent.
- Manual ingestion, editing, and publication must succeed while the
  classifier service, its database, and its bucket are unreachable.
- The same guarantee covers already-imported ProductDrafts: once import has
  completed, title, category, facts, description, gallery delivery, and
  publication operations require no classifier component. The classifier is
  required only while an assisted workflow is active between upload and
  import completion.

### Documentation

- Update the integration documentation and repository readme files to
  describe two supported ingestion paths and the availability guarantee.

## Acceptance Criteria

- With every classifier component stopped, a seller can create a manual
  product with multiple gallery images, complete its fields, and publish it.
  No request from this flow targets a classifier route or the classifier
  client.
- Manual products and imported products expose the same shared product-field,
  facts, description, publication, and public-product capabilities. The manual
  draft gallery remains editable and classifier-imported gallery composition
  remains read-only.
- Both ingestion entry points are visible regardless of classifier
  availability, and no code path selects a flow based on classifier health.
- A classifier-assisted workflow interrupted by unavailability resumes through
  its existing recovery contract after the classifier returns, and cannot be
  converted into a manual product.
- Exact `seller_classifier_unavailable` presentations include the static manual
  guidance sentence and link; unrelated errors do not.
- The parity audit is recorded surface by surface, and every fixed
  import-only assumption has a focused test.
- Browser and server tests cover the manual end-to-end flow with the
  classifier client stubbed as unreachable.

## Release Notes

- For the classifier-less website release defined by ticket
  `0038-website-uat-and-production-environments`, the assisted entry action
  remains presented but is rendered statically disabled with a localized
  not-yet-available note, and classifier configuration is absent from the
  deployed environments. This is static release presentation, not classifier
  health detection. The disabled state is removed when the classifier release
  ships.

## Dependencies

- Ticket `0029h-actionable-product-publication-errors`.
- The implemented ticket `0035` family for optional draft fields and
  category-optional generation.
- Tickets `0036a` and `0036b` for the direct product gallery.

## Assumptions

- The ticket `0036` gallery is the manual path's image mechanism; no separate
  manual upload pipeline is added.
- The durable product-image publication workflow remains shared by both
  paths.
- Text generation for manual products follows the existing explicit seller
  action and remains optional.

## Non-goals

- Automatic fallback or classifier health detection.
- Optional classifier calls inside the manual flow, including category
  suggestion for manually created products.
- Converting an interrupted classifier workflow into a manual product.
- Duplicate detection or grouping for manual products.
- Removing or changing classifier-assisted ingestion contracts.
- Published-product image editing.

## Validation Notes

- Stop the classifier service, database, and bucket access and remove classifier
  configuration from the website process, then create, complete, and publish a
  manual multi-image product.
- Inspect browser and server logs to confirm no classifier request occurred.
- Verify the classifier-assisted entry point remains visible and fails with
  its existing stable error plus the manual guidance sentence.
- Restart the classifier and resume one previously interrupted assisted
  workflow to confirm recovery is unaffected.
- Repeat the manual flow as a second seller and confirm ownership isolation.
- Review each audited surface with one manual and one imported product side
  by side.
- Confirm the seller products list contains both products while classifier
  history contains only the real assisted workflow.
