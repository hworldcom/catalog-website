# Ticket 0039b: Audience-Aware Public Catalog Reads

## Status

Implemented.

## Ownership

- Repository: `catalog-website`
- Migrated from: `catalog-classifier/tickets/0039b-audience-aware-public-catalog-reads.md`
- Migrated on: 2026-08-15
- Record type: completed implementation ticket

## Objective

Provide bounded public read models for the selected audience's Clothing menu,
category pages, seller menu, and seller storefront without exposing drafts or
unpublished sellers.

## Audience Search Contract

Add a normalized root search parameter:

```text
audience=women | men | kids
```

- Default absent or unsupported values to `women` before calling public server
  operations.
- Preserve `audience` alongside `lang` during public navigation.
- Include normalized audience in every affected query-cache key.
- Filter products by an exact matching row in
  `product_audience_memberships`. A product assigned to Women and Men therefore
  appears in both without any special fallback rule.
- Products with no audience memberships are excluded from audience-filtered
  discovery.

## Clothing Read Model

Use the existing website `fashion` root internally while presenting it publicly
as Clothing. Return only configured garment leaf categories that have at least
one published product from a published seller for the selected audience.

Each item returns only the public fields required by navigation:

```text
id
slug
name
sortOrder
```

Return at most 50 categories ordered by `sort_order ASC, id ASC`. A configured
garment leaf is a category whose parent is the `fashion` root and whose product-
code prefix is present. The canonical database `name` remains the fallback
label. Bazoria Web uses one shared localized display-name mapping keyed by slug
for every supported interface language; category pages and navigation must use
the same mapping and fallback.

Category pages accept the normalized audience and return at most 48 matching
published products ordered by `created_at DESC, id DESC`. The Clothing root
page includes products from all supported garment leaf categories; a leaf page
includes only that leaf. Pagination beyond the first 48 products is deferred
and must not change this deterministic first-page contract.

## Seller Read Model

Return at most 100 published sellers that have at least one published product
matching the selected audience. Each item returns:

```text
id
slug
name
logoUrl
```

Sort sellers by case-normalized `name ASC, id ASC`. Do not return email, owner
identifiers, private import state, or unpublished inventory. A seller link
preserves the audience so the storefront initially filters to applicable
products. The Sellers panel is scrollable when needed. A larger searchable
seller directory is deferred; the 100-seller bound is an explicit prototype
limit rather than silent pagination.

The seller storefront returns at most 100 matching products ordered by
`created_at DESC, id DESC`. It does not fall back to products for another
audience when the selected audience has no matches.

Seller eligibility is derived exclusively from matching published products.
Do not add manually maintained seller audience or garment-category membership
tables.

After ticket `0040a`, "published seller" means the server-maintained effective
visibility projection: an approved seller snapshot exists and
`storefront_enabled = true`. Public operations must continue to enforce this at
the database boundary, not only in website filters.

## Error Contract

- Empty category and seller results are successful empty arrays.
- Invalid browser input is normalized before database operations.
- Database failures use the existing public-page error boundary and do not
  silently reuse results cached under another audience.

## Acceptance Criteria

- Each audience returns products with an exact matching membership.
- A product assigned to Women and Men appears once in each result and is not
  duplicated within one result.
- Products with no memberships are absent from audience-filtered discovery.
- Clothing categories and sellers have no dead links for the selected audience.
- Draft products and unpublished sellers never affect or appear in results.
- Seller inclusion changes automatically when matching products are published,
  archived, or have their memberships changed.
- Changing audience changes the server request and cache key.
- Language and audience search parameters survive category, seller, and product
  navigation.

## Dependencies

- `0039a-product-audience-persistence-and-editing`.
- `0040a-seller-approval-foundation` must preserve or replace the effective
  seller visibility projection used by these public reads before moderated
  publication is released.
- Existing public category, product, and seller routes.

## Validation Notes

- Add database/read tests for exact membership matching, multi-audience
  products, no-membership products, and publication states.
- Add query tests proving audience is part of cache keys.
- Add route tests for normalization and search-parameter preservation.
- Add limit, deterministic-ordering, localized-label fallback, and effective-
  seller-visibility tests.

## Implementation Notes

- Added bounded public database functions for Clothing categories, navigation
  sellers, category products and suppliers, seller storefront products,
  homepage trending products, and homepage featured sellers.
- Kept `product_audience_memberships` inaccessible to browser roles. The public
  functions use exact audience membership and explicitly recheck published
  product and seller state before returning narrow public fields.
- Added `audience=women|men|kids` normalization with Women as the fallback,
  preserved it with `lang`, and included it in homepage, navigation, category,
  seller, and product query keys.
- Added the shared localized Fashion and garment-leaf label map. Category,
  seller, homepage, and product-detail surfaces use the same map with the
  canonical database name as fallback.
- Category supplier cards are now derived from matching visible products rather
  than the seller's legacy `primary_category_id` declaration.
- Applied the migration to a clean local database and exercised the functions
  as the anonymous browser role. Exact matching, multi-audience inclusion,
  draft and unpublished-seller exclusion, no-membership exclusion, root and
  leaf category behavior, deterministic ordering, and limits passed.
- Full website validation passed: 155 test files and 963 tests, lint with only
  the 13 existing Fast Refresh warnings, the production build, and Supabase
  database lint with only pre-existing warnings in older functions.
