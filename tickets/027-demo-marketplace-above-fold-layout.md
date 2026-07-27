# Ticket 027 - Demo Marketplace Above-Fold Layout

## Status

Implemented locally on 2026-07-24.

## Goal

Adjust `/demo/marketplace` so the current marketplace preview keeps its visual direction while
showing the category discovery entry point earlier on a 13-inch laptop viewport.

## Expected Behavior

- Keep this work scoped to `/demo/marketplace`.
- Move the hero copy block higher by reducing oversized vertical spacing.
- Keep the search bar visually and structurally the same, positioned below the hero copy.
- Make the “Browse by category” heading and the first category cards visible without scrolling at
  approximately `1280 x 800`.
- Keep the hero stats row on wide desktop, but allow it to drop out on tighter laptop and mobile
  viewports when it blocks category discovery from appearing above the fold.
- Preserve the current desktop and mobile visual language.
- Preserve the active `lang` search parameter behavior.

## Non-Goals

- Do not replace the production home page with this demo.
- Do not redesign the search bar.
- Do not change category data, images, or click behavior.
- Do not move the demo route into production marketplace code.
- Do not rework the demo navigation beyond responsive overflow fixes needed for this layout.

## Validation Notes

- Run `npm run lint:node22`.
- Run `npm run build:node22`.
- Verify `/demo/marketplace?lang=EN` at a laptop-sized viewport, approximately `1280 x 800`.
- Spot-check mobile layout to ensure the tighter spacing does not cause overlapping content.
