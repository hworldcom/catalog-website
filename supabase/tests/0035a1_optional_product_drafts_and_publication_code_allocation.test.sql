BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(30);

SELECT col_is_null(
  'public',
  'products',
  'category_id',
  'draft products may omit a category'
);

SELECT col_is_null(
  'public',
  'products',
  'product_code',
  'draft products may defer product-code allocation'
);

SELECT ok(
  NOT has_function_privilege(
    'service_role',
    'public.assign_product_code_for_publication(uuid,uuid)',
    'EXECUTE'
  ),
  'the service role cannot call the private publication allocator'
);

SELECT ok(
  NOT has_function_privilege(
    'service_role',
    'public.retry_product_image_publication(uuid,uuid)',
    'EXECUTE'
  ),
  'the service role cannot bypass the correlation-aware retry wrapper'
);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '35a10000-0000-0000-0000-000000000001',
  'qa-0035a1-seller',
  'QA 0035a1 Seller',
  'Q35'
);

SELECT pg_temp.approve_fixture_seller('35a10000-0000-0000-0000-000000000001');

CREATE TEMP TABLE incomplete_draft AS
SELECT *
FROM public.create_seller_product_with_description(
  '35a10000-0000-0000-0000-000000000001',
  false,
  NULL,
  false,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'EUR',
  'in_stock',
  false,
  NULL,
  false,
  'draft'
);

SELECT is(
  (SELECT result FROM incomplete_draft),
  'created',
  'a draft can be created without a title or category'
);

SELECT results_eq(
  $$
    SELECT title, title_source, product_status
    FROM incomplete_draft
  $$,
  $$
    VALUES (''::text, NULL::text, 'draft'::public.product_status)
  $$,
  'an omitted title uses the canonical blank draft representation'
);

SELECT results_eq(
  $$
    SELECT category_id, product_code
    FROM public.products
    WHERE id = (SELECT product_draft_id FROM incomplete_draft)
  $$,
  $$
    VALUES (NULL::uuid, NULL::text)
  $$,
  'the incomplete draft stores no category or placeholder code'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_code_allocations
    WHERE product_id = (SELECT product_draft_id FROM incomplete_draft)
  ),
  0,
  'incomplete draft creation creates no allocation'
);

CREATE TEMP TABLE categorized_draft AS
SELECT *
FROM public.create_seller_product_with_description(
  '35a10000-0000-0000-0000-000000000001',
  true,
  'QA cotton shirt',
  false,
  NULL,
  NULL,
  1,
  '1',
  10,
  'EUR',
  'in_stock',
  false,
  NULL,
  false,
  'draft'
);

INSERT INTO public.direct_product_legacy_cover_allowances (
  product_draft_id,
  recorded_cover_image_url
)
VALUES (
  (SELECT product_draft_id FROM categorized_draft),
  'https://public.test/qa-0035a1-cover.jpg'
);

SELECT is(
  (SELECT result FROM categorized_draft),
  'created',
  'a titled draft can be created before category selection'
);

SELECT is(
  (SELECT product_code FROM categorized_draft),
  NULL::text,
  'categorized draft creation returns a null product code'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_code_allocations
    WHERE product_id = (SELECT product_draft_id FROM categorized_draft)
  ),
  0,
  'titled draft creation still creates no allocation'
);

CREATE TEMP TABLE category_save AS
SELECT *
FROM public.save_seller_product_with_description(
  (SELECT product_draft_id FROM incomplete_draft),
  '35a10000-0000-0000-0000-000000000001',
  false,
  NULL,
  false,
  NULL,
  (SELECT id FROM public.categories WHERE slug = 't-shirts'),
  NULL,
  NULL,
  NULL,
  'EUR',
  'in_stock',
  false,
  NULL,
  false,
  'draft'
);

SELECT is(
  (SELECT result FROM category_save),
  'updated',
  'saving a category on an existing draft succeeds'
);

SELECT results_eq(
  $$
    SELECT category.slug, product.product_code
    FROM public.products AS product
    JOIN public.categories AS category ON category.id = product.category_id
    WHERE product.id = (SELECT product_draft_id FROM incomplete_draft)
  $$,
  $$
    VALUES ('t-shirts'::text, NULL::text)
  $$,
  'a category save does not allocate a product code'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_code_allocations
    WHERE product_id = (SELECT product_draft_id FROM incomplete_draft)
  ),
  0,
  'a draft category change creates no allocation row'
);

INSERT INTO public.direct_product_legacy_cover_allowances (
  product_draft_id,
  recorded_cover_image_url
)
VALUES (
  (SELECT product_draft_id FROM incomplete_draft),
  'https://public.test/qa-0035a1-incomplete.jpg'
);

SELECT is(
  (
    SELECT result
    FROM public.save_seller_product_with_description(
      (SELECT product_draft_id FROM incomplete_draft),
      '35a10000-0000-0000-0000-000000000001',
      false,
      NULL,
      false,
      NULL,
      (SELECT id FROM public.categories WHERE slug = 't-shirts'),
      NULL,
      NULL,
      NULL,
      'EUR',
      'in_stock',
      true,
      'https://public.test/qa-0035a1-incomplete.jpg',
      false,
      'published'
    )
  ),
  'title_required',
  'publication without a title fails before allocation'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_code_allocations
    WHERE product_id = (SELECT product_draft_id FROM incomplete_draft)
  ),
  0,
  'a title validation failure rolls back publication work'
);

