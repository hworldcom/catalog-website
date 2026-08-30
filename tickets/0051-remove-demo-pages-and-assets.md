# Ticket 0051 - Remove Demo Pages and Assets

## Status

Implemented locally on 2026-08-30.

## Goal

Remove the obsolete fake-data marketplace and Kesar Textiles previews now that the production,
database-backed marketplace and storefront designs have replaced them.

## Expected Behavior

- Remove `/demo/marketplace` and `/demo/kesar-textiles`.
- Remove the Kesar demo images under `public/assets/kesar`.
- Regenerate the TanStack route tree after removing the route files.
- Replace repository scripts or runnable quality-assurance instructions that use a deleted Kesar
  image with an existing marketplace image.
- Keep the production marketplace, category, product, and seller storefront routes unchanged.

## Superseded Decisions

- Ticket 027's `/demo/marketplace` implementation remains part of the project history, but the
  route is no longer retained.
- Ticket 029's requirement to keep both fake-data previews is superseded by this ticket.
- Historical comparisons to the previews in completed tickets do not require code changes.

## Non-Goals

- Do not change production marketplace or storefront behavior.
- Do not remove database-backed categories, products, or sellers.
- Do not change marketplace design assets that are still used by production pages.
- Do not reorganize or commit unrelated ticket files.

## Validation Notes

- Confirm no application source references either removed demo route or `public/assets/kesar`.
- Run `npm run lint:node22`.
- Run `npm run build:node22`.
- Confirm the production home page and a database-backed seller storefront still build normally.
