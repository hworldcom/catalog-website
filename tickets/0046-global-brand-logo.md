# Ticket 0046: Global Brand Logo

## Status

Implemented locally on 2026-08-24. The focused test, lint, and production build
pass. Automated desktop and mobile visual inspection remains pending because
Safari remote automation is disabled.

## Goal

Use the supplied Bazoria wordmark and browser-tab artwork for the public website
branding.

## Expected Behavior

- Replace the temporary `B` mark and text in the shared public header with
  `public/assets/brand/bazoria-logo.svg`.
- Render the wordmark in its native black color without a CSS color filter.
- Keep the brand link accessible and preserve its current marketplace home
  destination and language search parameters.
- Continue loading the browser-tab logo from `public/favicon.svg`.
- Keep the header usable at mobile and desktop widths without layout movement.

## Non-Goals

- Redesigning the header, navigation, footer, or marketplace pages.
- Replacing seller-specific logos or storefront branding.
- Creating additional logo variants or changing the supplied artwork.

## Validation

- Update the focused public shell test to verify the wordmark asset.
- Run the focused test, lint, and production build.
- Inspect the shared public header at mobile and desktop widths.
