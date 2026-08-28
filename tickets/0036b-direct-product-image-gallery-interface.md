# Ticket 0036b: Direct Product Image Gallery Interface

## Status

Implemented. Automated validation passes; Safari and Chromium browser QA
remains. Ticket `0036a` is implemented.

## Ownership

- Repository: `catalog-website`
- Migrated from: `catalog-classifier/tickets/0036b-direct-product-image-gallery-interface.md`
- Migrated on: 2026-08-15
- Record type: completed implementation ticket

## Objective

Replace the direct seller product editor's single cover-image control with a
private multi-image gallery editor and make the complete published gallery
usable on the public product page.

## Route And Draft Boundary

Use the supported authenticated Bazoria Web application only. Do not add this
workflow to deprecated `apps/web`.

An unsaved product has no gallery because it has no durable ProductDraft
identifier. On the new-product page:

- show **Save draft to add pictures** beside the disabled image section;
- keep normal unsaved form values intact;
- after **Save draft** succeeds, navigate or update to the canonical product
  edit route containing the returned ProductDraft identifier; and
- load the empty private gallery without requiring title or category, as
  enabled by `0035a1`.

Do not automatically create a ProductDraft merely because a file picker opens
or a user cancels file selection.

## Image Source Mode

The owned ProductDraft read returns a server-derived `imageSourceMode` with
exactly these values:

- `seller_upload` for a direct ProductDraft, including one whose gallery is
  empty; and
- `classifier_import` when classifier source membership exists.

The browser must not infer editability from the presence or absence of image
rows. `seller_upload` is editable while the ProductDraft is a draft;
`classifier_import` is read-only under its existing review rules. There is no
legacy direct/public-cover mode. Pre-release development rows that depend on
that workflow may be reset or deleted.

## Direct Draft Gallery

For an editable direct ProductDraft, render:

- an **Add pictures** file picker with `multiple` enabled;
- the count as `N of 20 pictures`;
- one ordered card per pending, available, failed, or deleting seller image;
- the selected cover label;
- **Make cover** for another available image;
- accessible **Move earlier** and **Move later** controls;
- **Remove picture** with confirmation; and
- per-image retry or cleanup actions when the backend says recovery is
  available.

`N of 20 pictures` counts non-deleting seller-upload rows, matching the backend
capacity rule. A deleting card remains visible until cleanup finishes but does
not consume one of the 20 active slots.

Drag-and-drop reordering may be added as a convenience, but keyboard-operable
move controls and deterministic ordering are required. The browser submits the
complete available order and expected gallery revision to one atomic mutation.
Disable cover and order controls while any seller-upload row is pending, failed,
or deleting; the backend enforces the same rule with
`product_draft_image_gallery_incomplete`.

The first successfully finalized image becomes the default cover. A seller can
change it without changing product category, title, facts, or descriptions.

Remove the direct product **Use URL instead** and single **Replace image**
controls once this feature is enabled. External/public URL input is not part of
the new direct ProductDraft workflow.

## Upload Experience

Accept JPEG, PNG, and WebP files no larger than 20 mebibytes each. Validate the
selection before preparing any upload:

- reject unsupported or empty files;
- reject a selection that would exceed 20 active images;
- generate one stable browser client-upload UUID per selected file;
- prepare all accepted files through the authenticated server operation;
- upload directly to each private signed destination with at most three file
  uploads in flight; and
- after all browser upload attempts settle, finalize every image identifier
  returned by prepare, including identifiers whose browser upload failed.

Finalizing every prepared identifier prevents an interrupted or failed browser
upload from leaving an unexplained pending row: a missing object becomes the
backend's explicit retryable failed state. If the complete finalization request
fails before receiving a response, keep the affected rows pending and expose
their server-derived `retry_finalize` action after the next gallery read.

