# Ticket 030: Unified New Product Editor And Image Upload

## Status

Planned.

## Objective

Let an authenticated seller enter product information and upload private
ProductDraft images from one continuous new-product editor instead of requiring
an explicit save followed by a separate edit-screen upload step.

## Problem

The new-product screen currently renders product fields and an informational
image card. The image gallery becomes available only after `ProductEditor`
creates the ProductDraft and the screen transitions to the edit route. This
makes image upload appear to be a second workflow step and can lead sellers to
believe their product information was not retained.

Image preparation still requires a persisted, seller-owned `productDraftId`.
The solution must preserve that backend boundary rather than introducing
client-authorized image paths or temporary unauthorised uploads.

## Scope

- Replace the informational image card on the new-product screen with the same
  private image gallery used by the edit screen.
- Create or persist the ProductDraft when the seller first needs an identifier,
  such as selecting an image, using the current product fields and validation.
- Continue saving product information explicitly through `Save draft`.
- Start image preparation and signed upload only after the ProductDraft exists.
- Keep product fields, image upload, facts, and description generation in one
  continuous editor experience.
- Show clear progress for draft creation, image preparation, upload, and
  finalization.
- Preserve the existing seller ownership, moderation revision, gallery
  revision, file validation, signed-upload, and cleanup safeguards.
- Keep the existing edit route and behavior for already-created drafts.

## Intended Behavior

1. The seller opens **New product** and sees product fields and **Add
   pictures** in the same editor.
2. The seller may enter product information before selecting images.
3. On the first image selection, the client saves the valid product fields if
   no ProductDraft identifier exists.
4. Once the save returns a ProductDraft identifier, the client prepares and
   uploads the selected files automatically.
5. Additional files use the existing gallery upload lifecycle and remain
   bounded by the 20-picture limit and 20 MiB per-file limit.
6. The seller remains on the same screen and sees the saved fields and gallery
   without a forced navigation handoff.
7. Description generation remains disabled until the required product inputs,
   saved facts, and available cover image are current.

## State And Failure Rules

- Do not upload files before a seller-owned ProductDraft exists.
- Do not silently discard fields entered before automatic draft creation.
- If draft creation fails, keep the selected files in the browser and show a
  retry action without exposing file bytes to the server outside the signed
  upload lifecycle.
- If upload preparation fails, show the preparation failure separately from
  product-save failure and allow retry without creating duplicate image rows.
- If a product save or upload encounters a stale moderation or gallery
  revision, refresh the current state and require the user to retry the
  conflicting action.
- A failed upload must not make a pending image appear available.
- Abandoned drafts remain private and follow existing draft cleanup and
  recovery policy.
- Do not create multiple ProductDrafts when the user selects files repeatedly
  while the initial save is in progress.
- Do not start description generation while draft creation, product save,
  facts save, or image finalization is active.

## Non-goals

- Changing the ProductDraft image storage model or signed-upload protocol.
- Allowing uploads without authentication or seller ownership.
- Automatically publishing or submitting the ProductDraft for moderation.
- Moving image bytes through Cloud Run instead of direct signed storage upload.
- Changing the existing edit-screen gallery for previously-created drafts.

## Acceptance Criteria

- A new-product page presents product fields and image upload as one coherent
  editor.
- Selecting an image with valid product fields creates at most one draft and
  uploads the image without requiring a manual route transition.
- Product fields entered before image selection are persisted exactly once and
  remain visible after upload completion.
- Multiple selected images are uploaded with bounded concurrency and each file
  reports preparation, upload, finalization, completion, or failure.
- A save failure does not start image upload and does not lose selected files.
- A preparation or signed-upload failure can be retried safely without
  duplicate durable images.
- Concurrent clicks or repeated file selection do not create duplicate drafts
  or duplicate image rows.
- Existing ProductDraft editing, image replacement, ordering, cover selection,
  and cleanup behavior remains unchanged.
- Description generation stays blocked until the refreshed ProductDraft state
  is saved and the selected cover is available.
- No credentials, private image bytes, signed URLs, or personal data appear in
  client errors, logs, or test output.
- The page remains usable at desktop and mobile widths.

## Implementation Notes

- Prefer a shared new/edit editor composition over duplicating gallery logic.
- Keep the server as the authority for ProductDraft creation and revision
  numbers.
- Reuse `ProductDraftImageGallery` and its existing prepare, signed-upload, and
  finalize operations wherever possible.
- Model initial draft creation as an explicit client state so automatic saving
  cannot race with image preparation or description generation.
- Consider exposing a callback from `ProductEditor` that returns the saved
  ProductDraft snapshot and identifier without forcing route navigation.

## Tests

- New-product editor renders the image gallery before a ProductDraft exists.
- First image selection persists fields, creates one ProductDraft, and starts
  upload after the save response.
- Repeated selections during initial save share the same in-flight creation.
- Product-save failure preserves the selected files and prevents preparation.
- Upload preparation and signed-upload failures preserve retryability without
  duplicate rows.
- Stale revision responses refresh state and do not submit stale mutations.
- Existing edit-screen gallery tests continue to pass.
- Browser or component coverage verifies desktop and mobile layout essentials.

## Dependencies

- Existing seller ProductDraft creation and private image lifecycle functions.
- Existing `ProductDraftImageGallery` component and upload tests.
- The current seller ownership and moderation revision contracts.

## Validation Notes

- Test one image first, then a small batch, then the 20-picture boundary.
- Verify the browser never sends a file to a preparation endpoint; only file
  metadata should be sent before signed storage upload.
- Verify refresh during initial save and upload does not create duplicate drafts.
- Verify an abandoned private draft is not visible in the public marketplace.
- Run the complete seller ProductDraft and private-image test suites before
  hosted UAT validation.
