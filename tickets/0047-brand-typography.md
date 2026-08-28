# Ticket 0047: Brand Typography

## Status

Implemented locally on 2026-08-24. The focused test, lint, and production build
pass, and the production output contains the expected Bodoni Moda assets without
Space Grotesk assets. Automated desktop and mobile visual inspection remains
pending because Safari remote automation is disabled.

## Goal

Align the website typography with the Bazoria wordmark by using Bodoni Moda for
display text and Inter for interface and body text.

## Expected Behavior

- Load Bodoni Moda weights 400, 500, 600, and 700 from the local application
  bundle.
- Map the existing `font-display` token to Bodoni Moda.
- Keep the existing `font-sans` token mapped to Inter.
- Existing elements that use `font-display` adopt Bodoni Moda across public,
  seller, and administrator surfaces.
- Body text, controls, forms, and other interface text continue using Inter.
- Preserve the existing typography sizes, weights, spacing, and responsive
  behavior.

## Non-Goals

- Changing which individual elements use `font-display` or `font-sans`.
- Redesigning page layouts, colors, or branding assets.
- Loading fonts from a third-party runtime content delivery network.

## Validation

- Verify that the Bodoni Moda font files are included in the production build.
- Run the focused public shell test, lint, and production build.
- Inspect representative public and authenticated headings at mobile and desktop
  widths when browser automation is available.
