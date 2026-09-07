# Ticket 0055: Main Marketplace Storefront Theme

## Goal

Make the seller storefront use the same visual theme as the main marketplace
page, including the header row containing `Categories`, `Catalog`, `About`, and
`Contact`.

## Expected behavior

- The complete storefront uses the main marketplace color tokens.
- The sticky storefront navigation uses the same light card surface as the
  main marketplace header.
- The seller brand, section links, language switcher, WhatsApp action, and
  mobile menu remain unchanged.
- Existing storefront layout, imagery, and editorial content structure remain
  unchanged.

## Non-goals

- Redesigning storefront content sections or typography.
- Changing navigation destinations, sticky behavior, or mobile breakpoints.
- Changing layout, imagery, or typography.

## Validation

- Add focused coverage for the header surface class.
- Run the focused test, lint the touched files, and build the application.
- Verify the storefront header at desktop and mobile widths.

## Implementation notes

- Changed the sticky seller storefront header from `bg-background/95` to
  `bg-card/95`, matching the main marketplace header surface.
- Replaced the public storefront root's `.storefront-dark` theme with
  `.public-marketplace`, so all public storefront utility classes resolve to
  the main marketplace palette.
- Renamed the authenticated seller workspace wrapper to `.seller-workspace` so
  its existing palette remains isolated and unchanged.
- Added focused coverage for the light surface and preserved section links.

## Validation results

- Focused header test passed: 1 test.
- Touched-file lint passed.
- `npm run build` passed through the Node 22.13 fallback.
