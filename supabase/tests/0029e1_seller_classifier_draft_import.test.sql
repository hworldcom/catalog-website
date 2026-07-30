BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(29);

INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES (
  '29e10000-0000-0000-0000-000000000101',
  'authenticated',
  'authenticated',
  'qa-0029e1@example.test',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

INSERT INTO public.sellers (id, slug, name, published)
VALUES
  (
    '29e10000-0000-0000-0000-000000000001',
    'qa-0029e1-seller-one',
    'QA 0029e1 Seller One',
    false
  ),
  (
    '29e10000-0000-0000-0000-000000000002',
    'qa-0029e1-seller-two',
    'QA 0029e1 Seller Two',
    true
  );

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
VALUES
  (
    '29e10000-0000-0000-0000-000000000011',
    '29e10000-0000-0000-0000-000000000001',
    '29e10000-0000-0000-0000-000000000021',
    '29e10000-0000-0000-0000-000000000099',
    '29e10000-0000-0000-0000-000000000031',
    20,
    20971520,
    'ready',
    'review',
    '29e10000-0000-0000-0000-000000000101',
    'seller'
  ),
  (
    '29e10000-0000-0000-0000-000000000012',
    '29e10000-0000-0000-0000-000000000001',
    '29e10000-0000-0000-0000-000000000022',
    '29e10000-0000-0000-0000-000000000099',
    '29e10000-0000-0000-0000-000000000032',
    20,
    20971520,
    'ready',
    'review',
    '29e10000-0000-0000-0000-000000000101',
    'seller'
  ),
  (
    '29e10000-0000-0000-0000-000000000013',
    '29e10000-0000-0000-0000-000000000001',
    '29e10000-0000-0000-0000-000000000023',
    '29e10000-0000-0000-0000-000000000099',
    '29e10000-0000-0000-0000-000000000033',
    20,
    20971520,
    'ready',
    'review',
    '29e10000-0000-0000-0000-000000000101',
    'seller'
  ),
  (
    '29e10000-0000-0000-0000-000000000014',
    '29e10000-0000-0000-0000-000000000001',
    '29e10000-0000-0000-0000-000000000024',
    '29e10000-0000-0000-0000-000000000099',
    '29e10000-0000-0000-0000-000000000034',
    20,
    20971520,
    'ready',
    'review',
    '29e10000-0000-0000-0000-000000000101',
    'seller'
  );

SELECT throws_ok(
  $$
    SELECT *
    FROM public.record_seller_classifier_batch_approved(
      '29e10000-0000-0000-0000-000000000011',
      '29e10000-0000-0000-0000-000000000001',
      0
    )
  $$,
  '22023',
  'seller_classifier_approval_invalid',
  'empty classifier batches cannot be durably approved'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_batch_approved(
      '29e10000-0000-0000-0000-000000000011',
      '29e10000-0000-0000-0000-000000000001',
      1
    )
  ),
  'recorded',
  'an owned review workflow advances to approved'
);

SELECT results_eq(
  $$
    SELECT last_known_stage, group_count
    FROM public.seller_classifier_batches
    WHERE id = '29e10000-0000-0000-0000-000000000011'
  $$,
  $$ VALUES ('approved'::text, 1) $$,
  'approval records the exact nonempty group count'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.create_or_get_owned_classifier_import(
      '29e10000-0000-0000-0000-000000000011',
      '29e10000-0000-0000-0000-000000000001',
      '29e10000-0000-0000-0000-000000000099',
      '29e10000-0000-0000-0000-000000000031',
      '29e10000-0000-0000-0000-000000000101'
    )
  ),
  'created',
  'approval creates one seller-attributed import'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.create_or_get_owned_classifier_import(
      '29e10000-0000-0000-0000-000000000011',
      '29e10000-0000-0000-0000-000000000001',
      '29e10000-0000-0000-0000-000000000099',
      '29e10000-0000-0000-0000-000000000031',
      '29e10000-0000-0000-0000-000000000101'
    )
  ),
  'existing',
  'approval replay returns the same import'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.classifier_import_runs
    WHERE seller_classifier_workflow_id =
      '29e10000-0000-0000-0000-000000000011'
  ),
  1,
  'one workflow is bound to exactly one import'
);

SELECT results_eq(
  $$
    SELECT last_known_stage, error_code, retryable
    FROM public.seller_classifier_batches
    WHERE id = '29e10000-0000-0000-0000-000000000011'
  $$,
  $$ VALUES ('importing'::text, NULL::text, false) $$,
  'binding advances the workflow to importing atomically'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.get_owned_seller_classifier_import(
      '29e10000-0000-0000-0000-000000000011',
      '29e10000-0000-0000-0000-000000000002'
    )
  ),
  0,
  'another seller cannot read the bound import'
);

