BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(33);

SELECT has_function(
  'public',
  'archive_seller_product',
  ARRAY['uuid', 'uuid'],
  'product archival has one protected database operation'
);

SELECT ok(
  (
    SELECT procedure.prosecdef
      AND procedure.proconfig = ARRAY['search_path=""']::text[]
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'archive_seller_product'
      AND procedure.proargtypes = '2950 2950'::oidvector
  ),
  'the archive operation is security definer with an empty search path'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.archive_seller_product(uuid,uuid)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'anon',
      'public.archive_seller_product(uuid,uuid)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.archive_seller_product(uuid,uuid)',
      'EXECUTE'
    ),
  'only the service role can invoke product archival'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.products', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.products', 'DELETE'),
  'PUBLIC-derived and browser-role privileges cannot hard-delete products'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'Products: owner can delete own'
  ),
  0,
  'the seller hard-delete row-level-security policy is removed'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_trigger AS trigger
    JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'products'
      AND trigger.tgname = 'trg_products_00_archive_immutable'
      AND NOT trigger.tgisinternal
  ),
  1,
  'the archive-immutability trigger uses the required early-sorting name'
);

SELECT ok(
  (
    SELECT
      pg_catalog.strpos(procedure.prosrc, 'FROM public.products AS product')
        < pg_catalog.strpos(procedure.prosrc, 'FROM public.product_image_publication_runs AS run')
      AND pg_catalog.strpos(
        procedure.prosrc,
        'FROM public.product_image_publication_runs AS run'
      ) < pg_catalog.strpos(
        procedure.prosrc,
        'FROM public.product_image_publication_items AS item'
      )
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'archive_seller_product'
      AND procedure.proargtypes = '2950 2950'::oidvector
  ),
  'archival locks product, publication run, and publication items in worker order'
);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES
  (
    '28b20000-0000-0000-0000-000000000001',
    'qa-0028b2-one',
    'QA 0028b2 One',
    'Q21'
  ),
  (
    '28b20000-0000-0000-0000-000000000002',
    'qa-0028b2-two',
    'QA 0028b2 Two',
    'Q22'
  );

SELECT pg_temp.approve_fixture_seller('28b20000-0000-0000-0000-000000000001');
SELECT pg_temp.approve_fixture_seller('28b20000-0000-0000-0000-000000000002');

