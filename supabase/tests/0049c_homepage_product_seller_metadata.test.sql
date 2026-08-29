BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(13);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES
  (
    '49cc0000-0000-4000-8000-000000000001',
    'qa-0049c-visible',
    'QA 0049c Visible Supplier',
    'Q9C'
  ),
  (
    '49cc0000-0000-4000-8000-000000000002',
    'qa-0049c-hidden',
    'QA 0049c Hidden Supplier',
    'R9C'
  );

SELECT pg_temp.approve_fixture_seller(
  '49cc0000-0000-4000-8000-000000000001',
  true
);
SELECT pg_temp.approve_fixture_seller(
  '49cc0000-0000-4000-8000-000000000002',
  false
);

CREATE FUNCTION pg_temp.create_0049c_product(
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

SELECT pg_temp.create_0049c_product(
  '49cc0000-0000-4000-8000-000000000101',
  '49cc0000-0000-4000-8000-000000000001',
  'Women metadata product',
  ARRAY['women'],
  '2026-01-01 00:01:00+00'
);
SELECT pg_temp.create_0049c_product(
  '49cc0000-0000-4000-8000-000000000102',
  '49cc0000-0000-4000-8000-000000000001',
  'Men metadata product',
  ARRAY['men'],
  '2026-01-01 00:02:00+00'
);
SELECT pg_temp.create_0049c_product(
  '49cc0000-0000-4000-8000-000000000103',
  '49cc0000-0000-4000-8000-000000000001',
  'Women and men metadata product',
  ARRAY['women', 'men'],
  '2026-01-01 00:03:00+00'
);
SELECT pg_temp.create_0049c_product(
  '49cc0000-0000-4000-8000-000000000104',
  '49cc0000-0000-4000-8000-000000000001',
  'Kids metadata product',
  ARRAY['kids'],
  '2026-01-01 00:04:00+00'
);
SELECT pg_temp.create_0049c_product(
  '49cc0000-0000-4000-8000-000000000105',
  '49cc0000-0000-4000-8000-000000000001',
  'Draft metadata product',
  ARRAY['women'],
  '2026-01-01 00:05:00+00',
  false
);
SELECT pg_temp.create_0049c_product(
  '49cc0000-0000-4000-8000-000000000201',
  '49cc0000-0000-4000-8000-000000000002',
  'Hidden supplier metadata product',
  ARRAY['women'],
  '2026-01-01 00:06:00+00'
);

UPDATE public.products AS product
SET price = 12.34,
    currency = 'EUR',
    moq = 5,
    pack_size = '5 pieces',
    stock = 'in_stock'
WHERE product.id = '49cc0000-0000-4000-8000-000000000101';

SELECT ok(
  has_function_privilege(
    'anon',
    'public.list_public_trending_products(text,integer)',
    'EXECUTE'
  )
    AND has_function_privilege(
      'authenticated',
      'public.list_public_trending_products(text,integer)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.list_public_trending_products(text,integer)',
      'EXECUTE'
    ),
  'the intended application roles can execute the enriched public read'
);

SET LOCAL ROLE anon;

SELECT results_eq(
  $$
    SELECT seller_name, seller_slug
    FROM public.list_public_trending_products('women', 8)
    WHERE id = '49cc0000-0000-4000-8000-000000000101'
  $$,
  $$
    VALUES (
      'QA 0049c Visible Supplier'::text,
      'qa-0049c-visible'::text
    )
  $$,
  'each product carries its actual published seller identity'
);

SELECT results_eq(
  $$
    SELECT title, price, currency, moq, pack_size, stock::text, seller_id
    FROM public.list_public_trending_products('women', 8)
    WHERE id = '49cc0000-0000-4000-8000-000000000101'
  $$,
  $$
    VALUES (
      'Women metadata product'::text,
      12.34::numeric,
      'EUR'::text,
      5::integer,
      '5 pieces'::text,
      'in_stock'::text,
      '49cc0000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'existing trending-product metadata remains available'
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.list_public_trending_products('all', 8)
    WHERE id::text LIKE '49cc0000-0000-4000-8000-%'
  $$,
  $$
    VALUES
      ('49cc0000-0000-4000-8000-000000000104'::uuid),
      ('49cc0000-0000-4000-8000-000000000103'::uuid),
      ('49cc0000-0000-4000-8000-000000000102'::uuid),
      ('49cc0000-0000-4000-8000-000000000101'::uuid)
  $$,
  'All preserves deterministic ordering across eligible products'
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.list_public_trending_products('women', 8)
    WHERE id::text LIKE '49cc0000-0000-4000-8000-%'
  $$,
  $$
    VALUES
      ('49cc0000-0000-4000-8000-000000000103'::uuid),
      ('49cc0000-0000-4000-8000-000000000101'::uuid)
  $$,
  'Women preserves exact audience filtering'
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.list_public_trending_products('men', 8)
    WHERE id::text LIKE '49cc0000-0000-4000-8000-%'
  $$,
  $$
    VALUES
      ('49cc0000-0000-4000-8000-000000000103'::uuid),
      ('49cc0000-0000-4000-8000-000000000102'::uuid)
  $$,
  'Men preserves exact audience filtering'
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.list_public_trending_products('kids', 8)
    WHERE id::text LIKE '49cc0000-0000-4000-8000-%'
  $$,
  $$ VALUES ('49cc0000-0000-4000-8000-000000000104'::uuid) $$,
  'Kids preserves exact audience filtering'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.list_public_trending_products('all', 8)
    WHERE id IN (
      '49cc0000-0000-4000-8000-000000000105',
      '49cc0000-0000-4000-8000-000000000201'
    )
  ),
  0::bigint,
  'draft products and products from unpublished sellers remain hidden'
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.list_public_trending_products('all', 1)
    WHERE id::text LIKE '49cc0000-0000-4000-8000-%'
  $$,
  $$ VALUES ('49cc0000-0000-4000-8000-000000000104'::uuid) $$,
  'the caller limit is applied after stable ordering'
);

SELECT throws_ok(
  $$ SELECT * FROM public.list_public_trending_products('all', 9) $$,
  '22023',
  'public_catalog_read_invalid',
  'the existing maximum limit remains enforced'
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.list_public_trending_products('unsupported', 8)
    WHERE id::text LIKE '49cc0000-0000-4000-8000-%'
  $$,
  $$
    VALUES
      ('49cc0000-0000-4000-8000-000000000104'::uuid),
      ('49cc0000-0000-4000-8000-000000000103'::uuid),
      ('49cc0000-0000-4000-8000-000000000102'::uuid),
      ('49cc0000-0000-4000-8000-000000000101'::uuid)
  $$,
  'unsupported audiences retain the existing All fallback'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM public.products AS product
    WHERE product.id::text LIKE '49cc0000-0000-4000-8000-%'
  ),
  6::bigint,
  'reading the enriched function does not mutate product records'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.sellers AS seller
    WHERE seller.id::text LIKE '49cc0000-0000-4000-8000-%'
  ),
  2::bigint,
  'reading the enriched function does not mutate seller records'
);

SELECT * FROM finish();
ROLLBACK;
