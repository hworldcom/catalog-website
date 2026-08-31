BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(30);
SELECT pg_temp.disable_legacy_product_publication_guard();

SELECT has_table(
  'public',
  'product_code_allocations',
  'complete product-code reservations have a dedicated private table'
);

SELECT col_is_null(
  'public',
  'products',
  'product_code',
  'draft products may defer product-code allocation until publication'
);

SELECT col_is_null(
  'public',
  'products',
  'category_id',
  'draft products may omit a supported category'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.product_code_allocations', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.product_code_allocations', 'SELECT')
    AND NOT has_table_privilege('service_role', 'public.product_code_allocations', 'SELECT'),
  'the allocation registry has no browser or service-role table access'
);

SELECT ok(
  NOT has_function_privilege(
    'service_role',
    'public.reserve_product_code(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'the service role cannot invoke the internal allocator directly'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.create_seller_product_with_description(uuid,boolean,text,boolean,text,uuid,integer,text,numeric,text,public.stock_status,boolean,text,boolean,public.product_status)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.create_seller_product_with_description(uuid,boolean,text,boolean,text,uuid,integer,text,numeric,text,public.stock_status,boolean,text,boolean,public.product_status)',
      'EXECUTE'
    ),
  'only the service role can invoke protected direct product creation'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.products', 'INSERT'),
  'browser-authenticated callers cannot insert products directly'
);

SELECT is(
  (SELECT count(*)::integer FROM public.categories),
  19,
  'only the Fashion root and its 18 supported children remain'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.categories AS child
    JOIN public.categories AS parent ON parent.id = child.parent_id
    WHERE parent.slug = 'fashion'
      AND parent.product_code_prefix = 'F'
      AND child.product_code_prefix ~ '^[A-Z0-9]{2,4}$'
  ),
  18,
  'all supported product categories are configured Fashion children'
);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES
  (
    '28b10000-0000-0000-0000-000000000001',
    'qa-0028b1-one',
    'QA 0028b1 One',
    'Q91'
  ),
  (
    '28b10000-0000-0000-0000-000000000002',
    'qa-0028b1-two',
    'QA 0028b1 Two',
    'Q92'
  );

SELECT pg_temp.approve_fixture_seller('28b10000-0000-0000-0000-000000000001');
SELECT pg_temp.approve_fixture_seller('28b10000-0000-0000-0000-000000000002');

CREATE TEMP TABLE direct_creation AS
SELECT *
FROM public.create_seller_product_with_description(
  '28b10000-0000-0000-0000-000000000001',
  true,
  'QA cotton shirt',
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

INSERT INTO public.direct_product_legacy_cover_allowances (
  product_draft_id,
  recorded_cover_image_url
)
VALUES (
  (SELECT product_draft_id FROM direct_creation),
  'https://public.test/qa-0028b1-cover.jpg'
);

CREATE TEMP TABLE direct_publication AS
SELECT *
FROM public.save_seller_product_with_description(
  (SELECT product_draft_id FROM direct_creation),
  '28b10000-0000-0000-0000-000000000001',
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
  'https://public.test/qa-0028b1-cover.jpg',
  false,
  'published'
);

UPDATE direct_creation
SET product_code = (
  SELECT product.product_code
  FROM public.products AS product
  WHERE product.id = (SELECT product_draft_id FROM direct_creation)
);

SELECT is(
  (SELECT result FROM direct_creation),
  'created',
  'protected direct creation creates the product'
);

SELECT matches(
  (SELECT product_code FROM direct_creation),
  '^Q91-F-TSH-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$',
  'direct creation returns a complete product code'
);

SELECT is(
  (
    SELECT product.product_code
    FROM public.products AS product
    WHERE product.id = (SELECT product_draft_id FROM direct_creation)
  ),
  (SELECT product_code FROM direct_creation),
  'the returned code is stored on the product'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_code_allocations AS allocation
    WHERE allocation.product_id = (SELECT product_draft_id FROM direct_creation)
      AND allocation.product_code = (SELECT product_code FROM direct_creation)
      AND allocation.seller_id = '28b10000-0000-0000-0000-000000000001'
  ),
  1,
  'the complete code has one matching private reservation'
);

SELECT results_eq(
  $$
    SELECT
      company_code_snapshot,
      catalog_category_code_snapshot,
      product_category_code_snapshot
    FROM public.product_code_allocations
    WHERE product_id = (SELECT product_draft_id FROM direct_creation)
  $$,
  $$
    VALUES ('Q91'::text, 'F'::text, 'TSH'::text)
  $$,
  'the allocation retains immutable component snapshots'
);

SELECT ok(
  (
    SELECT company_code_locked_at IS NOT NULL
    FROM public.sellers
    WHERE id = '28b10000-0000-0000-0000-000000000001'
  ),
  'the first allocation locks the seller company code'
);

SELECT throws_ok(
  pg_catalog.format(
    'UPDATE public.products SET product_code = %L WHERE id = %L',
    'Q91-F-TSH-ABCDEFGH',
    (SELECT product_draft_id FROM direct_creation)
  ),
  '23514',
  'product_code_immutable',
  'a stored product code is immutable'
);

SELECT is(
  (
    SELECT result
    FROM public.create_seller_product_with_description(
      '28b10000-0000-0000-0000-000000000001',
      true,
      'Missing category',
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
    )
  ),
  'created',
  'direct draft creation permits a missing category without allocating a code'
);