SELECT throws_ok(
  $$
    UPDATE public.classifier_import_runs
    SET seller_classifier_workflow_id = NULL
    WHERE seller_classifier_workflow_id =
      '29e10000-0000-0000-0000-000000000011'
  $$,
  '23514',
  'classifier_import_workflow_immutable',
  'an established workflow binding is immutable'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.claim_classifier_import_run(
      (
        SELECT id
        FROM public.classifier_import_runs
        WHERE seller_classifier_workflow_id =
          '29e10000-0000-0000-0000-000000000011'
      ),
      900
    )
  ),
  1,
  'the exact linked import can be claimed'
);

SELECT is(
  (
    SELECT result
    FROM public.prepare_classifier_import_group_at_position(
      (
        SELECT id
        FROM public.classifier_import_runs
        WHERE seller_classifier_workflow_id =
          '29e10000-0000-0000-0000-000000000011'
      ),
      (
        SELECT attempt_token
        FROM public.classifier_import_runs
        WHERE seller_classifier_workflow_id =
          '29e10000-0000-0000-0000-000000000011'
      ),
      '29e10000-0000-0000-0000-000000000041',
      'fashion',
      '29e10000-0000-0000-0000-000000000051',
      0
    )
  ),
  'prepared',
  'group preparation persists classifier group order'
);

SELECT is(
  (
    SELECT source_group_position
    FROM public.classifier_import_group_outcomes
    WHERE classifier_import_run_id = (
      SELECT id
      FROM public.classifier_import_runs
      WHERE seller_classifier_workflow_id =
        '29e10000-0000-0000-0000-000000000011'
    )
  ),
  0,
  'the durable outcome retains source group position'
);

SELECT is(
  (
    SELECT result
    FROM public.prepare_classifier_import_group_images(
      (
        SELECT id
        FROM public.classifier_import_runs
        WHERE seller_classifier_workflow_id =
          '29e10000-0000-0000-0000-000000000011'
      ),
      (
        SELECT attempt_token
        FROM public.classifier_import_runs
        WHERE seller_classifier_workflow_id =
          '29e10000-0000-0000-0000-000000000011'
      ),
      '29e10000-0000-0000-0000-000000000041',
      '29e10000-0000-0000-0000-000000000051',
      '[{
        "image_id": "29e10000-0000-0000-0000-000000000051",
        "source_position": 0,
        "is_duplicate": false,
        "duplicate_of_image_id": null
      }]'::jsonb
    )
  ),
  'prepared',
  'the prepared group owns one required private draft image'
);

UPDATE public.product_draft_images
SET
  status = 'available',
  content_type = 'image/jpeg',
  size_bytes = 100
WHERE product_draft_id = (
  SELECT product_draft_id
  FROM public.classifier_import_group_outcomes
  WHERE classifier_import_run_id = (
    SELECT id
    FROM public.classifier_import_runs
    WHERE seller_classifier_workflow_id =
      '29e10000-0000-0000-0000-000000000011'
  )
);

UPDATE public.product_draft_image_promotions
SET
  status = 'promoted',
  source_content_length = 100,
  destination_size_bytes = 100,
  attempt_token = NULL,
  claim_started_at = NULL,
  error_code = NULL,
  retryable = false,
  promoted_at = now()
WHERE product_draft_id = (
  SELECT product_draft_id
  FROM public.classifier_import_group_outcomes
  WHERE classifier_import_run_id = (
    SELECT id
    FROM public.classifier_import_runs
    WHERE seller_classifier_workflow_id =
      '29e10000-0000-0000-0000-000000000011'
  )
);

SELECT ok(
  public.set_classifier_import_group_result(
    (
      SELECT id
      FROM public.classifier_import_runs
      WHERE seller_classifier_workflow_id =
        '29e10000-0000-0000-0000-000000000011'
    ),
    (
      SELECT attempt_token
      FROM public.classifier_import_runs
      WHERE seller_classifier_workflow_id =
        '29e10000-0000-0000-0000-000000000011'
    ),
    '29e10000-0000-0000-0000-000000000041',
    'complete',
    NULL,
    false
  ),
  'the active worker completes the group'
);

CREATE TEMP TABLE qa_0029e1_attempt AS
SELECT
  id AS import_id,
  attempt_token
FROM public.classifier_import_runs
WHERE seller_classifier_workflow_id =
  '29e10000-0000-0000-0000-000000000011';

SELECT ok(
  public.finalize_classifier_import_run(
    (SELECT import_id FROM qa_0029e1_attempt),
    (SELECT attempt_token FROM qa_0029e1_attempt),
    'completed',
    NULL,
    false
  ),
  'the owning worker finalizes the import'
);

SELECT results_eq(
  $$
    SELECT last_known_stage, product_draft_count, error_code, retryable
    FROM public.seller_classifier_batches
    WHERE id = '29e10000-0000-0000-0000-000000000011'
  $$,
  $$ VALUES ('drafts_ready'::text, 1, NULL::text, false) $$,
  'successful finalization projects drafts ready without a browser'
);