SELECT is(
  (
    SELECT result
    FROM public.save_seller_product_with_description(
      (SELECT product_draft_id FROM categorized_draft),
      '35a10000-0000-0000-0000-000000000001',
      false,
      NULL,
      false,
      NULL,
      NULL,
      1,
      '1',
      10,
      'EUR',
      'in_stock',
      true,
      'https://public.test/qa-0035a1-cover.jpg',
      false,
      'published'
    )
  ),
  'product_publication_category_required',
  'publication without a category fails before allocation'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_code_allocations
    WHERE product_id = (SELECT product_draft_id FROM categorized_draft)
  ),
  0,
  'a category validation failure creates no allocation'
);

SELECT throws_ok(
  pg_catalog.format(
    'UPDATE public.products SET status = %L WHERE id = %L',
    'published',
    (SELECT product_draft_id FROM categorized_draft)
  ),
  '23514',
  'product_publication_category_required',
  'the product trigger rejects a categoryless published row'
);

CREATE TEMP TABLE ready_uncoded_draft AS
SELECT *
FROM public.create_seller_product_with_description(
  '35a10000-0000-0000-0000-000000000001',
  true,
  'QA ready uncoded product',
  false,
  NULL,
  (SELECT id FROM public.categories WHERE slug = 't-shirts'),
  1,
  '1',
  10,
  'EUR',
  'in_stock',
  false,
  NULL,
  false,
  'draft'
);

SELECT throws_ok(
  pg_catalog.format(
    'SET LOCAL ROLE service_role; UPDATE public.products SET status = %L WHERE id = %L',
    'published',
    (SELECT product_draft_id FROM ready_uncoded_draft)
  ),
  '23514',
  'product_code_allocation_failed',
  'a service-role table update cannot bypass publication-time allocation'
);
RESET ROLE;

CREATE TEMP TABLE published_draft AS
SELECT *
FROM public.save_seller_product_with_description(
  (SELECT product_draft_id FROM categorized_draft),
  '35a10000-0000-0000-0000-000000000001',
  false,
  NULL,
  false,
  NULL,
  (SELECT id FROM public.categories WHERE slug = 't-shirts'),
  1,
  '1',
  10,
  'EUR',
  'in_stock',
  true,
  'https://public.test/qa-0035a1-cover.jpg',
  false,
  'published'
);

SELECT is(
  (SELECT result FROM published_draft),
  'updated',
  'the first valid publication succeeds'
);

SELECT ok(
  (
    SELECT status = 'published'
      AND product_code ~ '^Q35-F-TSH-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'
    FROM public.products
    WHERE id = (SELECT product_draft_id FROM categorized_draft)
  ),
  'publication stores a valid immutable code'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_code_allocations AS allocation
    JOIN public.products AS product
      ON product.id = allocation.product_id
     AND product.seller_id = allocation.seller_id
     AND product.product_code = allocation.product_code
    WHERE product.id = (SELECT product_draft_id FROM categorized_draft)
  ),
  1,
  'publication creates exactly one matching allocation'
);

SELECT throws_ok(
  pg_catalog.format(
    'UPDATE public.products SET product_code = NULL WHERE id = %L',
    (SELECT product_draft_id FROM categorized_draft)
  ),
  '23514',
  'product_code_immutable',
  'an allocated code cannot be removed'
);

SELECT throws_ok(
  pg_catalog.format(
    'UPDATE public.products SET product_code = %L WHERE id = %L',
    'Q35-F-TSH-ABCDEFGH',
    (SELECT product_draft_id FROM categorized_draft)
  ),
  '23514',
  'product_code_immutable',
  'an allocated code cannot be changed'
);

SELECT throws_ok(
  pg_catalog.format(
    'UPDATE public.products SET product_code = %L WHERE id = %L',
    'Q35-F-TSH-ABCDEFGH',
    (SELECT product_draft_id FROM incomplete_draft)
  ),
  '23514',
  'product_code_immutable',
  'null-to-code assignment requires a matching private allocation'
);

SELECT is(
  (
    SELECT result
    FROM public.archive_seller_product(
      (SELECT product_draft_id FROM incomplete_draft),
      '35a10000-0000-0000-0000-000000000001'
    )
  ),
  'archived',
  'an incomplete draft may be archived'
);

SELECT is(
  (
    SELECT result
    FROM public.create_seller_product_with_description(
      '35a10000-0000-0000-0000-000000000001',
      false,
      NULL,
      false,
      NULL,
      (SELECT id FROM public.categories WHERE slug = 't-shirts'),
      NULL,
      NULL,
      NULL,
      'EUR',
      'in_stock',
      true,
      'https://public.test/qa-0035a1-immediate-title.jpg',
      false,
      'published'
    )
  ),
  'title_required',
  'immediate publication still requires a title'
);

SELECT is(
  (
    SELECT result
    FROM public.create_seller_product_with_description(
      '35a10000-0000-0000-0000-000000000001',
      true,
      'QA immediate product',
      false,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      'EUR',
      'in_stock',
      true,
      'https://public.test/qa-0035a1-immediate-category.jpg',
      false,
      'published'
    )
  ),
  'product_publication_category_required',
  'immediate publication still requires a category'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.products AS product
    WHERE product.status = 'published'
      AND (
        NULLIF(pg_catalog.btrim(product.title), '') IS NULL
        OR product.category_id IS NULL
        OR product.product_code IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.product_code_allocations AS allocation
          WHERE allocation.product_code = product.product_code
            AND allocation.product_id = product.id
            AND allocation.seller_id = product.seller_id
        )
      )
  ),
  0,
  'no published product can remain incomplete or mismatched'
);

SELECT * FROM finish();
ROLLBACK;
