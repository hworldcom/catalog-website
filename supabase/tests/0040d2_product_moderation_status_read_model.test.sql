BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(24);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '40d20000-0000-4000-8000-000000000001',
  'qa-0040d2-status',
  'QA 0040d2 Status',
  'QDS'
);
SELECT pg_temp.approve_fixture_seller('40d20000-0000-4000-8000-000000000001');
UPDATE public.sellers
SET owner_id = '40000000-0000-4000-8000-000000000001'
WHERE id = '40d20000-0000-4000-8000-000000000001';

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '40d20000-0000-4000-8000-000000000002',
  'qa-0040d2-foreign',
  'QA 0040d2 Foreign',
  'QDF'
);
SELECT pg_temp.approve_fixture_seller('40d20000-0000-4000-8000-000000000002');

SELECT is(
  has_function_privilege(
    'authenticated', 'public.product_moderation_status_state(uuid)', 'EXECUTE'
  ),
  false,
  'browser roles cannot invoke the shared moderation status helper'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.list_seller_products_for_moderation(uuid,text,integer,timestamptz,uuid)',
    'EXECUTE'
  ),
  false,
  'browser roles cannot invoke the seller moderation list'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.read_seller_product_moderation_status(uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'browser roles cannot invoke the seller moderation detail read'
);
SELECT is(
  has_function_privilege(
    'service_role',
    'public.list_seller_products_for_moderation(uuid,text,integer,timestamptz,uuid)',
    'EXECUTE'
  ),
  true,
  'the service role can invoke the protected seller list'
);
SELECT is(
  has_function_privilege(
    'service_role',
    'public.read_seller_product_moderation_status(uuid,uuid)',
    'EXECUTE'
  ),
  true,
  'the service role can invoke the protected seller detail read'
);

SELECT is(
  (
    SELECT routine.provolatile::text
    FROM pg_proc AS routine
    WHERE routine.oid = 'public.product_moderation_status_state(uuid)'::regprocedure
  ),
  's',
  'the shared moderation state helper is stable and passive'
);
SELECT is(
  (
    SELECT routine.provolatile::text
    FROM pg_proc AS routine
    WHERE routine.oid =
      'public.list_seller_products_for_moderation(uuid,text,integer,timestamptz,uuid)'::regprocedure
  ),
  's',
  'the paginated seller list is stable and passive'
);
SELECT is(
  (
    SELECT routine.provolatile::text
    FROM pg_proc AS routine
    WHERE routine.oid =
      'public.read_seller_product_moderation_status(uuid,uuid)'::regprocedure
  ),
  's',
  'the seller status detail is stable and passive'
);

CREATE TEMP TABLE qa_product AS
SELECT * FROM public.save_initial_product_draft_with_description(
  NULL,
  '40d20000-0000-4000-8000-000000000001',
  NULL,
  true,
  'Moderated cotton shirt',
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
)
SELECT
  '40d20000-0000-4000-8000-000000000101',
  product_draft_id,
  0,
  'available',
  'product-drafts/qa/0040d2-cover.jpg',
  'image/jpeg',
  100,
  'product-draft-images',
  'seller_upload',
  '40d20000-0000-4000-8000-000000000201',
  'cover.jpg'
FROM qa_product;

UPDATE public.products AS product
SET cover_image_id = '40d20000-0000-4000-8000-000000000101'
WHERE product.id = (SELECT product_draft_id FROM qa_product);

SELECT results_eq(
  $$
    SELECT can_edit, can_submit, can_archive, can_restore,
      review_submission_id, activation_run_id
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_product),
      '40d20000-0000-4000-8000-000000000001'
    )
  $$,
  $$ VALUES (true, true, true, false, NULL::uuid, NULL::uuid) $$,
  'an unsubmitted approved-seller draft exposes only its eligible private actions'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_moderation_working_copies
    WHERE product_id = (SELECT product_draft_id FROM qa_product)
  ),
  0,
  'the passive status detail does not initialize a moderation working copy'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.list_seller_products_for_moderation(
      '40d20000-0000-4000-8000-000000000001', 'active', 10, NULL, NULL
    )
    WHERE id = (SELECT product_draft_id FROM qa_product)
  ),
  1,
  'the existing paginated list includes the seller-owned product'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_product),
      '40d20000-0000-4000-8000-000000000002'
    )
  ),
  0,
  'a foreign seller receives no product status row'
);
SELECT throws_ok(
  $$ SELECT * FROM public.read_seller_product_moderation_status(
       NULL, '40d20000-0000-4000-8000-000000000001'
     ) $$,
  '22023',
  'product_moderation_status_invalid',
  'the detail operation rejects an invalid identifier contract'
);

