BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(10);

INSERT INTO public.sellers (id, slug, name, published, company_code)
VALUES
  (
    '29f00000-0000-0000-0000-000000000001',
    'qa-0029j-seller-one',
    'QA 0029j Seller One',
    false,
    'Q81'
  ),
  (
    '29f00000-0000-0000-0000-000000000002',
    'qa-0029j-seller-two',
    'QA 0029j Seller Two',
    false,
    'Q82'
  );

CREATE FUNCTION pg_temp.qa_product_code(p_product_id uuid)
RETURNS text
LANGUAGE sql
AS $$
  SELECT public.reserve_product_code(
    p_product_id,
    '29f00000-0000-0000-0000-000000000001',
    (SELECT id FROM public.categories WHERE slug = 't-shirts')
  );
$$;

INSERT INTO public.seller_classifier_batches (
  id,
  seller_id,
  client_request_id,
  classifier_organization_id,
  classifier_batch_id,
  max_files,
  max_file_size_bytes,
  provisioning_status,
  last_known_stage,
  product_draft_count,
  error_code,
  initiated_by_user_id,
  initiator_kind
)
VALUES (
  '29f00000-0000-0000-0000-000000000011',
  '29f00000-0000-0000-0000-000000000001',
  '29f00000-0000-0000-0000-000000000021',
  '29f00000-0000-0000-0000-000000000099',
  '29f00000-0000-0000-0000-000000000031',
  20,
  20971520,
  'ready',
  'failed',
  0,
  'seller_classifier_import_incomplete',
  '29f00000-0000-0000-0000-000000000101',
  'seller'
);

INSERT INTO public.classifier_import_runs (
  id,
  classifier_organization_id,
  classifier_batch_id,
  seller_id,
  seller_classifier_workflow_id,
  status,
  error_code,
  retryable,
  completed_at
)
VALUES (
  '29f00000-0000-0000-0000-000000000041',
  '29f00000-0000-0000-0000-000000000099',
  '29f00000-0000-0000-0000-000000000031',
  '29f00000-0000-0000-0000-000000000001',
  '29f00000-0000-0000-0000-000000000011',
  'completed_with_errors',
  'seller_classifier_import_incomplete',
  false,
  now()
);

INSERT INTO public.products (
  id,
  seller_id,
  category_id,
  product_code,
  title,
  status,
  classifier_organization_id,
  classifier_group_id
)
VALUES
  (
    '29f00000-0000-0000-0000-000000000051',
    '29f00000-0000-0000-0000-000000000001',
    (SELECT id FROM public.categories WHERE slug = 't-shirts'),
    pg_temp.qa_product_code('29f00000-0000-0000-0000-000000000051'),
    'Recovered second group',
    'draft',
    '29f00000-0000-0000-0000-000000000099',
    '29f00000-0000-0000-0000-000000000062'
  ),
  (
    '29f00000-0000-0000-0000-000000000052',
    '29f00000-0000-0000-0000-000000000001',
    (SELECT id FROM public.categories WHERE slug = 't-shirts'),
    pg_temp.qa_product_code('29f00000-0000-0000-0000-000000000052'),
    'Recovered first group',
    'archived',
    '29f00000-0000-0000-0000-000000000099',
    '29f00000-0000-0000-0000-000000000061'
  ),
  (
    '29f00000-0000-0000-0000-000000000053',
    '29f00000-0000-0000-0000-000000000001',
    (SELECT id FROM public.categories WHERE slug = 't-shirts'),
    pg_temp.qa_product_code('29f00000-0000-0000-0000-000000000053'),
    'Conflicting product',
    'draft',
    '29f00000-0000-0000-0000-000000000099',
    '29f00000-0000-0000-0000-000000000063'
  );

