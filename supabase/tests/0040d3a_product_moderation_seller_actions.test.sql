BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(25);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '40d3a000-0000-4000-8000-000000000001',
  'qa-0040d3a-actions',
  'QA 0040d3a Actions',
  'QDA'
);
SELECT pg_temp.approve_fixture_seller('40d3a000-0000-4000-8000-000000000001');
UPDATE public.sellers
SET owner_id = '40000000-0000-4000-8000-000000000001'
WHERE id = '40d3a000-0000-4000-8000-000000000001';

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '40d3a000-0000-4000-8000-000000000002',
  'qa-0040d3a-foreign',
  'QA 0040d3a Foreign',
  'QDF'
);
SELECT pg_temp.approve_fixture_seller('40d3a000-0000-4000-8000-000000000002');

SELECT is(
  has_function_privilege(
    'authenticated', 'public.begin_product_moderation_editing(uuid,uuid)', 'EXECUTE'
  ),
  false,
  'browser roles cannot begin moderation editing directly'
);
SELECT is(
  has_function_privilege(
    'service_role', 'public.begin_product_moderation_editing(uuid,uuid)', 'EXECUTE'
  ),
  true,
  'the service role can invoke deliberate begin-edit'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.read_product_moderation_action_identity(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'browser roles cannot inspect moderation resource identity directly'
);
SELECT is(
  has_function_privilege(
    'service_role',
    'public.read_product_moderation_action_identity(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ),
  true,
  'the service role can inspect moderation action identity'
);
SELECT is(
  has_function_privilege(
    'service_role',
    'public.restore_seller_product_for_moderation_0040d3a_legacy(uuid,bigint,uuid,uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'the application cannot bypass the restore-owned archived initializer'
);

CREATE TEMP TABLE qa_product AS
SELECT * FROM public.save_initial_product_draft_with_description(
  NULL,
  '40d3a000-0000-4000-8000-000000000001',
  NULL,
  true,
  'Moderation action shirt',
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

CREATE TEMP TABLE initial_begin AS
SELECT * FROM public.begin_product_moderation_editing(
  (SELECT product_draft_id FROM qa_product),
  '40d3a000-0000-4000-8000-000000000001'
);
SELECT is(
  (SELECT edit_source FROM initial_begin),
  'initial_draft',
  'a never-approved draft enters its existing private state'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_moderation_working_copies
    WHERE product_id = (SELECT product_draft_id FROM qa_product)
  ),
  0,
  'beginning an initial draft does not create a working copy'
);
SELECT is(
  (
    SELECT moderation_revision
    FROM public.begin_product_moderation_editing(
      (SELECT product_draft_id FROM qa_product),
      '40d3a000-0000-4000-8000-000000000001'
    )
  ),
  (SELECT moderation_revision FROM initial_begin),
  'reopening an initial draft is naturally idempotent'
);

INSERT INTO public.product_draft_images (
  id, product_draft_id, source_position, status, destination_key,
  content_type, size_bytes, storage_bucket, source_kind, client_upload_id,
  original_filename
)
SELECT
  '40d3a000-0000-4000-8000-000000000101',
  product_draft_id,
  0,
  'available',
  'product-drafts/qa/0040d3a.jpg',
  'image/jpeg',
  100,
  'product-draft-images',
  'seller_upload',
  '40d3a000-0000-4000-8000-000000000201',
  'moderation-action.jpg'
FROM qa_product;

UPDATE public.products
SET cover_image_id = '40d3a000-0000-4000-8000-000000000101'
WHERE id = (SELECT product_draft_id FROM qa_product);

SELECT public.assign_product_code_for_publication(
  (SELECT product_draft_id FROM qa_product),
  '40d3a000-0000-4000-8000-000000000001'
);

CREATE TEMP TABLE qa_submission AS
SELECT * FROM public.submit_product_moderation(
  (SELECT product_draft_id FROM qa_product),
  '40d3a000-0000-4000-8000-000000000001',
  (
    SELECT moderation_revision
    FROM public.products
    WHERE id = (SELECT product_draft_id FROM qa_product)
  ),
  '40d3a000-0000-4000-8000-000000000301',
  '40000000-0000-4000-8000-000000000001'
);

UPDATE public.product_moderation_submissions
SET review_status = 'approved',
    administrator_user_id = '40000000-0000-4000-8000-000000000099',
    decision_request_id = '40d3a000-0000-4000-8000-000000000302',
    decided_at = now()
WHERE id = (SELECT id FROM qa_submission);

SET LOCAL session_replication_role = replica;
UPDATE public.products
SET status = 'published',
    approved_moderation_submission_id = (SELECT id FROM qa_submission),
    active_moderation_submission_id = NULL
WHERE id = (SELECT product_draft_id FROM qa_product);
SET LOCAL session_replication_role = origin;
SELECT set_config('bazoria.product_moderation_begin_edit_ids', '', true);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.read_product_moderation_edit_state(
      (SELECT product_draft_id FROM qa_product),
      '40d3a000-0000-4000-8000-000000000001'
    )
  ),
  0,
  'the published edit-state read is passive before Begin edit'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_moderation_working_copies
    WHERE product_id = (SELECT product_draft_id FROM qa_product)
  ),
  0,
  'the published edit-state read does not initialize a working copy'
);
SELECT throws_ok(
  $$
    SELECT * FROM public.ensure_product_moderation_working_copy(
      (SELECT product_draft_id FROM qa_product),
      '40d3a000-0000-4000-8000-000000000001'
    )
  $$,
  '55000',
  'product_moderation_product_not_editable',
  'the generic initializer cannot bypass deliberate Begin edit'
);

