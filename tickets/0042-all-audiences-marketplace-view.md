# Ticket 0042: All-Audiences Marketplace View

## Status

Implemented on 2026-08-15. Focused frontend and database coverage, repository
lint, database lint, the production build, and responsive browser inspection
passed. Full-suite exceptions caused by concurrent ticket work are recorded in
the implementation notes.

## Ownership

- Repository: `catalog-website`
- Product area: public marketplace navigation and discovery
- Primary route: `/`
- Related routes: `/c/$category`, `/s/$sellerSlug`, `/p/$productId`, and
  `/join`

## Objective

Make the marketplace home a neutral discovery destination instead of silently
defaulting visitors to Women. Add an `All` audience option that shows the
combined published marketplace across Women, Men, and Kids while retaining the
existing audience-specific views.

`All` is a public read filter. It is not a product category, a stored product
audience, or a replacement for the existing audience memberships.

## User Experience

The audience row becomes:

```text
All  Women  Men  Kids                                      Join Us
```

- Put All before Women, Men, and Kids.
- Keep Join Us aligned at the far right on desktop.
- Preserve the existing tinted audience-row treatment and keep Clothing and
  Sellers together in the row below.
- Indicate All with the same selected underline and accessible pressed state
  used by the other audience options.
- Keep the expanded row horizontally safe on mobile. Controls may scroll when
  translated labels do not fit, but each label and touch target must remain
  usable.

## Home Behavior

- Treat `audience=all` as the default public marketplace view.
- Clicking the public-header Home link or Bazoria logo must navigate to `/`
  with `audience=all`, preserving the current `lang` value.
- Explicit public `Go home` actions should follow the same rule where they use
  the marketplace root as their destination.
- Do not preserve a previously selected Women, Men, or Kids filter when the
  user explicitly chooses a Home affordance.
- Selecting Women, Men, Kids, or All from the audience row continues to update
  the current public route rather than forcing a return to the homepage.
- Preserve the selected audience across ordinary product, category, seller,
  Join Us, and language navigation as today.

## Audience Contract

Extend the normalized public filter contract to:

```text
audience=all | women | men | kids
```

- Normalize an absent, empty, or unsupported browser value to `all`.
- Keep `women`, `men`, and `kids` as exact audience filters.
- Include `all` in route validation, loader dependencies, and query cache keys.
- Keep the database and seller-editing product audience contract unchanged:
  products may be assigned only to Women, Men, and Kids.
- Do not insert an `all` row into `product_audience_memberships`.

## All-Audiences Read Semantics

For `audience=all`, public reads include records supported by at least one
valid Women, Men, or Kids product membership:

- Homepage products include published trending products from published
  sellers across all audiences.
- Homepage featured sellers include published sellers with at least one
  published product in any audience.
- Clothing includes configured garment categories with at least one matching
  published product in any audience.
- Sellers includes published sellers with at least one matching published
  product in any audience.
- Category pages include matching published products and their eligible
  sellers across all audiences.
- Seller storefronts include that seller's published products across all
  audiences.

A product assigned to more than one audience must appear only once in an All
result. Existing result limits and deterministic ordering remain unchanged.
Products without any valid audience membership remain excluded, including
from All.

For `women`, `men`, and `kids`, preserve the current exact-membership behavior
without fallback to another audience.

## Database Changes

- Add a new migration; do not rewrite the implemented audience-read migration.
- Extend the public catalog audience normalization function to accept `all`
  and use it as the fallback.
- Update every audience-aware public database function used by navigation,
  homepage, category pages, and seller storefronts to implement the semantics
  above.
- Use existence checks or an equivalent deduplicating query shape for All so a
  product with multiple audience memberships cannot consume multiple result
  positions.
- Preserve publication checks, security-definer protections, grants, input
  bounds, field projections, limits, and deterministic ordering.
- Do not expose the private audience-membership table directly to browser
  roles.

## Localization

Add the All navigation label through the existing localization contract:

- English: `All`
- Polish: `Wszystko`
- German: `Alle`
- Vietnamese: `Tất cả`

Do not change existing audience or section labels.

## Interface Requirements

- Preserve the existing marketplace navigation layout, colors, borders,
  selected-state treatment, disclosure behavior, and keyboard interactions.
- Keep a minimum 44-pixel touch target for every audience control.
- Keep Join Us in the audience row and Clothing and Sellers below it.
- Do not add a separate category card, homepage section, or stored taxonomy
  node named All.
- Do not add client-side merging of three independently limited audience
  responses; the combined result must be produced by the bounded public read
  model.

## Edge Cases

- A product assigned to Women and Men appears once in All and once in each of
  the two exact audience views.
- A seller with products in multiple audiences appears once in All.
- A category supported by multiple audiences appears once in the Clothing
  menu.
