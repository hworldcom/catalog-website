# Ticket 0050: New This Week Marketplace Feed

## Status

Planned and deferred. Ticket 0049 may continue using the existing Trending
section until this ticket is implemented.

## Goal

Provide an honest newest-products feed so the marketplace homepage can display
`New this week` without reusing the manually curated trending feed.

## Expected Behavior

- Add a public database read function dedicated to newly published products.
- Return only published products owned by published sellers.
- Apply the existing All, Women, Men, and Kids audience filtering rules.
- Order products by publication recency using a defined publication timestamp,
  with a stable product identifier as the tie-breaker.
- Keep the existing `list_public_trending_products` function and Trending
  behavior unchanged.
- Update the marketplace homepage query and translated section copy only when
  the new feed is ready.
- Preserve product links, prices, currency, minimum order quantity, pack size,
  stock state, and image behavior.

## Decisions Required Before Implementation

- Confirm whether `published_at` should be added to products or whether an
  existing moderation/publication timestamp can be used reliably. Do not treat
  draft creation time as publication time without confirming the lifecycle.
- Confirm whether `New this week` means a strict rolling seven-day window or a
  recency-ordered feed that can include older products when fewer than the
  desired number were published during the last seven days.
- Confirm the desired homepage item limit and whether the presentation is a grid
  or horizontal rail.

## Non-Goals

- Changing the current Trending section before this ticket is implemented.
- Calculating popularity, views, sales, or engagement rankings.
- Redesigning product cards or other homepage sections.

## Validation

- Add migration tests covering permissions, publication state, seller state,
  audience filtering, ordering, and limits.
- Add focused server-function and homepage query tests.
- Run the full test suite, lint, and production build.