CREATE FUNCTION pg_temp.qa_create_product(
  p_product_id uuid,
  p_seller_id uuid,
  p_title text,
  p_status public.product_status DEFAULT 'draft'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  selected_category_id uuid;
  selected_product_code text;
BEGIN
  SELECT category.id
  INTO selected_category_id
  FROM public.categories AS category
  WHERE category.slug = 't-shirts';

  selected_product_code := public.reserve_product_code(
    p_product_id,
    p_seller_id,
    selected_category_id
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
    p_product_id,
    p_seller_id,
    selected_category_id,
    selected_product_code,
    p_title,
    CASE WHEN pg_catalog.btrim(p_title) = '' THEN NULL ELSE 'human' END,
    CASE WHEN p_status = 'published' THEN 'draft' ELSE p_status END,
    NULL
  );

  IF p_status = 'published' THEN
    INSERT INTO public.direct_product_legacy_cover_allowances (
      product_draft_id,
      recorded_cover_image_url
    )
    VALUES (
      p_product_id,
      'https://example.test/qa-0028b2-' || p_product_id::text || '.jpg'
    );

    UPDATE public.products
    SET
      status = 'published',
      cover_image_url = 'https://example.test/qa-0028b2-' || p_product_id::text || '.jpg'
    WHERE id = p_product_id;
  END IF;

  RETURN p_product_id;
END;
$$;

DO $$
BEGIN
  PERFORM pg_temp.qa_create_product(
    '28b20000-0000-0000-0000-000000000101',
    '28b20000-0000-0000-0000-000000000001',
    'Own draft'
  );
  PERFORM pg_temp.qa_create_product(
    '28b20000-0000-0000-0000-000000000102',
    '28b20000-0000-0000-0000-000000000002',
    'Other seller draft'
  );
  PERFORM pg_temp.qa_create_product(
    '28b20000-0000-0000-0000-000000000103',
    '28b20000-0000-0000-0000-000000000001',
    'Completed publication'
  );
  PERFORM pg_temp.qa_create_product(
    '28b20000-0000-0000-0000-000000000104',
    '28b20000-0000-0000-0000-000000000001',
    'Failed publication'
  );
  PERFORM pg_temp.qa_create_product(
    '28b20000-0000-0000-0000-000000000105',
    '28b20000-0000-0000-0000-000000000001',
    'Pending publication'
  );
  PERFORM pg_temp.qa_create_product(
    '28b20000-0000-0000-0000-000000000106',
    '28b20000-0000-0000-0000-000000000001',
    'Running publication'
  );
  PERFORM pg_temp.qa_create_product(
    '28b20000-0000-0000-0000-000000000107',
    '28b20000-0000-0000-0000-000000000001',
    'Run cleanup required'
  );
  PERFORM pg_temp.qa_create_product(
    '28b20000-0000-0000-0000-000000000108',
    '28b20000-0000-0000-0000-000000000001',
    'Item cleanup required'
  );
  PERFORM pg_temp.qa_create_product(
    '28b20000-0000-0000-0000-000000000109',
    '28b20000-0000-0000-0000-000000000001',
    'Published direct product',
    'published'
  );
  PERFORM pg_temp.qa_create_product(
    '28b20000-0000-0000-0000-000000000110',
    '28b20000-0000-0000-0000-000000000001',
    'Archived save target'
  );
  PERFORM pg_temp.qa_create_product(
    '28b20000-0000-0000-0000-000000000111',
    '28b20000-0000-0000-0000-000000000001',
    '',
    'archived'
  );
  PERFORM pg_temp.qa_create_product(
    '28b20000-0000-0000-0000-000000000112',
    '28b20000-0000-0000-0000-000000000001',
    'Exceptional deletion target'
  );
END;
$$;

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
  '28b20000-0000-0000-0000-000000000101',
  '28b20000-0000-0000-0000-000000000201',
  '28b20000-0000-0000-0000-000000000202',
  '28b20000-0000-0000-0000-000000000203',
  '28b20000-0000-0000-0000-000000000204',
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
  destination_key,
  content_type,
  size_bytes
)
VALUES
  (
    '28b20000-0000-0000-0000-000000000301',
    '28b20000-0000-0000-0000-000000000101',
    '28b20000-0000-0000-0000-000000000204',
    0,
    'available',
    'qa/0028b2/retained.jpg',
    'image/jpeg',
    100
  ),
  (
    '28b20000-0000-0000-0000-000000000308',
    '28b20000-0000-0000-0000-000000000108',
    '28b20000-0000-0000-0000-000000000208',
    0,
    'available',
    'qa/0028b2/cleanup.jpg',
    'image/jpeg',
    100
  );

INSERT INTO public.product_image_publication_runs (
  product_draft_id,
  seller_id,
  status,
  attempt_count,
  attempt_token,
  claim_started_at,
  error_code,
  completed_at
)
VALUES
  (
    '28b20000-0000-0000-0000-000000000103',
    '28b20000-0000-0000-0000-000000000001',
    'completed',
    1,
    NULL,
    NULL,
    NULL,
    now()
  ),
  (
    '28b20000-0000-0000-0000-000000000104',
    '28b20000-0000-0000-0000-000000000001',
    'failed',
    1,
    NULL,
    NULL,
    'qa_failure',
    NULL
  ),
  (
    '28b20000-0000-0000-0000-000000000105',
    '28b20000-0000-0000-0000-000000000001',
    'pending',
    0,
    NULL,
    NULL,
    NULL,
    NULL
  ),
  (
    '28b20000-0000-0000-0000-000000000106',
    '28b20000-0000-0000-0000-000000000001',
    'running',
    1,
    '28b20000-0000-0000-0000-000000000406',
    now(),
    NULL,
    NULL
  ),
  (
    '28b20000-0000-0000-0000-000000000107',
    '28b20000-0000-0000-0000-000000000001',
    'cleanup_required',
    1,
    NULL,
    NULL,
    'qa_cleanup',
    NULL
  ),
  (
    '28b20000-0000-0000-0000-000000000108',
    '28b20000-0000-0000-0000-000000000001',
    'failed',
    1,
    NULL,
    NULL,
    'qa_failure',
    NULL
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
  '28b20000-0000-0000-0000-000000000108',
  '28b20000-0000-0000-0000-000000000308',
  'product-draft-images',
  'qa/0028b2/cleanup.jpg',
  'products/qa-0028b2/cleanup.jpg',
  0,
  0,
  true,
  100,
  'image/jpeg',
  'cleanup_required',
  'qa_item_cleanup'
);

