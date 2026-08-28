# Ticket 0036a: Direct Product Private Image Lifecycle

## Status

Implemented. Browser interface work remains owned by `0036b`.

## Ownership

- Repository: `catalog-website`
- Migrated from: `catalog-classifier/tickets/0036a-direct-product-private-image-lifecycle.md`
- Migrated on: 2026-08-15
- Record type: completed implementation ticket

## Objective

Let an owning seller attach, verify, organize, and remove up to 20 private
images from a saved direct ProductDraft, and publish that complete gallery with
the existing durable product-image publication worker.

This ticket owns the database and authenticated Bazoria server boundary. Ticket
`0036b` owns the browser interface.

## Existing Behavior To Replace

The direct seller editor currently uploads one object straight to the public
`product-images` bucket and stores its URL in `products.cover_image_url`.
Classifier-assisted drafts instead use `product_draft_images`, private storage,
one selected `cover_image_id`, a frozen publication manifest, and public
`product_images` created only during publication.

The old direct path has not been deployed and is not a compatibility boundary.
Development rows created through it may be reset or deleted. Do not add a
legacy direct mode or migrate public/external direct cover URLs.

Do not add a second direct-image table or extend the public-URL shortcut to
multiple files. Generalize the existing private ProductDraft image model.

## Durable Source Model

Add a forward migration. Do not edit migrations already applied to User
Acceptance Testing (UAT).

Extend `product_draft_images` with:

- `source_kind text NOT NULL`, constrained to `classifier_import` or
  `seller_upload` and backfilled/defaulted to `classifier_import` for existing
  rows;
- nullable `classifier_image_id`;
- nullable `client_upload_id uuid`;
- nullable `original_filename text` with a nonblank value of at most 255
  Unicode characters when present;
- nullable `lifecycle_error_code text`; and
- an extension of the durable image status to represent exactly `pending`,
  `available`, `failed`, and `deleting` without treating a row being deleted as
  deliverable or publishable.

Enforce source consistency:

- `classifier_import` requires non-null `classifier_image_id` and null
  `client_upload_id`;
- `seller_upload` requires null `classifier_image_id` and non-null
  `client_upload_id`;
- preserve classifier uniqueness with a partial unique index on
  `(product_draft_id, classifier_image_id)` for classifier rows; and
- enforce one seller row per `(product_draft_id, client_upload_id)` so a lost
  prepare response can be replayed idempotently.

Before adding order/source constraints, fail the migration with a diagnostic if
existing classifier rows violate the expected source identity or contain
duplicate positions. Do not silently reorder an imported gallery during
migration.

Require a nonblank lifecycle error for `failed`. Require no lifecycle error for
`pending` or `available`; `deleting` may contain only the stable deletion error
after a cleanup attempt fails. Verified content type and size are mandatory for
`available` and immutable afterward.

Keep `id` as the source-independent ProductDraft image identity. Existing
classifier promotion tables continue referencing the rows they created and do
not apply to seller-upload rows.

Add `products.image_gallery_revision bigint NOT NULL DEFAULT 0`. Every accepted
seller gallery mutation increments it. Mutation operations require the caller's
expected revision and return `product_draft_image_gallery_stale` rather than
silently overwriting changes from another tab.

Enforce unique `(product_draft_id, source_position)` ordering across every
durable image row, including pending, failed, and deleting rows. Reorder under a
product-row lock with a two-phase temporary offset so the immediate unique
constraint never collides. Cover and order mutation is allowed only when every
non-deleting seller-upload row is available. Pending, failed, or deleting rows
therefore cannot occupy positions that the available-only mutation attempts to
rewrite.

## File Contract

Seller uploads support these Multipurpose Internet Mail Extensions (MIME)
types and limits:

- MIME types `image/jpeg`, `image/png`, and `image/webp`;
- a non-empty file no larger than 20 mebibytes;
- at most 20 non-deleting image rows per ProductDraft; and
- private objects only in `product-draft-images`.

Update the private bucket's allowed MIME types and limit accordingly. Update
the ProductDraft image available-field constraint to accept those three MIME
types. The server verifies the stored object size, content type, and matching
file signature before setting `available`; browser metadata is not trusted.

Use deterministic private keys owned by the server, conceptually:

