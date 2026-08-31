BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(9);
SELECT pg_temp.disable_legacy_product_publication_guard();

SELECT results_eq(
  $$
    SELECT result, normalized_title
    FROM public.validate_product_publication_title(E'  Cotton \n shirt  ')
  $$,
  $$
    VALUES ('valid'::text, 'Cotton shirt'::text)
  $$,
  'publication title validation normalizes whitespace'
);

SELECT is(
  (
    SELECT result
    FROM public.validate_product_publication_title('   ')
  ),
  'title_required',
  'a blank publication title is required'
);

SELECT is(
  (
    SELECT result
    FROM public.validate_product_publication_title(repeat('x', 51))
  ),
  'title_invalid',
  'an overlong publication title is invalid'
);

INSERT INTO public.sellers (id, slug, name, published, company_code)
VALUES (
  '29a00000-0000-0000-0000-000000000001',
  'qa-0029h-seller',
  'QA 0029h Seller',
  false,
  'Q61'
);

SELECT pg_temp.approve_fixture_seller('29a00000-0000-0000-0000-000000000001');

CREATE FUNCTION pg_temp.qa_product_code(p_product_id uuid)
RETURNS text
LANGUAGE sql
AS $$
  SELECT public.reserve_product_code(
    p_product_id,
    '29a00000-0000-0000-0000-000000000001',
    (SELECT id FROM public.categories WHERE slug = 't-shirts')
  );
$$;

CREATE TEMP TABLE direct_blank_result AS
SELECT *
FROM public.save_seller_product_with_description(
  NULL,
  '29a00000-0000-0000-0000-000000000001',
  true,
  '   ',
  false,
  NULL,
  (SELECT id FROM public.categories WHERE slug = 't-shirts'),
  NULL,
  NULL,
  NULL,
  'USD',
  'in_stock',
  true,
  NULL,
  false,
  'published'
);

SELECT is(
  (SELECT result FROM direct_blank_result),
  'title_required',
  'a new direct product returns title-required before its missing cover'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.products
    WHERE seller_id = '29a00000-0000-0000-0000-000000000001'
  ),
  0,
  'a rejected new direct publication creates no product'
);

CREATE TEMP TABLE direct_invalid_result AS
SELECT *
FROM public.save_seller_product_with_description(
  NULL,
  '29a00000-0000-0000-0000-000000000001',
  true,
  repeat('x', 51),
  false,
  NULL,
  (SELECT id FROM public.categories WHERE slug = 't-shirts'),
  NULL,
  NULL,
  NULL,
  'USD',
  'in_stock',
  true,
  NULL,
  false,
  'published'
);

SELECT is(
  (SELECT result FROM direct_invalid_result),
  'title_invalid',
  'a new direct product returns title-invalid before its missing cover'
);

INSERT INTO public.products (
  id,
  seller_id,
  category_id,
  product_code,
  title,
  title_source,
  status,
  cover_image_url
)
VALUES (
  '29a00000-0000-0000-0000-000000000012',
  '29a00000-0000-0000-0000-000000000001',
  (SELECT id FROM public.categories WHERE slug = 't-shirts'),
  pg_temp.qa_product_code('29a00000-0000-0000-0000-000000000012'),
  '',
  NULL,
  'draft',
  NULL
);

INSERT INTO public.direct_product_legacy_cover_allowances (
  product_draft_id,
  recorded_cover_image_url
)
VALUES (
  '29a00000-0000-0000-0000-000000000012',
  'https://images.example/qa-0029h.jpg'
);

UPDATE public.products
SET cover_image_url = 'https://images.example/qa-0029h.jpg'
WHERE id = '29a00000-0000-0000-0000-000000000012';

CREATE TEMP TABLE existing_direct_blank_result AS
SELECT *
FROM public.save_seller_product_with_description(
  '29a00000-0000-0000-0000-000000000012',
  '29a00000-0000-0000-0000-000000000001',
  false,
  NULL,
  false,
  NULL,
  (SELECT id FROM public.categories WHERE slug = 't-shirts'),
  NULL,
  NULL,
  NULL,
  'USD',
  'in_stock',
  false,
  NULL,
  false,
  'published'
);

SELECT is(
  (SELECT result FROM existing_direct_blank_result),
  'title_required',
  'an existing direct draft validates its persisted title'
);

SELECT is(
  (
    SELECT status
    FROM public.products
    WHERE id = '29a00000-0000-0000-0000-000000000012'
  ),
  'draft'::public.product_status,
  'a rejected existing direct publication leaves the product as a draft'
);

SELECT is(
  has_function_privilege(
    'authenticated',
    'public.validate_product_publication_title(text)',
    'EXECUTE'
  ),
  false,
  'browser-authenticated callers cannot execute publication title validation'
);

SELECT * FROM finish();
ROLLBACK;