SELECT is(
  (
    SELECT result
    FROM public.archive_seller_product(
      '28b20000-0000-0000-0000-000000000101',
      '28b20000-0000-0000-0000-000000000001'
    )
  ),
  'archived',
  'a seller can archive an owned product with no publication run'
);

SELECT is(
  (
    SELECT status::text
    FROM public.products
    WHERE id = '28b20000-0000-0000-0000-000000000101'
  ),
  'archived',
  'archival persists the archived product status'
);

SELECT is(
  (
    SELECT result
    FROM public.archive_seller_product(
      '28b20000-0000-0000-0000-000000000101',
      '28b20000-0000-0000-0000-000000000001'
    )
  ),
  'archived',
  'a repeated archive is idempotent'
);

SELECT is(
  (
    SELECT result
    FROM public.archive_seller_product(
      '28b20000-0000-0000-0000-000000000102',
      '28b20000-0000-0000-0000-000000000001'
    )
  ),
  'product_not_found',
  'another seller product uses the non-disclosing not-found result'
);

SELECT is(
  (
    SELECT result
    FROM public.archive_seller_product(
      '28b20000-0000-0000-0000-000000000999',
      '28b20000-0000-0000-0000-000000000001'
    )
  ),
  'product_not_found',
  'a missing product uses the same not-found result'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_code_allocations
    WHERE product_id = '28b20000-0000-0000-0000-000000000101'
  ),
  1,
  'archival retains the permanent product-code allocation'
);

SELECT results_eq(
  $$
    SELECT
      (SELECT count(*)::integer FROM public.product_draft_images
       WHERE product_draft_id = '28b20000-0000-0000-0000-000000000101'),
      (SELECT count(*)::integer FROM public.product_draft_source_memberships
       WHERE product_draft_id = '28b20000-0000-0000-0000-000000000101')
  $$,
  $$ VALUES (1, 1) $$,
  'archival retains image and immutable classifier-source rows'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.products
    WHERE id = '28b20000-0000-0000-0000-000000000101'
      AND status = 'archived'
  ),
  1,
  'administrator database reads retain visibility of archived products'
);

SET LOCAL ROLE anon;
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.products
    WHERE id = '28b20000-0000-0000-0000-000000000101'
  ),
  0,
  'archived products disappear from public row-level-security reads'
);
RESET ROLE;

SELECT is(
  (
    SELECT result
    FROM public.archive_seller_product(
      '28b20000-0000-0000-0000-000000000103',
      '28b20000-0000-0000-0000-000000000001'
    )
  ),
  'archived',
  'a completed publication run does not block archival'
);

SELECT is(
  (
    SELECT result
    FROM public.archive_seller_product(
      '28b20000-0000-0000-0000-000000000104',
      '28b20000-0000-0000-0000-000000000001'
    )
  ),
  'archived',
  'a failed publication without cleanup does not block archival'
);

SELECT is(
  (
    SELECT result
    FROM public.archive_seller_product(
      '28b20000-0000-0000-0000-000000000105',
      '28b20000-0000-0000-0000-000000000001'
    )
  ),
  'product_archive_not_allowed',
  'pending publication blocks archival'
);

SELECT is(
  (
    SELECT result
    FROM public.archive_seller_product(
      '28b20000-0000-0000-0000-000000000106',
      '28b20000-0000-0000-0000-000000000001'
    )
  ),
  'product_archive_not_allowed',
  'running publication blocks archival'
);

SELECT is(
  (
    SELECT result
    FROM public.archive_seller_product(
      '28b20000-0000-0000-0000-000000000107',
      '28b20000-0000-0000-0000-000000000001'
    )
  ),
  'product_archive_not_allowed',
  'publication-run cleanup blocks archival'
);

SELECT is(
  (
    SELECT result
    FROM public.archive_seller_product(
      '28b20000-0000-0000-0000-000000000108',
      '28b20000-0000-0000-0000-000000000001'
    )
  ),
  'product_archive_not_allowed',
  'publication-item cleanup blocks archival'
);

