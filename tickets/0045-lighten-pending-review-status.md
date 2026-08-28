# Ticket 0045: Lighten Seller Profile Statuses

## Status

Implemented locally on 2026-08-22. The focused test, lint, and production build
pass. Authenticated visual inspection remains pending.

## Goal

Make the seller profile `Not approved` and `Pending review` statuses visually
quieter and consistent with the seller dashboard palette.

## Expected Behavior

- Keep the existing status text, placement, dimensions, and moderation behavior.
- Give `Not approved` and `Pending review` the same seller-palette treatment:
  subtle primary tint, border, and normal foreground text.
- Replace the saturated yellow and destructive red fills used by those states.
- Preserve sufficient contrast and keep the status visually distinct from the
  approved and rejected states.

## Non-Goals

- Changing moderation state behavior or copy.
- Restyling approved, rejected, or other status badges and seller actions.
- Changing public storefront presentation.

## Validation

- Update the focused seller storefront tests to assert the shared subtle tone.
- Run the focused test, lint, and production build.
- Inspect the seller profile at desktop and mobile widths when authenticated
  test data is available.
