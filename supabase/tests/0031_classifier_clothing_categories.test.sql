BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(1);

SELECT results_eq(
  $$
    SELECT slug
    FROM public.categories
    WHERE slug IN (
      't-shirts',
      'hoodies',
      'trousers',
      'jackets',
      'sportswear',
      'sweatshirts',
      'sweaters',
      'cardigans',
      'jeans',
      'shorts',
      'skirts',
      'leggings',
      'sweatpants',
      'dresses',
      'blazers',
      'coats',
      'vests',
      'tracksuit-sets'
    )
    ORDER BY slug
  $$,
  $$
    VALUES
      ('blazers'::text),
      ('cardigans'::text),
      ('coats'::text),
      ('dresses'::text),
      ('hoodies'::text),
      ('jackets'::text),
      ('jeans'::text),
      ('leggings'::text),
      ('shorts'::text),
      ('skirts'::text),
      ('sportswear'::text),
      ('sweaters'::text),
      ('sweatpants'::text),
      ('sweatshirts'::text),
      ('t-shirts'::text),
      ('tracksuit-sets'::text),
      ('trousers'::text),
      ('vests'::text)
  $$,
  'website contains every selectable classifier clothing category'
);

SELECT * FROM finish();

ROLLBACK;
