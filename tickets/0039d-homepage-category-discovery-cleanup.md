# Ticket 0039d: Homepage Category Discovery Cleanup

## Status

Implemented on 2026-08-10. Automated tests, lint, and the production build
passed. Lint retains the repository's existing Fast Refresh warnings. Manual
responsive browser quality assurance remains.

## Ownership

- Repository: `catalog-website`
- Migrated from: `catalog-classifier/tickets/0039d-homepage-category-discovery-cleanup.md`
- Migrated on: 2026-08-15
- Record type: completed implementation ticket

## Objective

Remove the homepage's flat garment-category card grid after the audience-aware
header becomes the primary category and seller discovery interface.

## Scope

- Remove the Browse by category card section from the marketplace homepage.
- Remove category-only copy, anchors, and homepage data that become unused.
- Change the hero Browse products action to
  `/c/fashion?audience={selectedAudience}&lang={lang}` rather than the removed
  category anchor. Absent audience still normalizes to Women.
- Keep existing `/c/{category}` routes and render the audience-filtered catalog
  view in place. Do not redirect leaf-category links. Preserve normalized
  `audience` and `lang` so previously shared or indexed routes remain valid.
- Keep trending products, featured suppliers, the seller call to action, and
  How it works unless their spacing needs a small adjustment after removal.
- Keep the existing Bazoria typography, color tokens, and responsive layout.

## Rollout Contract

Do not remove the category cards before `0039c` is deployed and usable on both
desktop and mobile. During implementation, verify there is always a working
path from the homepage to Clothing categories and seller storefronts.

## Acceptance Criteria

- The homepage no longer renders a flat grid of garment categories.
- Browse products opens the selected audience's Clothing catalog.
- Clothing categories and seller logos remain reachable from the header on
  desktop and mobile.
- Trending products and featured sellers continue to render correctly.
- Removed homepage data is no longer fetched solely for the deleted card grid.

## Dependencies

- `0039c-responsive-clothing-and-seller-navigation`.

## Validation Notes

- Add or update homepage tests for the removed grid and revised call to action.
- Manually verify homepage-to-category and homepage-to-seller navigation in all
  supported languages and at mobile and desktop sizes.
- Run lint and the production build.
