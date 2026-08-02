BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(15);

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
  'https://images.example/qa-0029h.jpg'
);

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

INSERT INTO public.products (
  id,
  seller_id,
  category_id,
  product_code,
  title,
  title_source,
  status
)
VALUES (
  '29a00000-0000-0000-0000-000000000011',
  '29a00000-0000-0000-0000-000000000001',
  (SELECT id FROM public.categories WHERE slug = 't-shirts'),
  pg_temp.qa_product_code('29a00000-0000-0000-0000-000000000011'),
  '',
  NULL,
  'draft'
);

INSERT INTO public.product_draft_source_memberships (
  product_draft_id,
  classifier_organization_id,
  classifier_batch_id,
  classifier_group_id,
  classifier_image_id,
  source_position,
  is_duplicate,
  duplicate_of_classifier_image_id,
  promotion_required
)
VALUES (
  '29a00000-0000-0000-0000-000000000011',
  '29a00000-0000-0000-0000-000000000021',
  '29a00000-0000-0000-0000-000000000022',
  '29a00000-0000-0000-0000-000000000023',
  '29a00000-0000-0000-0000-000000000024',
  0,
  false,
  NULL,
  true
);

INSERT INTO public.product_draft_images (
  id,
  product_draft_id,
  classifier_image_id,
  source_position,
  status,
  storage_bucket,
  destination_key,
  content_type,
  size_bytes
)
VALUES (
  '29a00000-0000-0000-0000-000000000031',
  '29a00000-0000-0000-0000-000000000011',
  '29a00000-0000-0000-0000-000000000024',
  0,
  'available',
  'product-draft-images',
  'qa/0029h/image.jpg',
  'image/jpeg',
  100
);

UPDATE public.products
SET cover_image_id = '29a00000-0000-0000-0000-000000000031'
WHERE id = '29a00000-0000-0000-0000-000000000011';

CREATE TEMP TABLE imported_blank_result AS
SELECT *
FROM public.authorize_seller_product_publication(
  '29a00000-0000-0000-0000-000000000011',
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
  false
);

SELECT is(
  (SELECT result FROM imported_blank_result),
  'title_required',
  'imported authorization rejects a blank persisted title'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_image_publication_runs
    WHERE product_draft_id = '29a00000-0000-0000-0000-000000000011'
  ),
  0,
  'title-rejected imported authorization creates no run'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_image_publication_items
    WHERE product_draft_id = '29a00000-0000-0000-0000-000000000011'
  ),
  0,
  'title-rejected imported authorization creates no manifest items'
);

INSERT INTO public.product_image_publication_runs (
  product_draft_id,
  seller_id,
  status,
  error_code
)
VALUES (
  '29a00000-0000-0000-0000-000000000011',
  '29a00000-0000-0000-0000-000000000001',
  'failed',
  'product_publication_transfer_failed'
);

INSERT INTO public.product_image_publication_items (
  product_draft_id,
  product_draft_image_id,
  source_bucket,
  source_object_key,
  destination_key,
  source_position,
  publication_order,
  is_cover,
  expected_source_size_bytes,
  expected_content_type,
  status,
  error_code
)
VALUES (
  '29a00000-0000-0000-0000-000000000011',
  '29a00000-0000-0000-0000-000000000031',
  'product-draft-images',
  'qa/0029h/image.jpg',
  'published-products/29a00000-0000-0000-0000-000000000011/image.jpg',
  0,
  0,
  true,
  100,
  'image/jpeg',
  'failed',
  'product_publication_transfer_failed'
);

SELECT is(
  public.retry_product_image_publication(
    '29a00000-0000-0000-0000-000000000011',
    '29a00000-0000-0000-0000-000000000001'
  ),
  'title_required',
  'retry revalidates the persisted title'
);

SELECT is(
  (
    SELECT status
    FROM public.product_image_publication_runs
    WHERE product_draft_id = '29a00000-0000-0000-0000-000000000011'
  ),
  'failed',
  'a title-rejected retry leaves the run terminal'
);

SELECT is(
  (
    SELECT status
    FROM public.product_image_publication_items
    WHERE product_draft_id = '29a00000-0000-0000-0000-000000000011'
  ),
  'failed',
  'a title-rejected retry leaves its manifest item terminal'
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