CREATE TEMP TABLE qa_submission AS
SELECT * FROM public.submit_product_moderation(
  (SELECT product_draft_id FROM qa_product),
  '40d20000-0000-4000-8000-000000000001',
  (
    SELECT moderation_revision FROM public.products
    WHERE id = (SELECT product_draft_id FROM qa_product)
  ),
  '40d20000-0000-4000-8000-000000000301',
  '40000000-0000-4000-8000-000000000001'
);

SELECT results_eq(
  $$
    SELECT review_status, review_submission_id, activation_run_id,
      can_edit, can_submit, can_withdraw, can_archive
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_product),
      '40d20000-0000-4000-8000-000000000001'
    )
  $$,
  $$
    SELECT 'pending'::text, id, NULL::uuid, false, false, true, true
    FROM qa_submission
  $$,
  'pending review is selected and exposes withdrawal without mutable editing'
);
SELECT is(
  (
    SELECT submitted_images -> 0 ->> 'productDraftImageId'
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_product),
      '40d20000-0000-4000-8000-000000000001'
    )
  ),
  '40d20000-0000-4000-8000-000000000101',
  'detail returns immutable submitted image membership in position order'
);
SELECT results_eq(
  $$
    SELECT list.moderation_revision, list.review_submission_id,
      list.review_status, list.can_withdraw, list.can_archive
    FROM public.list_seller_products_for_moderation(
      '40d20000-0000-4000-8000-000000000001', 'active', 10, NULL, NULL
    ) AS list
    WHERE list.id = (SELECT product_draft_id FROM qa_product)
  $$,
  $$
    SELECT detail.moderation_revision, detail.review_submission_id,
      detail.review_status, detail.can_withdraw, detail.can_archive
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_product),
      '40d20000-0000-4000-8000-000000000001'
    ) AS detail
  $$,
  'list and detail expose identical common moderation fields'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_moderation_working_copies
    WHERE product_id = (SELECT product_draft_id FROM qa_product)
  ),
  0,
  'list and pending-status reads remain passive'
);

CREATE TEMP TABLE qa_approval AS
SELECT * FROM public.decide_product_moderation_submission(
  (SELECT id FROM qa_submission),
  (SELECT revision FROM qa_submission),
  'approve',
  NULL,
  '40d20000-0000-4000-8000-000000000302',
  '40d20000-0000-4000-8000-000000000999'
);

SELECT results_eq(
  $$
    SELECT review_status, activation_run_id, activation_phase,
      activation_status, activation_dispatch_status
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_product),
      '40d20000-0000-4000-8000-000000000001'
    )
  $$,
  $$
    SELECT 'approved'::text, activation_run_id, 'activation'::text,
      'pending'::text, 'pending'::text
    FROM qa_approval
  $$,
  'an approved review is bound to its unique pending activation run'
);
SELECT results_eq(
  $$
    SELECT can_edit, can_submit, can_withdraw, can_abandon_failed_activation,
      can_retry_abandonment_cleanup, can_archive, can_restore
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_product),
      '40d20000-0000-4000-8000-000000000001'
    )
  $$,
  $$ VALUES (false, false, false, false, false, false, false) $$,
  'active publication suppresses conflicting seller actions'
);

DO $$
BEGIN
  PERFORM * FROM public.record_product_activation_dispatch_result(
    (SELECT activation_run_id FROM qa_approval), 1, 'failed'
  );