SELECT is(
  (
    SELECT result
    FROM public.archive_seller_product(
      '28b20000-0000-0000-0000-000000000109',
      '28b20000-0000-0000-0000-000000000001'
    )
  ),
  'archived',
  'a directly published product with no active run can be archived'
);

SELECT throws_ok(
  $$
    UPDATE public.products
    SET status = 'draft'
    WHERE id = '28b20000-0000-0000-0000-000000000101'
  $$,
  '23514',
  'product_archive_immutable',
  'archived status cannot return to draft'
);

SELECT throws_ok(
  $$
    UPDATE public.products
    SET status = 'published'
    WHERE id = '28b20000-0000-0000-0000-000000000111'
  $$,
  '23514',
  'product_archive_immutable',
  'archive immutability runs before title and image-publication validation'
);

INSERT INTO public.product_draft_descriptions (
  product_draft_id,
  language,
  description_text,
  source,
  facts_revision
)
VALUES (
  '28b20000-0000-0000-0000-000000000110',
  'en',
  'Original description',
  'human',
  1
);

SELECT is(
  (
    SELECT result
    FROM public.archive_seller_product(
      '28b20000-0000-0000-0000-000000000110',
      '28b20000-0000-0000-0000-000000000001'
    )
  ),
  'archived',
  'the stale-save fixture archives successfully'
);

SELECT is(
  (
    SELECT result
    FROM public.save_seller_product_with_description(
      '28b20000-0000-0000-0000-000000000110',
      '28b20000-0000-0000-0000-000000000001',
      true,
      'Changed title',
      true,
      'Changed description',
      (SELECT id FROM public.categories WHERE slug = 'trousers'),
      99,
      'changed',
      99,
      'EUR',
      'out_of_stock',
      true,
      'https://example.test/changed.jpg',
      true,
      'published'
    )
  ),
  'not_editable',
  'seller save reports archived products as not editable before any write'
);

SELECT results_eq(
  $$
    SELECT product.title, description.description_text
    FROM public.products AS product
    JOIN public.product_draft_descriptions AS description
      ON description.product_draft_id = product.id
      AND description.language = 'en'
    WHERE product.id = '28b20000-0000-0000-0000-000000000110'
  $$,
  $$ VALUES ('Archived save target'::text, 'Original description'::text) $$,
  'a stale seller save changes neither product nor description fields'
);

UPDATE public.product_image_publication_runs
SET
  status = 'running',
  attempt_count = 2,
  attempt_token = '28b20000-0000-0000-0000-000000000403',
  claim_started_at = now(),
  error_code = NULL,
  completed_at = NULL
WHERE product_draft_id = '28b20000-0000-0000-0000-000000000103';

SELECT is(
  public.finalize_seller_product_publication(
    '28b20000-0000-0000-0000-000000000103',
    '28b20000-0000-0000-0000-000000000001',
    '28b20000-0000-0000-0000-000000000403'
  ),
  'not_allowed',
  'a stale publication finalizer cannot act on an archived product'
);

SELECT is(
  (
    SELECT status::text
    FROM public.products
    WHERE id = '28b20000-0000-0000-0000-000000000103'
  ),
  'archived',
  'stale publication finalization leaves archived status unchanged'
);

SELECT throws_ok(
  $$
    SET LOCAL ROLE authenticated;
    DELETE FROM public.products
    WHERE id = '28b20000-0000-0000-0000-000000000102'
  $$,
  '42501',
  'permission denied for table products',
  'a browser-authenticated caller cannot hard-delete a product'
);
RESET ROLE;

CREATE TEMP TABLE exceptional_allocation AS
SELECT product_code
FROM public.products
WHERE id = '28b20000-0000-0000-0000-000000000112';

SELECT is(
  (
    SELECT result
    FROM public.archive_seller_product(
      '28b20000-0000-0000-0000-000000000112',
      '28b20000-0000-0000-0000-000000000001'
    )
  ),
  'archived',
  'the exceptional-deletion fixture archives normally first'
);

DELETE FROM public.products
WHERE id = '28b20000-0000-0000-0000-000000000112';

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_code_allocations AS allocation
    JOIN exceptional_allocation AS expected
      ON expected.product_code = allocation.product_code
  ),
  1,
  'an exceptional operator deletion still leaves the product code reserved'
);

SELECT * FROM finish();

ROLLBACK;
