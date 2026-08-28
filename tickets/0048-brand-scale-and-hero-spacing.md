# Ticket 0048: Brand Scale and Hero Spacing

## Status

Implemented locally on 2026-08-24. The two focused tests, lint, and production
build pass. Automated desktop and mobile visual inspection remains pending
because Safari remote automation is disabled.

## Goal

Improve the prominence of the Bazoria wordmark and the readability of the
two-line marketplace homepage headline.

## Expected Behavior

- Increase the shared public-header wordmark from 28px to 32px high on mobile.
- Increase the wordmark from 32px to 36px high at the small breakpoint and
  above.
- Preserve the wordmark aspect ratio and header navigation behavior.
- Increase the marketplace homepage headline line height to 1.12 so the two
  headline lines have slightly more visual separation.
- Preserve all existing headline copy, font sizes, colors, and surrounding hero
  spacing.

## Non-Goals

- Redesigning the header or homepage hero.
- Changing seller-specific branding or demo-page headers.
- Changing typography on other headings.

## Validation

- Run the focused public shell and marketplace homepage tests.
- Run lint and the production build.
- Inspect the public header and homepage hero at mobile and desktop widths when
  browser automation is available.
