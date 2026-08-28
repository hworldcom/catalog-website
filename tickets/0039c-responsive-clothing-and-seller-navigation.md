# Ticket 0039c: Responsive Clothing And Seller Navigation

## Status

Implemented.

## Ownership

- Repository: `catalog-website`
- Migrated from: `catalog-classifier/tickets/0039c-responsive-clothing-and-seller-navigation.md`
- Migrated on: 2026-08-15
- Record type: completed implementation ticket

## Objective

Replace the minimal public header with audience selection and accessible
Clothing and Sellers menus backed by the public read models from `0039b`.

## Desktop Interface

- Display Women, Men, and Kids as the audience choices.
- Clearly identify the selected audience.
- Use two left-aligned navigation rows: Women, Men, and Kids on the first row,
  then Clothing and Sellers directly below them on the second row. Do not push
  Clothing and Sellers to the opposite side of the audience row.
- Display Clothing and Sellers as primary navigation controls.
- Clothing opens a structured menu of garment categories for the selected
  audience.
- Sellers opens a bounded logo grid for the selected audience.
- Each seller logo includes an accessible seller name; when `logoUrl` is absent
  or fails, render a stable initials placeholder.

Opening behavior must support pointer hover, keyboard focus, and click. Moving
the pointer from a trigger into its panel must not close the panel. Escape
closes the current panel and restores focus to its trigger. Only one panel is
open at a time. Clicking outside closes the current panel. Triggers are buttons
with `aria-expanded` and `aria-controls`; panels have stable accessible labels.

## Mobile Interface

- Do not depend on hover.
- Show Women, Men, and Kids as tap targets.
- Show Clothing and Sellers as expandable disclosures or an equivalent compact
  navigation panel.
- Preserve focus order, readable labels, and minimum touch-target sizing.

## Navigation Contract

- Selecting an audience updates the normalized public `audience` search
  parameter without discarding `lang`.
- Category links preserve selected audience and language.
- Seller links preserve selected audience and language.
- Empty Clothing or Sellers results show a compact localized empty state rather
  than a broken or blank panel.
- Audience, Clothing, Sellers, empty-state, and category labels use the shared
  localization contract from `0039b`; the canonical database category name is
  only a fallback.
- Changing audience while already on a category or seller route keeps the route
  and displays that audience's results, including a successful empty state when
  there are no matches.

## Non-Goals

- A standalone seller-directory page.
- Search, promotions, sale navigation, or personalized recommendations.
- Copying About You styling, animations, or assets.

## Acceptance Criteria

- Navigation is usable with mouse, keyboard, touch, and screen-reader labels.
- Audience changes refresh Clothing and Sellers without a full page reload.
- A product assigned to multiple audiences remains discoverable through every
  matching audience without adding another public tab.
- Seller logos link to the correct published seller storefront.
- Menus remain usable at supported mobile and desktop breakpoints.

## Dependencies

- `0039b-audience-aware-public-catalog-reads`.
- Existing `PublicShell`, localization helpers, and public routes.

## Validation Notes

- Add interaction tests for hover, focus, click, Escape, panel switching, and
  missing seller logos.
- Add mobile disclosure tests and manually inspect mobile and desktop layouts.
- Run all public-shell tests, lint, and the production build.

## Implementation Notes

- Added one reusable marketplace navigation component with Women, Men, and
  Kids audience controls plus Clothing and Sellers panels.
- Updated the desktop hierarchy after browser review so the audience controls
  occupy the first row and Clothing and Sellers start at the same left edge on
  the row below, following the requested marketplace-navigation structure.
- Kept marketplace navigation opt-in on `PublicShell` so authentication and
  generic error pages do not depend on catalog reads. The branded seller
  storefront header uses the same component so audience changes remain
  available on seller routes.
- Added pointer, keyboard, click, touch, outside-press, Escape, focus-restoration,
  empty-state, route-preservation, and failed-logo behavior. Missing or failed
  seller logos render stable initials.
- Public homepage, category, seller, and product loaders prefetch the bounded
  audience-navigation snapshot alongside their page data.
- Focused navigation and shell tests passed. The full website suite passed with
  157 test files and 973 tests. Lint passed with the existing 13 Fast Refresh
  warnings and no errors. The Node.js 22 production build passed.
- Desktop and mobile visual inspection remains part of browser quality
  assurance.
