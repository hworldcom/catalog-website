# Ticket 029 - Remove Stale Home Category Cards

## Status

Implemented locally on 2026-07-30.

## Goal

Remove only the listed stale category cards from the production marketplace home page. The listed
categories are database rows from the original generated project and do not match Bazoria's current
direction.

## Expected Behavior

- Keep the home page “Browse by category” section when there are non-stale categories to show.
- Remove only these stale category slugs from the home page category cards:
  - `textiles`
  - `home-decor`
  - `fashion`
  - `beauty`
  - `food`
  - `electronics`
- Keep `/demo/marketplace` and `/demo/kesar-textiles` unchanged as fake-data design previews.
- Keep database-backed category routes and seller/admin category selectors unchanged for now.
- Avoid showing the listed stale category names on home page seller cards.
- Keep the hero browse action pointed at categories when non-stale categories exist, falling back to
  product content when they do not.

## Non-Goals

- Do not delete database rows in this ticket.
- Do not rewrite the marketplace home page design.
- Do not change category management or product-category assignment behavior.
- Do not seed replacement Bazoria categories yet.

## Validation Notes

- Run `npm run lint:node22`.
- Run `npm run build:node22`.
- Verify the home page no longer renders the listed stale category cards.
- Verify any other categories returned by the database still render on the home page.
