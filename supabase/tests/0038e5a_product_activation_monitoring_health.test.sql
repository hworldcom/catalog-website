BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(8);

SELECT is(
  has_function_privilege(
    'authenticated',
    'public.read_product_activation_dispatch_health()',
    'EXECUTE'
  ),
  false,
  'browser roles cannot read durable activation dispatch health'
);
SELECT is(
  has_function_privilege(
    'service_role',
    'public.read_product_activation_dispatch_health()',
    'EXECUTE'
  ),
  true,
  'the service role can read durable activation dispatch health'
);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '38e5a000-0000-4000-8000-000000000001',
  'qa-0038e5a-monitoring',
  'QA 0038e5a Monitoring',
  'QMA'
);
SELECT pg_temp.approve_fixture_seller('38e5a000-0000-4000-8000-000000000001');

CREATE FUNCTION pg_temp.create_pending_activation_run(p_title text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  draft record;
  submission record;
  approval record;
  image_id uuid := gen_random_uuid();
BEGIN
  SELECT * INTO draft
  FROM public.save_initial_product_draft_with_description(
    NULL,
    '38e5a000-0000-4000-8000-000000000001',
    NULL,
    true,
    p_title,
    false,
    NULL,
    (SELECT id FROM public.categories WHERE slug = 't-shirts'),
    10,
    '10 pieces',
    20,
    'EUR',
    'in_stock',
    false,
    NULL,
    false,
    'draft',
    ARRAY['women']::text[]
  );

  INSERT INTO public.product_draft_images (
    id, product_draft_id, source_position, status, destination_key,
    content_type, size_bytes, storage_bucket, source_kind, client_upload_id,
    original_filename
  ) VALUES (
    image_id, draft.product_draft_id, 0, 'available',
    'product-drafts/qa/0038e5a/' || image_id::text || '.jpg',
    'image/jpeg', 100, 'product-draft-images', 'seller_upload',
    gen_random_uuid(), p_title || '.jpg'
  );
  UPDATE public.products
  SET cover_image_id = image_id
  WHERE id = draft.product_draft_id;

  SELECT * INTO submission
  FROM public.submit_product_moderation(
    draft.product_draft_id,
    '38e5a000-0000-4000-8000-000000000001',
    (SELECT moderation_revision FROM public.products WHERE id = draft.product_draft_id),
    gen_random_uuid(),
    '38e5a000-0000-4000-8000-000000000101'
  );
  SELECT * INTO approval
  FROM public.decide_product_moderation_submission(
    submission.id,
    submission.revision,
    'approve',
    NULL,
    gen_random_uuid(),
    '38e5a000-0000-4000-8000-000000000101'
  );

  RETURN approval.activation_run_id;
END;
$$;

CREATE TEMP TABLE qa_runs (position integer PRIMARY KEY, run_id uuid NOT NULL);
INSERT INTO qa_runs VALUES
  (1, pg_temp.create_pending_activation_run('Monitoring shirt one')),
  (2, pg_temp.create_pending_activation_run('Monitoring shirt two')),
  (3, pg_temp.create_pending_activation_run('Monitoring shirt three'));

SELECT is(
  (SELECT count(*)::integer FROM public.list_pending_product_activation_dispatches(1)),
  1,
  'the bounded reconciliation read returns only its requested page'
);
SELECT is(
  (SELECT pending_count FROM public.read_product_activation_dispatch_health()),
  3::bigint,
  'the health read counts eligible rows beyond the bounded reconciliation page'
);
SELECT is(
  (SELECT oldest_pending_created_at FROM public.read_product_activation_dispatch_health()),
  (SELECT min(created_at) FROM public.product_image_publication_runs
   WHERE id IN (SELECT run_id FROM qa_runs)),
  'the health read returns the oldest eligible durable creation time'
);

DO $$
BEGIN
  PERFORM public.record_product_activation_dispatch_result(
    (SELECT run_id FROM qa_runs WHERE position = 3),
    1,
    'dispatched'
  );
END;
$$;

SELECT is(
  (SELECT pending_count FROM public.read_product_activation_dispatch_health()),
  2::bigint,
  'the health read excludes a dispatched row'
);

DO $$
DECLARE
  selected record;
BEGIN
  FOR selected IN SELECT run_id FROM qa_runs WHERE position IN (1, 2)
  LOOP
    PERFORM public.record_product_activation_dispatch_result(selected.run_id, 1, 'dispatched');
  END LOOP;
END;
$$;

SELECT is(
  (SELECT pending_count FROM public.read_product_activation_dispatch_health()),
  0::bigint,
  'the health read returns zero for an empty eligible queue'
);
SELECT is(
  (SELECT oldest_pending_created_at FROM public.read_product_activation_dispatch_health()),
  NULL::timestamptz,
  'the health read returns a null oldest timestamp for an empty eligible queue'
);

SELECT * FROM finish();
ROLLBACK;