CREATE TEMP TABLE published_begin AS
SELECT * FROM public.begin_product_moderation_editing(
  (SELECT product_draft_id FROM qa_product),
  '40d3a000-0000-4000-8000-000000000001'
);
SELECT is(
  (SELECT edit_source FROM published_begin),
  'working_copy',
  'an eligible published product begins a private working copy'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_moderation_working_copies
    WHERE product_id = (SELECT product_draft_id FROM qa_product)
  ),
  1,
  'published begin-edit creates exactly one working copy'
);
SELECT is(
  (
    SELECT moderation_revision
    FROM public.begin_product_moderation_editing(
      (SELECT product_draft_id FROM qa_product),
      '40d3a000-0000-4000-8000-000000000001'
    )
  ),
  (SELECT moderation_revision FROM published_begin),
  'reopening a published editor reuses the same revision'
);
SELECT results_eq(
  $$
    SELECT product_owned, submission_owned, run_owned
    FROM public.read_product_moderation_action_identity(
      (SELECT product_draft_id FROM qa_product),
      '40d3a000-0000-4000-8000-000000000001',
      (SELECT id FROM qa_submission),
      NULL
    )
  $$,
  $$ VALUES (true, true, false) $$,
  'identity verifies an immutable submission against its owned product'
);

CREATE TEMP TABLE qa_other_product AS
SELECT * FROM public.save_initial_product_draft_with_description(
  NULL,
  '40d3a000-0000-4000-8000-000000000001',
  NULL,
  true,
  'Other product',
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
  'draft',
  ARRAY['women']::text[]
);
SELECT is(
  (
    SELECT submission_owned
    FROM public.read_product_moderation_action_identity(
      (SELECT product_draft_id FROM qa_other_product),
      '40d3a000-0000-4000-8000-000000000001',
      (SELECT id FROM qa_submission),
      NULL
    )
  ),
  false,
  'a submission from another product does not pass identity verification'
);

DELETE FROM public.product_moderation_working_copy_images
WHERE product_id = (SELECT product_draft_id FROM qa_product);
DELETE FROM public.product_moderation_working_copies
WHERE product_id = (SELECT product_draft_id FROM qa_product);
SET LOCAL session_replication_role = replica;
UPDATE public.products
SET status = 'archived'
WHERE id = (SELECT product_draft_id FROM qa_product);
SET LOCAL session_replication_role = origin;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.read_product_moderation_edit_state(
      (SELECT product_draft_id FROM qa_product),
      '40d3a000-0000-4000-8000-000000000001'
    )
  ),
  0,
  'the archived edit-state read stays passive until Restore'
);
SELECT throws_ok(
  $$
    SELECT * FROM public.ensure_product_moderation_working_copy(
      (SELECT product_draft_id FROM qa_product),
      '40d3a000-0000-4000-8000-000000000001'
    )
  $$,
  '55000',
  'product_moderation_product_not_editable',
  'the generic initializer cannot create an archived working copy'
);
SELECT throws_ok(
  $$
    SELECT * FROM public.begin_product_moderation_editing(
      (SELECT product_draft_id FROM qa_product),
      '40d3a000-0000-4000-8000-000000000001'
    )
  $$,
  '55000',
  'product_moderation_product_not_editable',
  'begin-edit requires Restore for an archived product without a copy'
);

CREATE TEMP TABLE restore_result AS
SELECT * FROM public.restore_seller_product_for_moderation(
  (SELECT product_draft_id FROM qa_product),
  (SELECT revision FROM qa_submission),
  '40d3a000-0000-4000-8000-000000000303',
  '40d3a000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001'
);
SELECT is(
  (SELECT result FROM restore_result),
  'restoration_draft',
  'Restore remains the protected archived initializer'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_moderation_working_copies
    WHERE product_id = (SELECT product_draft_id FROM qa_product)
  ),
  1,
  'Restore creates the archived private working copy'
);
SELECT is(
  (
    SELECT edit_source
    FROM public.begin_product_moderation_editing(
      (SELECT product_draft_id FROM qa_product),
      '40d3a000-0000-4000-8000-000000000001'
    )
  ),
  'working_copy',
  'begin-edit can reopen an existing archived restoration copy'
);

CREATE TEMP TABLE update_submission AS
SELECT * FROM public.submit_product_moderation(
  (SELECT product_draft_id FROM qa_product),
  '40d3a000-0000-4000-8000-000000000001',
  (SELECT moderation_revision FROM restore_result),
  '40d3a000-0000-4000-8000-000000000304',
  '40000000-0000-4000-8000-000000000001'
);
SELECT throws_ok(
  $$
    SELECT * FROM public.begin_product_moderation_editing(
      (SELECT product_draft_id FROM qa_product),
      '40d3a000-0000-4000-8000-000000000001'
    )
  $$,
  '55000',
  'product_moderation_product_not_editable',
  'pending review cannot be reopened for editing'
);
SELECT throws_ok(
  $$ SELECT * FROM public.begin_product_moderation_editing(NULL, NULL) $$,
  '22023',
  'product_moderation_edit_invalid',
  'begin-edit rejects malformed identifiers with its stable code'
);
SELECT results_eq(
  $$
    SELECT product_owned, submission_owned, run_owned
    FROM public.read_product_moderation_action_identity(
      (SELECT product_draft_id FROM qa_product),
      '40d3a000-0000-4000-8000-000000000002',
      (SELECT id FROM update_submission),
      NULL
    )
  $$,
  $$ VALUES (false, false, false) $$,
  'foreign sellers receive no product or immutable resource identity'
);

SELECT * FROM finish();
ROLLBACK;