```text
product-drafts/{sellerId}/{productDraftId}/{productDraftImageId}.{extension}
```

The browser never chooses a bucket or object key and never receives service-role
credentials. Supabase's signed-upload client requires the server-owned path and
token; those values authorize only that exact private object and are temporary,
not a general storage credential.

## Authenticated Upload Operations

Add authenticated Bazoria server operations. They resolve the current user to
the seller before using service-role storage or database access. A caller-sent
seller identifier is never authoritative.

### Prepare

`prepareMyProductDraftImageUploads` accepts:

```text
productDraftId
expectedGalleryRevision
files: 1..20 entries of clientUploadId, originalFilename, contentType, sizeBytes
```

For one locked seller-owned `draft` ProductDraft, it:

1. rejects imported source membership because classifier galleries keep their
   existing workflow ownership;
2. rejects a pending, running, cleanup-required, or otherwise gallery-freezing
   publication run;
3. strictly validates all entries and duplicate client identifiers;
4. counts existing non-deleting rows and rejects a result over 20;
5. creates or reuses one `pending` seller-upload row per client identifier in
   request order;
6. reserves non-colliding source positions;
7. increments the gallery revision once for newly created rows; and
8. returns each image identifier, server-owned path, signed upload token,
   two-hour expiry, and resulting gallery revision.

Apply idempotency and revision validation in this exact order:

1. validate the complete request body;
2. resolve the authenticated seller, lock the owned ProductDraft, and enforce
   the direct-draft and publication-lock rules;
3. look up every supplied client-upload identifier and compare its immutable
   filename, content type, and size;
4. reject any identifier reused with different metadata;
5. when every entry is an exact existing `pending` or `available` row, treat the
   request as a replay: do not require the now-stale expected revision, do not
   create rows or change positions, and do not increment the revision; and
6. when any entry would create a row or reset a retryable failed row, require the
   expected revision to equal the locked current revision before changing
   anything.

This ordering covers a prepare response that is lost after its database write.
The browser may repeat the original request with its old revision and recover
the already-created rows instead of creating duplicates or receiving a false
stale-gallery error. A mixed request containing any genuinely new or failed-row
retry remains a new mutation and must pass the revision check atomically.

The two-hour lifetime follows the installed Supabase signed-upload contract.
The path and token exist only to call `uploadToSignedUrl`; the browser must not
derive, modify, display, or persist them beyond the upload attempt.

Replaying the same valid client identifier returns the same row and a fresh
signed upload token while it remains pending. If the row is already available,
replay returns its current completed state without authorizing an overwrite. No
replay consumes a second position. Reusing the identifier with different
immutable metadata returns `product_draft_image_upload_conflict`.

A failed-row retry is a new gallery mutation rather than an idempotent replay.
It requires the current gallery revision. The server may reset it to `pending`
and issue a new token only after the deterministic private object is verified
absent. Finalization must delete an invalid object and verify absence before it
records an ordinary retryable verification failure. If that cleanup fails, keep
the row `failed` with `product_draft_image_upload_cleanup_failed`, issue no
upload token, and expose `retry_cleanup`. A successful cleanup changes the
durable error back to the original retryable verification failure; a later
prepare call can then reset the row to `pending`. This prevents late cleanup
from deleting bytes uploaded by a newer retry.

### Finalize

After direct signed uploads complete,
`finalizeMyProductDraftImageUploads` accepts the ProductDraft identifier and the
prepared image identifiers. It verifies each object from server code and
returns a result for every requested image.

- Valid objects become `available` with verified content type and size.
- Missing objects become `failed` with a stable retryable per-image error.
- Invalid objects become an ordinary retryable `failed` row only after their
  bytes have been deleted and absence verified. Failed cleanup uses
  `product_draft_image_upload_cleanup_failed` and must be resumed before upload
  retry.
- If the ProductDraft has no cover, the earliest newly available image becomes
  `cover_image_id`.
- The gallery revision increments once when durable state or cover changes.
- Replaying finalization is idempotent.

Partial upload failure does not discard healthy sibling images. Failed rows can
be retried with the same client identifier or removed.

Bound finalization to 20 images, at most five concurrent storage verifications,
a ten-second timeout for each metadata/signature verification, and a 60-second
overall deadline. Cancel remaining work at the deadline and leave those rows
pending so the same finalization request can be retried.