END;
$$;
SELECT results_eq(
  $$
    SELECT activation_status, activation_dispatch_status,
      activation_dispatch_error_code, can_archive
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_product),
      '40d20000-0000-4000-8000-000000000001'
    )
  $$,
  $$ VALUES (
    'pending'::text, 'failed'::text,
    'product_activation_dispatch_failed'::text, false
  ) $$,
  'dispatch failure remains distinct from worker activation failure'
);

CREATE TEMP TABLE qa_retry AS
SELECT * FROM public.retry_product_activation_dispatch(
  (SELECT activation_run_id FROM qa_approval),
  1,
  '40d20000-0000-4000-8000-000000000303',
  '40d20000-0000-4000-8000-000000000999'
);
DO $$
BEGIN
  PERFORM * FROM public.record_product_activation_dispatch_result(
    (SELECT activation_run_id FROM qa_approval),
    (SELECT dispatch_generation FROM qa_retry),
    'dispatched'
  );
END;
$$;

CREATE TEMP TABLE qa_claim AS
SELECT public.claim_product_activation_run(
  (SELECT activation_run_id FROM qa_approval),
  (SELECT dispatch_generation FROM qa_retry),
  360
) AS claim;

DO $$
BEGIN
  PERFORM public.record_product_activation_object_created(
    (SELECT activation_run_id FROM qa_approval),
    (SELECT dispatch_generation FROM qa_retry),
    (SELECT (claim ->> 'attemptToken')::uuid FROM qa_claim),
    '40d20000-0000-4000-8000-000000000101',
    repeat('a', 64),
    100,
    repeat('a', 64),
    '"0040d2-etag"',
    'https://example.test/0040d2-cover.jpg'
  );
  PERFORM public.verify_product_activation_item(
    (SELECT activation_run_id FROM qa_approval),
    (SELECT dispatch_generation FROM qa_retry),
    (SELECT (claim ->> 'attemptToken')::uuid FROM qa_claim),
    '40d20000-0000-4000-8000-000000000101',
    100,
    repeat('a', 64),
    '"0040d2-etag"'
  );
  PERFORM public.finalize_product_activation(
    (SELECT activation_run_id FROM qa_approval),
    (SELECT dispatch_generation FROM qa_retry),
    (SELECT (claim ->> 'attemptToken')::uuid FROM qa_claim)
  );
END;
$$;

SELECT results_eq(
  $$
    SELECT status::text, activation_status, can_edit, can_archive
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_product),
      '40d20000-0000-4000-8000-000000000001'
    )
  $$,
  $$ VALUES ('published'::text, 'completed'::text, true, true) $$,
  'completed activation keeps its history while the published product becomes editable'
);

CREATE TEMP TABLE qa_archive AS
SELECT * FROM public.archive_seller_product_with_moderation(
  (SELECT product_draft_id FROM qa_product),
  (SELECT revision FROM qa_submission),
  '40d20000-0000-4000-8000-000000000304',
  '40d20000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001'
);
SELECT results_eq(
  $$
    SELECT can_edit, can_submit, can_archive, can_restore, has_working_copy
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_product),
      '40d20000-0000-4000-8000-000000000001'
    )
  $$,
  $$ VALUES (false, false, false, true, false) $$,
  'an eligible archived product offers Restore but no edit or submit action'
);

CREATE TEMP TABLE qa_restore AS
SELECT * FROM public.restore_seller_product_for_moderation(
  (SELECT product_draft_id FROM qa_product),
  (SELECT moderation_revision FROM qa_archive),
  '40d20000-0000-4000-8000-000000000305',
  '40d20000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001'
);
SELECT results_eq(
  $$
    SELECT can_edit, can_submit, can_archive, can_restore, has_working_copy,
      moderation_revision
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_product),
      '40d20000-0000-4000-8000-000000000001'
    )
  $$,
  $$
    SELECT true, true, false, false, true, moderation_revision
    FROM qa_restore
  $$,
  'after Restore the working copy owns edit and submit while Restore disappears'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_archive_restore_operations
    WHERE product_id = (SELECT product_draft_id FROM qa_product)
  ),
  2,
  'status reads do not create additional archive or restore receipts'
);

SELECT * FROM finish();
ROLLBACK;