SELECT is(
  (
    SELECT seller_id
    FROM public.products
    WHERE id = (
      SELECT product_draft_id
      FROM public.classifier_import_group_outcomes
      WHERE classifier_import_run_id = (
        SELECT import_id FROM qa_0029e1_attempt
      )
    )
  ),
  '29e10000-0000-0000-0000-000000000001'::uuid,
  'the ProductDraft belongs to the immutable workflow seller'
);

SELECT is(
  public.finalize_classifier_import_run(
    (SELECT import_id FROM qa_0029e1_attempt),
    (SELECT attempt_token FROM qa_0029e1_attempt),
    'failed',
    'late_worker_failure',
    true
  ),
  false,
  'a late worker result loses its attempt-token fence'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_batch_approved(
      '29e10000-0000-0000-0000-000000000012',
      '29e10000-0000-0000-0000-000000000001',
      1
    )
  ),
  'recorded',
  'the retry workflow is approved'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.create_or_get_owned_classifier_import(
      '29e10000-0000-0000-0000-000000000012',
      '29e10000-0000-0000-0000-000000000001',
      '29e10000-0000-0000-0000-000000000099',
      '29e10000-0000-0000-0000-000000000032',
      '29e10000-0000-0000-0000-000000000101'
    )
  ),
  'created',
  'the retry scenario creates a linked import'
);

UPDATE public.classifier_import_runs
SET
  status = 'completed_with_errors',
  error_code = NULL,
  retryable = true,
  completed_at = now()
WHERE seller_classifier_workflow_id =
  '29e10000-0000-0000-0000-000000000012';

SELECT ok(
  public.project_classifier_import_to_seller_workflow(
    (
      SELECT id
      FROM public.classifier_import_runs
      WHERE seller_classifier_workflow_id =
        '29e10000-0000-0000-0000-000000000012'
    )
  ),
  'a terminal partial import projects a failed workflow'
);

SELECT is(
  public.retry_classifier_import(
    (
      SELECT id
      FROM public.classifier_import_runs
      WHERE seller_classifier_workflow_id =
        '29e10000-0000-0000-0000-000000000012'
    ),
    false
  ),
  'requeued',
  'retryable-only seller retry requeues the same import'
);

SELECT results_eq(
  $$
    SELECT run.status, workflow.last_known_stage, workflow.error_code, workflow.retryable
    FROM public.classifier_import_runs AS run
    JOIN public.seller_classifier_batches AS workflow
      ON workflow.id = run.seller_classifier_workflow_id
    WHERE workflow.id = '29e10000-0000-0000-0000-000000000012'
  $$,
  $$
    VALUES (
      'pending'::public.classifier_import_status,
      'importing'::text,
      NULL::text,
      false
    )
  $$,
  'retry atomically returns both import and workflow to active state'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_batch_approved(
      '29e10000-0000-0000-0000-000000000013',
      '29e10000-0000-0000-0000-000000000001',
      1
    )
  ),
  'recorded',
  'the ownership-conflict workflow is approved'
);

INSERT INTO public.classifier_import_runs (
  classifier_organization_id,
  classifier_batch_id,
  seller_id
)
VALUES (
  '29e10000-0000-0000-0000-000000000099',
  '29e10000-0000-0000-0000-000000000033',
  '29e10000-0000-0000-0000-000000000002'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.create_or_get_owned_classifier_import(
      '29e10000-0000-0000-0000-000000000013',
      '29e10000-0000-0000-0000-000000000001',
      '29e10000-0000-0000-0000-000000000099',
      '29e10000-0000-0000-0000-000000000033',
      '29e10000-0000-0000-0000-000000000101'
    )
  ),
  'ownership_conflict',
  'a source import belonging to another seller is never reassigned'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_batch_approved(
      '29e10000-0000-0000-0000-000000000014',
      '29e10000-0000-0000-0000-000000000001',
      1
    )
  ),
  'recorded',
  'the legacy-attachment workflow is approved'
);

INSERT INTO public.classifier_import_runs (
  classifier_organization_id,
  classifier_batch_id,
  seller_id
)
VALUES (
  '29e10000-0000-0000-0000-000000000099',
  '29e10000-0000-0000-0000-000000000034',
  '29e10000-0000-0000-0000-000000000001'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.create_or_get_owned_classifier_import(
      '29e10000-0000-0000-0000-000000000014',
      '29e10000-0000-0000-0000-000000000001',
      '29e10000-0000-0000-0000-000000000099',
      '29e10000-0000-0000-0000-000000000034',
      '29e10000-0000-0000-0000-000000000101'
    )
  ),
  'existing',
  'a same-seller legacy source import is attached once'
);

SELECT is(
  (
    SELECT seller_classifier_workflow_id
    FROM public.classifier_import_runs
    WHERE classifier_batch_id =
      '29e10000-0000-0000-0000-000000000034'
  ),
  '29e10000-0000-0000-0000-000000000014'::uuid,
  'legacy attachment stores the immutable workflow binding'
);

SELECT is(
  has_function_privilege(
    'authenticated',
    'public.create_or_get_owned_classifier_import(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'authenticated callers cannot execute owned import coordination directly'
);

SELECT * FROM finish();
ROLLBACK;