SELECT is(
  (
    SELECT result
    FROM public.create_seller_product_with_description(
      '28b10000-0000-0000-0000-000000000001',
      true,
      'Root category',
      false,
      NULL,
      (SELECT id FROM public.categories WHERE slug = 'fashion'),
      NULL,
      NULL,
      NULL,
      'EUR',
      'in_stock',
      false,
      NULL,
      false,
      'draft'
    )
  ),
  'product_category_not_supported',
  'the Fashion root cannot be selected as a product category'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.create_seller_product_with_description(
      '28b10000-0000-0000-0000-000000000001',
      true,
      'Published without a cover',
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
      'published'
    )
  $$,
  '23514',
  'product_publication_not_allowed',
  'allocator-aware creation preserves the direct-publication cover requirement'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.products
    WHERE title = 'Published without a cover'
  ),
  0,
  'failed direct publication leaves no ProductDraft or allocation behind'
);

SELECT throws_ok(
  pg_catalog.format(
    'UPDATE public.products SET category_id = %L WHERE id = %L',
    (SELECT id FROM public.categories WHERE slug = 'fashion'),
    (SELECT product_draft_id FROM direct_creation)
  ),
  '23514',
  'product_category_not_supported',
  'later category changes remain inside the supported Fashion children'
);

SELECT throws_ok(
  $$
    SET LOCAL ROLE service_role;
    SELECT public.reserve_product_code(
      '28b10000-0000-0000-0000-000000000099',
      '28b10000-0000-0000-0000-000000000001',
      (SELECT id FROM public.categories WHERE slug = 't-shirts')
    );
  $$,
  '42501',
  'permission denied for function reserve_product_code',
  'the service role cannot bypass protected creation'
);
RESET ROLE;

INSERT INTO public.classifier_import_runs (
  id,
  classifier_organization_id,
  classifier_batch_id,
  seller_id,
  status,
  attempt_count,
  attempt_token,
  claim_started_at,
  last_heartbeat_at
)
VALUES
  (
    '28b10000-0000-0000-0000-000000000101',
    '28b10000-0000-0000-0000-000000000111',
    '28b10000-0000-0000-0000-000000000121',
    '28b10000-0000-0000-0000-000000000001',
    'running',
    1,
    '28b10000-0000-0000-0000-000000000131',
    now(),
    now()
  ),
  (
    '28b10000-0000-0000-0000-000000000102',
    '28b10000-0000-0000-0000-000000000111',
    '28b10000-0000-0000-0000-000000000122',
    '28b10000-0000-0000-0000-000000000002',
    'running',
    1,
    '28b10000-0000-0000-0000-000000000132',
    now(),
    now()
  );

CREATE TEMP TABLE first_classifier_preparation AS
SELECT *
FROM public.prepare_classifier_import_group_at_position(
  '28b10000-0000-0000-0000-000000000101',
  '28b10000-0000-0000-0000-000000000131',
  '28b10000-0000-0000-0000-000000000141',
  'trousers',
  '28b10000-0000-0000-0000-000000000151',
  0
);

SELECT is(
  (SELECT result FROM first_classifier_preparation),
  'prepared',
  'classifier preparation creates a ProductDraft for later publication allocation'
);

SELECT is(
  (
    SELECT product_code
    FROM public.products
    WHERE id = (SELECT product_draft_id FROM first_classifier_preparation)
  ),
  NULL::text,
  'classifier preparation defers product-code allocation until publication'
);

CREATE TEMP TABLE repeated_classifier_preparation AS
SELECT *
FROM public.prepare_classifier_import_group_at_position(
  '28b10000-0000-0000-0000-000000000101',
  '28b10000-0000-0000-0000-000000000131',
  '28b10000-0000-0000-0000-000000000141',
  't-shirts',
  '28b10000-0000-0000-0000-000000000151',
  0
);

SELECT is(
  (SELECT product_draft_id FROM repeated_classifier_preparation),
  (SELECT product_draft_id FROM first_classifier_preparation),
  'an idempotent classifier retry keeps the original ProductDraft'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_code_allocations
    WHERE product_id = (SELECT product_draft_id FROM first_classifier_preparation)
  ),
  0,
  'an idempotent classifier retry creates no premature allocation'
);

SELECT is(
  (
    SELECT result
    FROM public.prepare_classifier_import_group_at_position(
      '28b10000-0000-0000-0000-000000000102',
      '28b10000-0000-0000-0000-000000000132',
      '28b10000-0000-0000-0000-000000000141',
      'trousers',
      '28b10000-0000-0000-0000-000000000152',
      0
    )
  ),
  'product_draft_source_conflict',
  'the same immutable classifier source cannot cross sellers'
);

SELECT results_eq(
  $$
    SELECT error_code, retryable
    FROM public.classifier_import_group_outcomes
    WHERE classifier_import_run_id = '28b10000-0000-0000-0000-000000000102'
      AND classifier_group_id = '28b10000-0000-0000-0000-000000000141'
  $$,
  $$
    VALUES ('product_draft_source_conflict'::text, false)
  $$,
  'classifier preparation owns durable non-retryable source-conflict failure state'
);

SELECT is(
  (
    SELECT result
    FROM public.prepare_classifier_import_group_at_position(
      '28b10000-0000-0000-0000-000000000101',
      '28b10000-0000-0000-0000-000000000131',
      '28b10000-0000-0000-0000-000000000142',
      'not-mapped',
      '28b10000-0000-0000-0000-000000000153',
      1
    )
  ),
  'prepared',
  'classifier preparation turns an unmapped category into review work'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.products
    WHERE classifier_organization_id = '28b10000-0000-0000-0000-000000000111'
      AND classifier_group_id = '28b10000-0000-0000-0000-000000000142'
  ),
  1,
  'an unmapped category creates one uncategorized ProductDraft'
);

SELECT * FROM finish();
ROLLBACK;
