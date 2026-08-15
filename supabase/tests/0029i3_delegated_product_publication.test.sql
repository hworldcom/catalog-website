BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(9);

INSERT INTO public.sellers (id, slug, name, published, company_code)
VALUES (
  '29a30000-0000-0000-0000-000000000001',
  'qa-0029i3-seller',
  'QA 0029i3 Seller',
  false,
  'Q72'
);

SELECT pg_temp.approve_fixture_seller('29a30000-0000-0000-0000-000000000001');

CREATE FUNCTION pg_temp.qa_product_code(p_product_id uuid)
RETURNS text
LANGUAGE sql
AS $$
  SELECT public.reserve_product_code(
    p_product_id,
    '29a30000-0000-0000-0000-000000000001',
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
  initiated_by_user_id,
  initiator_kind
)
VALUES (
  '29a30000-0000-0000-0000-000000000011',
  '29a30000-0000-0000-0000-000000000001',
  '29a30000-0000-0000-0000-000000000021',
  '29a30000-0000-0000-0000-000000000031',
  '29a30000-0000-0000-0000-000000000041',
  20,
  20971520,
  'ready',
  'importing',
  '29a30000-0000-0000-0000-000000000051',
  'administrator'
);

INSERT INTO public.products (
  id,
  seller_id,
  product_code,
  title,
  title_source,
  status,
  category_id
)
VALUES (
  '29a30000-0000-0000-0000-000000000101',
  '29a30000-0000-0000-0000-000000000001',
  pg_temp.qa_product_code('29a30000-0000-0000-0000-000000000101'),
  'Delegated draft',
  'human',
  'draft',
  (SELECT id FROM public.categories WHERE slug = 't-shirts')
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
  '29a30000-0000-0000-0000-000000000101',
  '29a30000-0000-0000-0000-000000000031',
  '29a30000-0000-0000-0000-000000000041',
  '29a30000-0000-0000-0000-000000000061',
  '29a30000-0000-0000-0000-000000000111',
  0,
  false,
  NULL,
  true
);

INSERT INTO public.delegated_administrator_action_attempts (
  request_id,
  workflow_id,
  seller_id,
  administrator_user_id,
  action_type,
  target_id,
  request_fingerprint,
  status,
  attempt_count,
  attempt_token,
  claim_started_at
)
VALUES (
  '29a30000-0000-0000-0000-000000000201',
  '29a30000-0000-0000-0000-000000000011',
  '29a30000-0000-0000-0000-000000000001',
  '29a30000-0000-0000-0000-000000000051',
  'publish_product_draft',
  '29a30000-0000-0000-0000-000000000101',
  repeat('a', 64),
  'running',
  1,
  '29a30000-0000-0000-0000-000000000202',
  now()
);

INSERT INTO public.product_image_publication_runs (
  product_draft_id,
  seller_id,
  status,
  delegated_action_request_id,
  delegated_action_request_fingerprint
)
VALUES (
  '29a30000-0000-0000-0000-000000000101',
  '29a30000-0000-0000-0000-000000000001',
  'pending',
  '29a30000-0000-0000-0000-000000000201',
  repeat('a', 64)
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.apply_scoped_product_draft_description_patch(uuid,uuid,boolean,text,boolean,text,boolean,text,boolean,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.apply_scoped_product_draft_description_patch(uuid,uuid,boolean,text,boolean,text,boolean,text,boolean,text)',
    'EXECUTE'
  ),
  'only the service role can execute the seller-scoped description patch'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.authorize_product_publication_with_correlation(uuid,uuid,boolean,text,boolean,text,uuid,integer,text,numeric,text,public.stock_status,boolean,text,boolean,text[],uuid,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.authorize_product_publication_with_correlation(uuid,uuid,boolean,text,boolean,text,uuid,integer,text,numeric,text,public.stock_status,boolean,text,boolean,text[],uuid,text)',
    'EXECUTE'
  ),
  'only the service role can execute correlated publication authorization'
);

SELECT throws_ok(
  $$
    INSERT INTO public.products (
      id,
      seller_id,
      title,
      title_source,
      status,
      category_id,
      cover_image_url
    )
    VALUES (
      '29a30000-0000-0000-0000-000000000102',
      '29a30000-0000-0000-0000-000000000001',
      'Missing category',
      'human',
      'published',
      NULL,
      'https://example.test/qa-0029i3.jpg'
    )
  $$,
  '23514',
  'product_publication_category_required',
  'a published product requires a destination category'
);

SELECT is(
  (
    SELECT result
    FROM public.apply_scoped_product_draft_description_patch(
      '29a30000-0000-0000-0000-000000000101',
      '29a30000-0000-0000-0000-000000000099',
      false, NULL,
      true, 'Must not be saved',
      false, NULL,
      false, NULL
    )
  ),
  'not_found',
  'a description write with another seller is non-disclosing'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_draft_descriptions
    WHERE product_draft_id = '29a30000-0000-0000-0000-000000000101'
  ),
  0,
  'a seller mismatch writes no description rows'
);

SELECT results_eq(
  $$
    SELECT result, publication_status
    FROM public.authorize_product_publication_with_correlation(
      '29a30000-0000-0000-0000-000000000101',
      '29a30000-0000-0000-0000-000000000001',
      true,
      'Delegated draft',
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
      ARRAY['women']::text[],
      '29a30000-0000-0000-0000-000000000201',
      repeat('a', 64)
    )
  $$,
  $$
    VALUES ('pending'::text, 'pending'::text)
  $$,
  'a reclaimed matching pending run is safe to redispatch'
);

SELECT is(
  (
    SELECT delegated_action_request_id
    FROM public.product_image_publication_runs
    WHERE product_draft_id = '29a30000-0000-0000-0000-000000000101'
  ),
  '29a30000-0000-0000-0000-000000000201'::uuid,
  'matching recovery preserves the durable action correlation'
);

UPDATE public.product_image_publication_runs
SET
  delegated_action_request_id = NULL,
  delegated_action_request_fingerprint = NULL
WHERE product_draft_id = '29a30000-0000-0000-0000-000000000101';

SELECT results_eq(
  $$
    SELECT result, publication_status
    FROM public.authorize_product_publication_with_correlation(
      '29a30000-0000-0000-0000-000000000101',
      '29a30000-0000-0000-0000-000000000001',
      true,
      'Delegated draft',
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
      ARRAY['women']::text[],
      '29a30000-0000-0000-0000-000000000201',
      repeat('a', 64)
    )
  $$,
  $$
    VALUES ('in_progress'::text, 'pending'::text)
  $$,
  'an unrelated pending run is not adopted'
);

SELECT is(
  (
    SELECT delegated_action_request_id
    FROM public.product_image_publication_runs
    WHERE product_draft_id = '29a30000-0000-0000-0000-000000000101'
  ),
  NULL::uuid,
  'unrelated publication correlation remains unchanged'
);

SELECT * FROM finish();
ROLLBACK;
