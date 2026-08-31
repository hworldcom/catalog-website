BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(5);

SELECT results_eq(
  $$
    SELECT
      category.slug,
      category.product_code_prefix,
      parent.slug AS parent_slug
    FROM public.categories AS category
    LEFT JOIN public.categories AS parent ON parent.id = category.parent_id
    ORDER BY category.slug
  $$,
  $$
    VALUES
      ('blazers'::text, 'BLZ'::text, 'fashion'::text),
      ('cardigans', 'CRD', 'fashion'),
      ('coats', 'COA', 'fashion'),
      ('dresses', 'DRS', 'fashion'),
      ('fashion', 'F', NULL),
      ('hoodies', 'HOD', 'fashion'),
      ('jackets', 'JKT', 'fashion'),
      ('jeans', 'JNS', 'fashion'),
      ('leggings', 'LEG', 'fashion'),
      ('shorts', 'SHT', 'fashion'),
      ('skirts', 'SKT', 'fashion'),
      ('sportswear', 'SPW', 'fashion'),
      ('sweaters', 'SWE', 'fashion'),
      ('sweatpants', 'SWP', 'fashion'),
      ('sweatshirts', 'SWS', 'fashion'),
      ('t-shirts', 'TSH', 'fashion'),
      ('tracksuit-sets', 'TSS', 'fashion'),
      ('trousers', 'TRO', 'fashion'),
      ('vests', 'VST', 'fashion')
  $$,
  'the clean schema contains the exact coded fashion category hierarchy'
);

SELECT is(
  public.normalize_product_audience_set(ARRAY['kids', 'women', 'men', 'women']),
  ARRAY['women', 'men', 'kids']::text[],
  'the exact supported product audiences normalize in canonical order'
);

SELECT throws_ok(
  $$ SELECT public.normalize_product_audience_set(ARRAY['unisex']) $$,
  '22023',
  'product_audience_invalid',
  'an additional product audience is rejected'
);

SELECT is(
  (SELECT count(*)::integer FROM public.sellers),
  0,
  'a clean migration contains no synthetic sellers'
);

SELECT is(
  (SELECT count(*)::integer FROM public.products),
  0,
  'a clean migration contains no synthetic products'
);

SELECT * FROM finish();
ROLLBACK;