- An unsupported `audience` search value normalizes to All without reaching a
  database function as an untrusted filter value.
- Empty All results use the existing empty states and are not treated as an
  error.
- Language changes preserve `audience=all`.
- Long translated labels remain reachable without overlapping or shrinking
  Join Us below its usable width.

## Non-Goals

- Adding `all` as a persistent product audience.
- Changing seller product-editing or moderation fields.
- Adding a Unisex audience.
- Changing the garment-category taxonomy.
- Ranking or balancing All results by audience.
- Adding pagination, personalization, saved preferences, or buyer accounts.
- Redesigning the marketplace homepage or navigation.

## Dependencies

- Implemented ticket `0039a-product-audience-persistence-and-editing`.
- Implemented ticket `0039b-audience-aware-public-catalog-reads`.
- Implemented ticket `0039c-responsive-clothing-and-seller-navigation`.
- Implemented ticket `0041-public-join-network-page`.
- Existing `product_audience_memberships`, public catalog database functions,
  root search validation, marketplace query options, and `PublicShell`.

## Acceptance Criteria

- A visit to the marketplace without a supported audience resolves to All.
- The audience row renders All, Women, Men, Kids, and Join Us in the approved
  hierarchy on desktop and mobile.
- Clicking Home or the Bazoria logo opens the All marketplace while preserving
  language.
- All homepage, navigation, category, and seller reads combine the three
  stored audiences without duplicate products, sellers, or categories.
- Women, Men, and Kids retain their exact current filtering behavior.
- Products without audience memberships remain excluded.
- All is never persisted as a product audience or taxonomy category.
- Search validation, route loaders, public server operations, and query cache
  keys accept the normalized All value.
- All visible copy is localized in English, Polish, German, and Vietnamese.
- Navigation remains keyboard accessible, touch friendly, and horizontally
  safe at supported mobile widths.
- Existing public visibility and database permission boundaries remain intact.

## Validation Notes

- Extend public-audience unit tests for All and the new default behavior.
- Extend root and public-route contract tests for `audience=all` normalization,
  loader dependencies, and search preservation.
- Extend marketplace-navigation tests for order, selected state, audience
  changes, localization, and mobile-safe classes.
- Add PublicShell tests proving Home and logo reset the audience to All while
  preserving language.
- Add database tests covering All results for products with one membership,
  multiple memberships, no memberships, draft status, and unpublished sellers.
- Verify deduplication, result bounds, and deterministic ordering for homepage,
  navigation, category, and seller functions.
- Verify the marketplace root, category page, seller storefront, product page,
  and Join Us page at desktop and mobile sizes with All selected.
- Inspect the longest translated audience row, including Polish and
  Vietnamese, for safe scrolling and complete touch targets.
- Run focused tests during implementation, then the full Node.js 22 test,
  lint, and production-build commands.

## Implementation Notes

- Extended the public browser filter to `all | women | men | kids` and changed
  absent or unsupported values from the former Women fallback to All. The
  seller product-membership contract remains Women, Men, and Kids only.
- Added a shared marketplace-home search helper. The public-header Home link,
  Bazoria logo, and explicit public Go home actions now preserve language while
  resetting the browsing audience to All.
- Added localized All labels in English, Polish, German, and Vietnamese as the
  first audience control. Preserved the tinted audience band, Join Us
  placement, exact selected state, touch targets, and horizontally scrollable
  mobile behavior.
- Added migration
  `20260815151000_all_audiences_public_catalog_reads.sql` after the concurrent
  `15:00` migration and applied it to the local database. It updates all seven
  bounded public catalog functions to use membership existence checks for All,
  preventing duplicate products with multiple audience memberships while
  retaining exact filtering for Women, Men, and Kids.
- Added four migration-contract assertions and fourteen local database
  assertions covering normalization, permissions, exact audience behavior,
  multi-audience deduplication, deterministic ordering, category and seller
  reads, drafts, and hidden sellers.
- All 39 focused frontend and migration-contract tests passed. The focused
  database test passed all 14 assertions. Focused lint and database lint passed
  with no errors.
- Repository lint passed with the existing 13 Fast Refresh warnings and no
  errors. The Node.js 22 production build passed.
- Browser inspection passed at 1,440-pixel English desktop and 390-pixel
  Vietnamese mobile sizes. Runtime link inspection confirmed both header Home
  destinations resolve to `/?lang=EN&audience=all` from a Women-filtered page.
- The full frontend run passed 1,061 of 1,062 tests. Its sole failure is an
  unrelated concurrent seller-product-draft read expectation missing the new
  `moderation_editable` field.
- The full database run includes and passes the ticket-0042 test, but is
  currently blocked by the concurrent versioned image-publication migration:
  older functions and tests still reference the removed
  `product_draft_id` image-publication columns. Ticket 0042 does not change
  those functions or tests.
