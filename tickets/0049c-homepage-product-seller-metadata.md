# Ticket 0049c: Homepage Product Seller Metadata

## Status

Implemented on 2026-08-29. The homepage trending-product read now includes the
published seller name and slug while preserving its existing visibility,
audience, ordering, limit, security, and metadata contracts.

## Parent

Ticket 0049.

## Dependencies

- The existing audience-aware public catalog read contract implemented by
  `20260815151000_all_audiences_public_catalog_reads.sql`.
- No dependency on ticket 0049d; this ticket prepares the data contract that
  0049d will consume.

## Goal

Expose the actual seller identity with each homepage trending product so the
editorial product card can display its supplier without additional client-side
queries.

## Scope

- Add non-null `seller_name` and `seller_slug` to the public trending-product
  read model.
- Preserve all current trending-product fields and ordering.
- Add a new migration named
  `20260829190000_homepage_product_seller_metadata.sql`. Do not edit either
  historical public-catalog migration.
- Replace `public.list_public_trending_products(text, integer)` in the new
  migration. PostgreSQL cannot change a table-returning function's result type
  with `CREATE OR REPLACE`, so the migration must drop the existing signature
  and recreate it inside one transaction.
- Preserve the existing result-column order and append `seller_name` followed
  by `seller_slug` after `created_at`.
- Select both values from the seller row already joined by the trusted read
  function. Do not perform a second seller query in browser or server code.
- Update the checked-in Supabase `Database` function return type and expose a
  `PublicTrendingProduct` alias from the RPC return contract for marketplace
  server consumers.
- Add migration, database contract, server-function, and query tests.

This is a database schema migration because a PostgreSQL function is a schema
object. It does not add or alter tables or columns, and it does not update,
delete, or backfill product or seller records.

## Result Contract

Keep the existing function arguments unchanged:

```text
list_public_trending_products(p_audience text, p_limit integer DEFAULT 8)
```

Keep the current result fields in their current order:

```text
id
title
cover_image_url
price
currency
moq
pack_size
stock
seller_id
created_at
```

Append:

```text
seller_name
seller_slug
```

Both added values are required because the function only returns products with
a matching published seller, and `sellers.name` and `sellers.slug` are non-null
database columns.

## Expected Behavior

- Return only published products belonging to published sellers.
- Preserve current `trending = true` filtering.
- Preserve All, Women, Men, and Kids audience filtering.
- Preserve the existing maximum limit, ordering, prices, currency, minimum order
  quantity, pack size, stock, images, and product identifiers.
- Return the seller name and public seller slug from the same trusted database
  read boundary.
- Preserve the current public visibility predicate exactly:
  `product.status = 'published'`, `product.trending`, and `seller.published`.
  Do not duplicate the protected seller-interface marketplace-visibility state
  machine inside this public read.
- Keep anonymous permissions no broader than the existing public catalog read.
- Avoid inferring seller names from the featured-seller response because that
  response may not contain every product seller.
- Preserve `STABLE`, `SECURITY DEFINER`, and `SET search_path = ''` on the
  recreated function.
- Revoke execution from `PUBLIC` before granting execution only to `anon`,
  `authenticated`, and `service_role`, matching the current function contract.

## Non-Goals

- Implementing ticket 0050 or changing Trending to New this week.
- Adding seller product counts.
- Adding favorites, views, sales, or popularity calculations.
- Redesigning product cards.
- Displaying or linking seller metadata in the homepage interface; ticket 0049d
  owns that presentation.
- Adding tables, columns, indexes, triggers, or stored-data backfills.
- Applying the migration to hosted User Acceptance Testing or production.

## Acceptance Criteria

- [x] Every returned trending product contains its published seller name and
      slug.
- [x] Existing result fields retain their names and positional order, with the
      two seller fields appended after `created_at`.
- [x] Unpublished products and products from unpublished sellers remain hidden.
- [x] Audience filtering and stable ordering remain unchanged.
- [x] Existing product metadata remains available.
- [x] The checked-in database type and exported marketplace product type match
      the committed migration contract.
- [x] Anonymous access is limited to the intended public function.
- [x] No product or seller records are mutated by the migration.

## Validation

- Add a focused static migration test that verifies the drop/recreate strategy,
  exact return shape, trusted seller join, visibility filters, ordering, limit
  validation, security mode, and grants.
- Add `supabase/tests/0049c_homepage_product_seller_metadata.test.sql` against an
  explicit isolated database. Verify seller identity, anonymous execution,
  hidden products and sellers, all four audiences, deterministic ordering, and
  the maximum limit. Do not run database tests against hosted User Acceptance
  Testing.
- Add a marketplace server-function test proving the two fields are returned
  unchanged from the RPC response without an additional seller request.
- Update the marketplace query test to prove the homepage query preserves the
  enriched trending-product result and audience-specific cache key.
- Apply the migration to an isolated local schema before regenerating the
  checked-in Supabase database types. Do not generate types from hosted User
  Acceptance Testing before that environment receives the migration.
- Run the relevant marketplace and migration tests.
- Run lint and production build.

## Implementation Notes

- Added `20260829190000_homepage_product_seller_metadata.sql`, which drops and
  recreates only `public.list_public_trending_products(text, integer)` in one
  transaction and appends `seller_name` and `seller_slug` to its result.
- Added the two fields to the checked-in Supabase function return type and
  exported `PublicTrendingProduct` from the marketplace server module.
- Kept the homepage server request at two existing RPC calls. Product seller
  metadata comes directly from the trending-products response; no per-product
  or follow-up seller request was added.
- Generated database types from the reset local schema into a temporary file
  and verified the two added fields. The generator would rewrite thousands of
  unrelated lines, so only the exact 0049c contract was applied to the
  checked-in type file.
- No hosted User Acceptance Testing data or production database was accessed.
  The linked UAT migration history was inspected read-only after implementation
  and confirmed 0049c is the only pending migration.

## Validation Results

- `supabase db reset --local`: passed with all migrations, including 0049c.
- Focused application tests: 3 files and 12 tests passed.
- Public-catalog and 0049c pgTAP tests: 2 files and 27 assertions passed.
- Full application suite: 217 files and 1,430 tests passed.
- `npm run lint:node22`: passed with 0 errors and 13 pre-existing Fast Refresh
  warnings.
- `npm run build:node22`: passed.