## Gallery Mutation

Add one atomic `updateMyProductDraftImageGallery` operation accepting:

```text
productDraftId
expectedGalleryRevision
orderedAvailableImageIds
coverImageId
```

It locks the owned direct draft, requires the supplied ordered identifiers to
equal the complete current set of available, non-deleting images exactly once,
requires the cover to belong to that set, rewrites positions safely, increments
the revision, and returns the current gallery snapshot. Reject the complete
mutation with `product_draft_image_gallery_incomplete` when any pending, failed,
or deleting seller-upload row exists. Those rows are not valid cover or ordering
members, and the operation never silently moves around them.

No-op replays return the unchanged snapshot without incrementing the revision.

## Durable Removal

`removeMyProductDraftImage` applies only to seller-upload rows on an editable
direct draft.

1. Lock the product and image and validate the expected gallery revision.
2. Reject removal while publication freezes the gallery.
3. Mark the row `deleting`, move it outside the active position range, choose
   the first remaining available image as cover when necessary, compact all
   remaining non-deleting positions with the two-phase ordering operation, and
   increment the revision.
4. Delete the private object from server code.
5. Delete the durable row only after storage reports success or object absence.

A process interruption leaves a durable `deleting` row visible in the owning
seller's editor lifecycle read but excluded from signed delivery and
publication. Repeating removal resumes cleanup. A storage failure leaves the
row deleting with `product_draft_image_delete_failed`; it never makes the object
public or blocks healthy image display, but publication remains blocked until
cleanup completes.

## Private Read Contract

Reuse the current seller ProductDraft gallery delivery service for both source
kinds. It returns ordered available images and signed URLs only after seller
ownership succeeds. Add source kind, gallery revision, original filename,
lifecycle error, and seller-upload client identifier to its owned server read
model, but do not expose private object keys or classifier identifiers. The
client identifier is returned only for an owned seller-upload row so a file
retry can reuse the durable idempotency key.

Pending, failed, and deleting seller rows return explicit non-delivery state for
the editor. Include a server-derived primary recovery action rather than making
the browser infer it from error strings:

- `pending` returns `retry_finalize` after browser-local upload state is lost;
- an ordinary verified-absent `failed` row returns `retry_upload`;
- `product_draft_image_upload_cleanup_failed` and a `deleting` row return
  `retry_cleanup`; and
- `available` returns no recovery action.

Owned pending, available, and failed seller rows may also be removed; deleting
rows resume the existing removal. One unavailable signed image remains an
image-level placeholder and does not fail the complete product page.

## Durable Publication Generalization

Generalize `authorize_seller_product_publication` and its delegated wrapper:

- classifier source membership still requires the classifier-imported private
  gallery and all existing source checks;
- a direct ProductDraft with seller-upload rows uses the same durable private
  publication path without fabricating classifier source identity;
- a direct ProductDraft cannot publish through `cover_image_url`; and
- a direct ProductDraft without a complete private seller-upload gallery is not
  publishable.

For a private direct gallery, authorization locks the ProductDraft and requires:

- between one and 20 available images;
- no pending, failed, or deleting image rows;
- one selected cover belonging to the available set;
- a valid title, category, code allocation, and every existing product
  publication prerequisite; and
- no concurrent gallery revision change while the manifest is frozen.

Freeze every available image in source-position order. Extend publication-item
content validation to JPEG, PNG, and WebP and derive the deterministic public
destination extension from the verified content type. The worker still performs
one byte-for-byte private-to-public copy and verification per manifest item.

Finalization creates or reconciles one source-linked `product_images` row per
manifest item, preserves order, sets the selected public URL as
`products.cover_image_url`, and changes the product to `published` atomically.
Retries reuse the frozen manifest. Gallery mutation remains blocked after
authorization has accepted that manifest.

## Cutover And Source Contract

- Existing classifier rows are backfilled as `classifier_import` and retain
  their current identifiers, promotions, ordering, and publication behavior.
- Product-level seller reads expose one server-derived image source mode:
  `seller_upload` or `classifier_import`.
- Classifier source membership selects `classifier_import`. A ProductDraft with
  no classifier source membership selects `seller_upload`, including a newly
  saved direct draft whose gallery is still empty. The browser must not infer
  this mode from whether image rows currently exist.
