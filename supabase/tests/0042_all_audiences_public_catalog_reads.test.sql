BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(14);

SELECT is(
  public.normalize_public_catalog_audience(' ALL '),
  'all',
  'the database accepts the All public filter'
);

SELECT is(
  public.normalize_public_catalog_audience('unsupported'),
  'all',
  'unsupported database input falls back to All'
);

SELECT ok(
  has_function_privilege(
    'anon',
    'public.list_public_trending_products(text,integer)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'anon',
      'public.normalize_public_catalog_audience(text)',
      'EXECUTE'
    ),
  'browser roles can use bounded reads without calling the private normalizer'
);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES
  (
    '42000000-0000-0000-0000-000000000001',
    'qa-0042-visible',
    'QA 0042 Visible',
    'Q42'
  ),
  (
    '42000000-0000-0000-0000-000000000002',
    'qa-0042-hidden',
    'QA 0042 Hidden',
    'R42'
  );

SELECT pg_temp.approve_fixture_seller(
  '42000000-0000-0000-0000-000000000001',
  true
);
SELECT pg_temp.approve_fixture_seller(
  '42000000-0000-0000-0000-000000000002',
  false
);

CREATE FUNCTION pg_temp.create_0042_product(
  p_product_id uuid,
  p_seller_id uuid,
  p_title text,
  p_audiences text[],
  p_created_at timestamptz,
  p_publish boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  selected_category_id uuid;
BEGIN
  SELECT category.id
  INTO selected_category_id
  FROM public.categories AS category
  WHERE category.slug = 't-shirts';

  INSERT INTO public.products (
    id,
    seller_id,
    category_id,
    product_code,
    title,
    title_source,
    status,
    trending,
    created_at
  )
  VALUES (
    p_product_id,
    p_seller_id,
    selected_category_id,
    public.reserve_product_code(p_product_id, p_seller_id, selected_category_id),
    p_title,
    'human',
    'draft',
    true,
    p_created_at
  );

  DELETE FROM public.product_audience_memberships AS membership
  WHERE membership.product_id = p_product_id;

  INSERT INTO public.product_audience_memberships (product_id, audience)
  SELECT p_product_id, requested.audience
  FROM unnest(p_audiences) AS requested(audience);

  IF p_publish THEN
    UPDATE public.products AS product
    SET status = 'published'
    WHERE product.id = p_product_id;
  END IF;
END;
$$;

-- These fixtures exercise catalog reads, not the independently versioned image
-- publication workflow. The surrounding transaction restores the trigger.
ALTER TABLE public.products DISABLE TRIGGER trg_products_10_image_publication;

SELECT pg_temp.create_0042_product(
  '42000000-0000-0000-0000-000000000101',
  '42000000-0000-0000-0000-000000000001',
  'Women product',
  ARRAY['women'],
  '2026-01-01 00:01:00+00'
);
SELECT pg_temp.create_0042_product(
  '42000000-0000-0000-0000-000000000102',
  '42000000-0000-0000-0000-000000000001',
  'Men product',
  ARRAY['men'],
  '2026-01-01 00:02:00+00'
);
SELECT pg_temp.create_0042_product(
  '42000000-0000-0000-0000-000000000103',
  '42000000-0000-0000-0000-000000000001',
  'Women and men product',
  ARRAY['women', 'men'],
  '2026-01-01 00:03:00+00'
);
SELECT pg_temp.create_0042_product(
  '42000000-0000-0000-0000-000000000104',
  '42000000-0000-0000-0000-000000000001',
  'Kids product',
  ARRAY['kids'],
  '2026-01-01 00:04:00+00'
);
SELECT pg_temp.create_0042_product(
  '42000000-0000-0000-0000-000000000105',
  '42000000-0000-0000-0000-000000000001',
  'Draft product',
  ARRAY['women'],
  '2026-01-01 00:05:00+00',
  false
);
SELECT pg_temp.create_0042_product(
  '42000000-0000-0000-0000-000000000201',
  '42000000-0000-0000-0000-000000000002',
  'Hidden seller product',
  ARRAY['women'],
  '2026-01-01 00:06:00+00'
);

SET LOCAL ROLE anon;

SELECT results_eq(
  $$
    SELECT id
    FROM public.list_public_trending_products('all', 8)
    WHERE id::text LIKE '42000000-0000-0000-0000-%'
  $$,
  $$
    VALUES
      ('42000000-0000-0000-0000-000000000104'::uuid),
      ('42000000-0000-0000-0000-000000000103'::uuid),
      ('42000000-0000-0000-0000-000000000102'::uuid),
      ('42000000-0000-0000-0000-000000000101'::uuid)
  $$,
  'All returns every eligible product once in deterministic order'
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.list_public_trending_products('women', 8)
    WHERE id::text LIKE '42000000-0000-0000-0000-%'
  $$,
  $$
    VALUES
      ('42000000-0000-0000-0000-000000000103'::uuid),
      ('42000000-0000-0000-0000-000000000101'::uuid)
  $$,
  'Women keeps exact audience filtering'
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.list_public_trending_products('men', 8)
    WHERE id::text LIKE '42000000-0000-0000-0000-%'
  $$,
  $$
    VALUES
      ('42000000-0000-0000-0000-000000000103'::uuid),
      ('42000000-0000-0000-0000-000000000102'::uuid)
  $$,
  'Men keeps exact audience filtering'
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.list_public_trending_products('kids', 8)
    WHERE id::text LIKE '42000000-0000-0000-0000-%'
  $$,
  $$ VALUES ('42000000-0000-0000-0000-000000000104'::uuid) $$,
  'Kids keeps exact audience filtering'
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.list_public_trending_products('unsupported', 8)
    WHERE id::text LIKE '42000000-0000-0000-0000-%'
  $$,
  $$
    VALUES
      ('42000000-0000-0000-0000-000000000104'::uuid),
      ('42000000-0000-0000-0000-000000000103'::uuid),
      ('42000000-0000-0000-0000-000000000102'::uuid),
      ('42000000-0000-0000-0000-000000000101'::uuid)
  $$,
  'unsupported bounded reads fall back to All'
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.list_public_category_products('t-shirts', 'all', 48)
    WHERE id::text LIKE '42000000-0000-0000-0000-%'
  $$,
  $$
    VALUES
      ('42000000-0000-0000-0000-000000000104'::uuid),
      ('42000000-0000-0000-0000-000000000103'::uuid),
      ('42000000-0000-0000-0000-000000000102'::uuid),
      ('42000000-0000-0000-0000-000000000101'::uuid)
  $$,
  'All category products are deduplicated and visibility filtered'
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.list_public_seller_products('qa-0042-visible', 'all', 100)
  $$,
  $$
    VALUES
      ('42000000-0000-0000-0000-000000000104'::uuid),
      ('42000000-0000-0000-0000-000000000103'::uuid),
      ('42000000-0000-0000-0000-000000000102'::uuid),
      ('42000000-0000-0000-0000-000000000101'::uuid)
  $$,
  'All seller products are deduplicated and exclude drafts'
);

SELECT results_eq(
  $$
    SELECT slug
    FROM public.list_public_clothing_categories('all', 50)
    WHERE slug = 't-shirts'
  $$,
  $$ VALUES ('t-shirts'::text) $$,
  'All Clothing includes each eligible category once'
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.list_public_audience_sellers('all', 100)
    WHERE id::text LIKE '42000000-0000-0000-0000-%'
  $$,
  $$ VALUES ('42000000-0000-0000-0000-000000000001'::uuid) $$,
  'All Sellers includes the visible seller once and excludes the hidden seller'
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.list_public_featured_sellers('all', 6)
    WHERE id::text LIKE '42000000-0000-0000-0000-%'
  $$,
  $$ VALUES ('42000000-0000-0000-0000-000000000001'::uuid) $$,
  'All featured sellers preserve public seller visibility'
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.list_public_category_sellers('t-shirts', 'all', 12)
    WHERE id::text LIKE '42000000-0000-0000-0000-%'
  $$,
  $$ VALUES ('42000000-0000-0000-0000-000000000001'::uuid) $$,
  'All category sellers preserve public seller visibility'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
