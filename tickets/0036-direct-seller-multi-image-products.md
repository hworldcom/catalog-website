# Ticket 0036: Direct Seller Multi-Image Products

## Status

Completed through tickets `0036a` and `0036b`. Manual Safari and Chromium
browser QA remains documented in ticket `0036b`.

## Ownership

- Repository: `catalog-website`
- Migrated from: `catalog-classifier/tickets/0036-direct-seller-multi-image-products.md`
- Migrated on: 2026-08-15
- Record type: completed implementation ticket

## Objective

Replace the direct seller product editor's single public cover upload with a
private, durable ProductDraft gallery containing up to 20 images, then publish
the complete selected gallery through the existing product-image publication
workflow.

Classifier-assisted ProductDrafts already support multiple private images.
This ticket brings the direct seller path to the same storage, publication, and
public-gallery standard without changing classifier grouping behavior.

## Product Decision

- A direct seller must first save the ProductDraft so image rows have a durable
  product identifier.
- A saved direct draft accepts up to 20 JPEG, PNG, or WebP images of at most
  20 mebibytes each.
- Draft objects remain private and are never represented by arbitrary public or
  external cover URLs in the new workflow.
- The repository has not deployed the old direct public-cover workflow. Existing
  development rows from that workflow may be reset or deleted; they are not a
  compatibility requirement.
- The first successfully finalized image becomes the default cover. The seller
  may choose another available image, reorder images, or remove images while
  the product remains an editable draft.
- Publication freezes and publishes the complete ordered gallery. The selected
  cover becomes `products.cover_image_url` only as a public compatibility
  projection after durable publication succeeds.
- Published-product image editing is deferred. Published galleries are
  read-only in this slice.

## Child Tickets

- `0036a-direct-product-private-image-lifecycle`
  - generalizes the private ProductDraft image schema for classifier and direct
    seller sources;
  - adds seller-owned prepare, upload-finalization, gallery mutation, and
    removal operations;
  - extends durable publication to direct ProductDraft galleries; and
  - preserves existing classifier-assisted products without preserving the
    pre-release direct public-cover workflow.
- `0036b-direct-product-image-gallery-interface`
  - replaces the direct seller single-cover control with a multi-image editor;
  - exposes upload progress, cover selection, ordering, removal, and recovery;
  - keeps imported galleries under their existing review rules; and
  - makes public gallery thumbnails select the displayed image.

## Ordering

Implement `0035a1` first so a seller can create a blank durable ProductDraft,
then implement `0036a`, followed by `0036b`. Do not expose the new browser
picker until the private upload and durable publication backend is deployed.

## Non-goals

- Adding images to or removing images from an already published product.
- Changing classifier upload, grouping, duplicate, or cover-selection rules.
- Image editing, cropping, background removal, or format conversion.
- Supporting videos, animated images, or documents.
- Publishing an image before the product publication transaction succeeds.
- Migrating or preserving pre-release direct public-cover rows.

## Acceptance Criteria

- A seller can save one direct ProductDraft and attach up to 20 private images.
- The seller can select the cover, reorder images, and remove images before
  publication.
- Draft image URLs are signed and private.
- Publication creates the exact ordered public gallery once and exposes the
  selected public cover.
- The public product page lets a visitor view every published image.
- Classifier-assisted products continue working.

## Dependencies

- Ticket `0035a1-optional-website-drafts-and-publication-code-allocation`.
- Tickets `0026c1` through `0026c4` for private image delivery.
- Tickets `0026h1` through `0026h3b` for seller galleries and durable public
  image publication.

## Validation Notes

Validate the children together with one end-to-end direct seller flow: save an
incomplete draft, upload several private images, change cover/order, remove one,
publish, and inspect the resulting public gallery. Repeat classifier-assisted
publication as a regression check. Pre-release direct public-cover data may be
discarded before validation.