- Pre-release direct drafts or products containing only a public/external cover
  may be deleted or reset during development cutover. They do not create a
  third source mode and are not migrated.
- Direct-draft writes must not create a public object or accept a manually
  supplied cover URL once the `0036` migration and server release are deployed.

The selected private cover remains valid input to the existing image-grounded
title and description generation operation. Direct private covers use the
current `private_draft` source contract and never fall back to a public cover
URL.

## Stable Errors

Use stable server errors, including:

- `product_draft_image_upload_invalid`;
- `product_draft_image_upload_limit_exceeded`;
- `product_draft_image_upload_conflict`;
- `product_draft_image_not_found`;
- `product_draft_image_gallery_stale`;
- `product_draft_image_gallery_locked`;
- `product_draft_image_gallery_incomplete`;
- `product_draft_image_verification_failed`;
- `product_draft_image_upload_cleanup_failed`;
- `product_draft_image_delete_failed`; and
- `product_draft_image_storage_unavailable`.

Ownership failures use the existing not-found behavior and do not disclose
another seller's ProductDraft or image identifiers. Malformed request bodies are
400; stale or locked state is 409; total storage/database unavailability is 503.

## Acceptance Criteria

- One saved direct draft accepts 1 to 20 private seller images.
- The twenty-image limit remains correct under concurrent prepare requests.
- Lost prepare and finalize responses can be replayed without duplicate rows or
  positions.
- Stored content is verified before availability.
- Cover and order changes are atomic and stale-tab safe.
- Removal is resumable and never leaves a public draft object.
- Direct publication freezes and publishes the exact complete gallery.
- JPEG, PNG, and WebP retain verified content type and correct public extension.
- Classifier imports remain compatible.
- Cross-seller reads and mutations disclose nothing.

## Dependencies

- Ticket `0035a1-optional-website-drafts-and-publication-code-allocation`.
- Tickets `0026c2`, `0026c4`, `0026h1`, and `0026h3a`.
- Existing seller product publication dispatcher and worker.

## Non-goals

- Browser interface work; ticket `0036b` owns it.
- Editing a published gallery.
- Converting image formats or changing image dimensions.
- Migrating or preserving pre-release direct public-cover data.
- Changing classifier grouping or imported gallery composition.

## Validation Notes

- Add forward-migration and clean-reset database tests.
- Test source-kind checks, partial uniqueness, revision fencing, ordering,
  twenty-image concurrency, cover repair, and durable deletion.
- Test an exact prepare replay with the pre-response revision, a mixed
  replay/new request with a stale revision, and conflicting metadata reuse.
- Test that invalid-object cleanup completes before retry authorization and that
  a late cleanup cannot delete bytes from a newer upload attempt.
- Test that pending, failed, and deleting rows block cover/order mutation while
  remaining visible with the correct server-derived recovery action.
- Test signed prepare and finalize with valid and invalid JPEG, PNG, and WebP
  objects.
- Test direct publication authorization, manifest freezing, worker copy,
  retry, cleanup, and finalization, plus classifier-import compatibility.
- Test seller ownership and delegated-administrator publication boundaries.
- Run complete website database tests, server tests, lint, production build,
  and storage integration QA before enabling the browser feature.

## Implementation Result

Implemented in Bazoria Web with:

- forward migrations for seller-upload image identity, lifecycle state,
  revision fencing, private storage policy, and direct-gallery publication;
- authenticated seller prepare, finalize, reorder/cover, and resumable removal
  server operations;
- seller-owned private gallery delivery for classifier and direct images;
- JPEG, PNG, and WebP verification and publication support; and
- classifier-import compatibility.

The implementation initially retained an unused direct-public-cover
compatibility branch. That branch is no longer a product requirement and must
not be exposed by `0036b`; pre-release data that depends on it may be reset.

Automated validation completed on 2026-08-08:

- clean local Supabase migration reset passed;
- all 24 database test files passed with 456 assertions;
- all 142 website test files passed with 874 assertions;
- lint passed with only the repository's existing fast-refresh warnings; and
- the Node.js 22 production build passed.

Storage integration and browser interaction remain part of `0036b` validation,
because `0036a` intentionally exposes no new browser controls.