Show independent state for each file using exactly `preparing`, `uploading`,
`finalizing`, `completed`, or `failed`. Byte-level percentage progress is not
required. One failure does not hide or discard successful siblings. Disable
only conflicting gallery actions while an upload or gallery mutation is active;
unrelated product fields remain editable.

Use the backend recovery action directly:

- `retry_finalize` rechecks a pending object without asking for another file;
- `retry_upload` asks the seller to select the file again, reuses the returned
  client-upload identifier, and requires immutable metadata to match;
- `retry_cleanup` on an upload-cleanup failure calls the authenticated
  `retryMyProductDraftImageCleanup(productDraftId, imageId)` operation described
  below;
- `retry_cleanup` on a deleting row repeats
  `removeMyProductDraftImage(productDraftId, imageId)`; and
- no recovery action renders no retry control.

Removal remains available for pending, available, and failed seller-upload rows.
A deleting row exposes only cleanup retry.

Do not render or accept private object keys. Keep the server-returned signed
upload path and token only in transient upload state, and expose no storage
service credentials or public URLs for draft images.

### Cleanup Retry Operation

Ticket `0036b` owns the missing authenticated cleanup-only server operation.
`retryMyProductDraftImageCleanup(productDraftId, imageId)`:

1. resolves the authenticated user to the owning seller and discloses no
   cross-seller identifiers;
2. accepts only a `seller_upload` row failed with
   `product_draft_image_upload_cleanup_failed`;
3. deletes the deterministic private object and verifies that it is absent;
4. atomically replaces the cleanup error with the ordinary retryable
   `product_draft_image_verification_failed` state so a later prepare call can
   authorize `retry_upload` safely;
5. increments the gallery revision only when durable state changes; and
6. returns the minimal mutation receipt containing `productDraftId` and
   `galleryRevision`.

Storage failure leaves the cleanup-required state unchanged and returns the
existing `product_draft_image_storage_unavailable` error. A deleting row is not
accepted by this operation because repeating removal already owns that cleanup.

## Snapshot And Unsaved-State Rules

Gallery mutations and signed-URL refreshes must not remount the product details,
facts, title, or description editors. Preserve all unsaved local text and facts
state.

Every lifecycle operation returns at least the minimal receipt containing
`productDraftId` and `galleryRevision`. Prepare also returns signed upload
destinations, and finalize also returns per-image outcomes, but no mutation
returns a complete gallery snapshot. After any successful mutation, re-read the
owned ProductDraft through the existing product read, then replace only gallery,
cover, revision, source mode, and image-delivery state in the current screen.
Do not replace or remount the complete product editor. If the server returns
`product_draft_image_gallery_stale`, preserve unsaved fields, perform the same
gallery-only re-read once, and ask the seller to repeat their gallery action.

When a signed image URL expires or its load fails:

- coalesce simultaneous refreshes into one current ProductDraft read;
- refresh image-delivery fields only;
- attempt no more than one automatic refresh for that failure; and
- show the unavailable placeholder if the refreshed image still fails.

## Imported And Published Products

Classifier-assisted ProductDrafts retain their existing source gallery and
review/publication rules. Do not show direct upload, removal, or ordering
controls for imported source memberships in this ticket.

After a product is published:

- render its seller editor gallery read-only;
- hide direct upload, cover, reorder, and remove actions; and
- keep ordinary supported non-image product edits unchanged.

Editing a published gallery requires a later versioned republication contract
and is outside this ticket.

## Publication Interface

For a direct draft using private images:

- disable **Publish** until at least one available image is selected as cover;
- disable it while any image is pending, failed, or deleting;
- explain the blocking image state next to the action;
- submit no `cover_image_url` patch;
- use the durable publication operation and progress polling already used for
  private imported galleries; and
- route retryable and cleanup-required outcomes through the existing actionable
  publication interface.

Backend publication validation remains authoritative. A stale browser cannot
publish a changed or incomplete gallery.

## Public Product Gallery

The marketplace product detail read already returns ordered `product_images`.
Update its interface so:

- the selected cover is the initial main image;
- every published image appears once in publication order;
- selecting a thumbnail replaces the displayed main image;
- the active thumbnail is visibly and programmatically indicated;
- keyboard and screen-reader users can select every image; and
- a failed non-cover image does not hide healthy siblings.

List, category, seller, and search cards continue using only the published
cover projection. They do not fetch complete galleries.

## Error Presentation

Map `0036a` errors to concise actionable messages:

- invalid file or selection: correct the listed files;
- limit exceeded: remove files until at most 20 remain;
- stale gallery: refreshed, repeat the action;
- gallery locked: wait for publication or resolve its existing failure;
- incomplete gallery: resolve pending, failed, or deleting images before
  changing cover or order;
- verification failure: retry or remove that image;
- deletion failure: retry cleanup before publication; and
- total storage unavailability: preserve the gallery and retry later.

Never replace a specific image failure with a page-level generic product error.
Ownership/not-found responses use the existing product-not-found screen.

## Acceptance Criteria

- A seller must save a new draft before the image picker becomes available.
- Direct and classifier-assisted image workflows are selected from the
  server-derived source mode, never inferred from current image rows.
- One selection can add multiple files without exceeding 20 total images.
- Every prepared image is finalized after upload attempts settle, and per-file
  state and partial failure are visible.
- Available images can be selected as cover, reordered, and removed.
- Gallery updates preserve unsaved details, facts, title, and descriptions.
- Upload-cleanup failure has a seller-owned cleanup-only retry operation;
  deleting rows resume the removal operation.
- Imported and published galleries remain read-only.
- Direct publication uses every ordered private image and never submits a
  manual public cover URL.
- A visitor can select every image on the published product page.
- The complete flow is keyboard usable and localized in supported languages.

## Dependencies

- Ticket `0036a-direct-product-private-image-lifecycle`.
- Ticket `0035a1-optional-website-drafts-and-publication-code-allocation`.
- Tickets `0026h1`, `0026h2`, and `0026h3b`.

## Non-goals

- Editing images after publication.
- Changing classifier-assisted gallery composition.
- Image cropping, transformation, or automatic visual ranking.
- Uploading by external URL.
- Loading full galleries on product-list cards.

## Implementation Result

- Saved direct drafts expose a private, editable gallery with multi-file
  upload, per-file lifecycle state, cover selection, deterministic ordering,
  removal, and server-directed recovery actions.
- Empty direct drafts remain `seller_upload`; classifier-assisted and published
  galleries remain read-only.
- Upload-cleanup failures use an authenticated cleanup-only operation backed by
  the lifecycle function introduced by `0036a`.
- Gallery-only refreshes preserve unsaved product, facts, title, and description
  editor state.
- Direct private galleries use the durable publication path and block
  publication until the cover and every image are available.
- Public product pages render every published image as a keyboard-selectable
  gallery and preserve healthy images when one image fails.
- The complete website test suite passes with 143 files and 887 tests. Lint
  passes with no errors and the Node.js 22 production build succeeds.

## Validation Notes

- Add component tests for the saved-draft gate, multiple selection, count,
  progress, cover, ordering, removal, stale refresh, and publication blocking.
- Test that all prepared identifiers are finalized after partial browser upload
  failure and that progress follows the five defined states.
- Add recovery tests for pending finalization, failed upload replacement,
  cleanup retry, and disabled cover/order controls during every unstable state.
- Test the cleanup-only operation's ownership, allowed lifecycle state,
  idempotent absence verification, revision receipt, and storage failure.
- Add tests proving gallery refresh preserves unsaved form/editor state.
- Add a regression test proving an empty saved direct gallery remains
  `seller_upload` rather than being mistaken for `classifier_import`.
- Add imported and published read-only regression tests.
- Add public gallery selection and accessibility tests.
- Run lint, production build, complete seller tests, Safari and Chromium browser
  QA, and an end-to-end direct draft upload/publication/public-gallery test.