INSERT INTO public.classifier_import_group_outcomes (
  classifier_import_run_id,
  classifier_group_id,
  product_draft_id,
  approved_category_slug,
  source_cover_classifier_image_id,
  source_group_position,
  status,
  error_code,
  retryable
)
VALUES
  (
    '29f00000-0000-0000-0000-000000000041',
    '29f00000-0000-0000-0000-000000000062',
    '29f00000-0000-0000-0000-000000000051',
    'trousers',
    '29f00000-0000-0000-0000-000000000072',
    1,
    'failed',
    'product_draft_image_promotion_failed',
    false
  ),
  (
    '29f00000-0000-0000-0000-000000000041',
    '29f00000-0000-0000-0000-000000000061',
    NULL,
    't-shirts',
    '29f00000-0000-0000-0000-000000000071',
    0,
    'complete',
    NULL,
    false
  ),
  (
    '29f00000-0000-0000-0000-000000000041',
    '29f00000-0000-0000-0000-000000000064',
    NULL,
    'jackets',
    '29f00000-0000-0000-0000-000000000074',
    2,
    'failed',
    'classifier_import_category_not_supported',
    false
  );

SELECT results_eq(
  $$
    SELECT
      product_draft_id,
      classifier_group_id,
      source_group_position,
      product_status
    FROM public.list_owned_classifier_import_product_drafts(
      '29f00000-0000-0000-0000-000000000001',
      ARRAY['29f00000-0000-0000-0000-000000000041'::uuid]
    )
  $$,
  $$
    VALUES
      (
        '29f00000-0000-0000-0000-000000000052'::uuid,
        '29f00000-0000-0000-0000-000000000061'::uuid,
        0,
        'archived'::public.product_status
      ),
      (
        '29f00000-0000-0000-0000-000000000051'::uuid,
        '29f00000-0000-0000-0000-000000000062'::uuid,
        1,
        'draft'::public.product_status
      )
  $$,
  'source identity recovers products in classifier group order even with a missing pointer'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.list_owned_classifier_import_product_drafts(
      '29f00000-0000-0000-0000-000000000001',
      ARRAY['29f00000-0000-0000-0000-000000000041'::uuid]
    )
  ),
  2,
  'the source-resolved count is authoritative when the workflow count is stale'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.list_owned_classifier_import_product_drafts(
      '29f00000-0000-0000-0000-000000000002',
      ARRAY['29f00000-0000-0000-0000-000000000041'::uuid]
    )
  ),
  0,
  'another seller cannot discover products from the import'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.list_owned_classifier_import_product_drafts(
      '29f00000-0000-0000-0000-000000000001',
      ARRAY['29f00000-0000-0000-0000-000000000099'::uuid]
    )
  ),
  0,
  'an unknown import discloses no product data'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.list_owned_classifier_import_product_drafts(
      NULL,
      ARRAY['29f00000-0000-0000-0000-000000000041'::uuid]
    )
  $$,
  '22023',
  'seller_classifier_import_product_list_invalid',
  'a missing seller is rejected'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.list_owned_classifier_import_product_drafts(
      '29f00000-0000-0000-0000-000000000001',
      ARRAY[]::uuid[]
    )
  $$,
  '22023',
  'seller_classifier_import_product_list_invalid',
  'an empty import list is rejected'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.list_owned_classifier_import_product_drafts(
      '29f00000-0000-0000-0000-000000000001',
      array_fill(
        '29f00000-0000-0000-0000-000000000041'::uuid,
        ARRAY[102]
      )
    )
  $$,
  '22023',
  'seller_classifier_import_product_list_invalid',
  'a request above the pagination bound is rejected'
);

SELECT is(
  has_function_privilege(
    'service_role',
    'public.list_owned_classifier_import_product_drafts(uuid,uuid[])',
    'EXECUTE'
  ),
  true,
  'the service role can resolve owned import products'
);

SELECT is(
  has_function_privilege(
    'authenticated',
    'public.list_owned_classifier_import_product_drafts(uuid,uuid[])',
    'EXECUTE'
  ),
  false,
  'browser-authenticated callers cannot execute source resolution directly'
);

UPDATE public.classifier_import_group_outcomes
SET product_draft_id = '29f00000-0000-0000-0000-000000000053'
WHERE classifier_import_run_id = '29f00000-0000-0000-0000-000000000041'
  AND classifier_group_id = '29f00000-0000-0000-0000-000000000062';

SELECT throws_ok(
  $$
    SELECT *
    FROM public.list_owned_classifier_import_product_drafts(
      '29f00000-0000-0000-0000-000000000001',
      ARRAY['29f00000-0000-0000-0000-000000000041'::uuid]
    )
  $$,
  '23514',
  'seller_classifier_import_product_source_conflict',
  'a conflicting direct product pointer fails the complete read'
);

SELECT * FROM finish();
ROLLBACK;
