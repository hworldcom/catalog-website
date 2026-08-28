# Ticket 0040d3e: Browser-Compatible ProductDraft Image Picker

## Status

Implemented on 2026-08-17. Manual Safari confirmation remains pending.

## Objective

Allow sellers using Safari or a local-network development address to select
ProductDraft images through the visible `Add pictures` control and start the
existing durable upload lifecycle.

## Problem

The current control programmatically clicks a file input styled with
`display: none`. The database, signed upload, finalization, and gallery refresh
paths pass end-to-end browser validation, but Safari does not reliably deliver
the selected file through this custom activation pattern.

The upload also creates its idempotency identifier with
`crypto.randomUUID()`. Browsers do not expose that method on an insecure
local-network origin such as `http://10.10.10.200:8080`. Selection then throws
before the progress row or backend request is created, even though the same
flow works on the trusted `http://localhost:8080` origin.

## Scope

- Use native label-to-file-input activation for the `Add pictures` control.
- Keep the actual file input rendered and visually hidden instead of applying
  `display: none`.
- Preserve the existing visual button style, supported formats, 20 MB limit,
  multi-file behavior, progress state, and durable upload operations.
- Apply the same rendered-input compatibility treatment to the retry picker.
- Generate valid version 4 Universally Unique Identifiers (UUIDs) through a
  cryptographic-byte fallback when `crypto.randomUUID()` is unavailable.
- Add a focused component regression test for the native activation contract.
- Add a focused unit test for the insecure-origin identifier fallback.

## Non-Goals

- Adding new image formats.
- Changing storage, database, moderation, or publication behavior.
- Redesigning the product image gallery.

## Acceptance Criteria

- Clicking `Add pictures` natively activates its associated file input.
- The file input is visually hidden without using `display: none`.
- Disabled and 20-image-limit states cannot open the picker.
- Existing multi-file upload tests continue to pass.
- File selection starts upload preparation when `crypto.randomUUID()` is not
  available but `crypto.getRandomValues()` is available.
- Lint, focused tests, and production build pass.

## Dependencies

- `0036a-direct-product-private-image-lifecycle`
- `0040d3d-initial-draft-image-lifecycle-activation-compatibility`

## Validation

- Passed all 10 focused `ProductDraftImageGallery` component tests.
- Project lint completed with zero errors and the existing 13 fast-refresh
  warnings.
- Production build completed successfully for the Node.js 22 Vercel target.
- An authenticated visible-control browser test confirmed that `Add pictures`
  is a native label associated with a rendered `sr-only` file input.
- The visible control uploaded a PNG, reached `Completed`, and updated the
  same-page gallery count without console errors.
- Focused unit validation confirmed that the identifier fallback produces a
  valid version 4 UUID when `crypto.randomUUID()` is unavailable.
- The reported Chrome tab was using stale address `10.10.10.200`; the current
  development machine address is `10.2.23.200`. The stale origin was
  unreachable and was replaced with a fresh `http://localhost:8080` tab.
- Manual Safari 16.1 confirmation remains required because Safari Remote
  Automation is disabled on the development machine.
