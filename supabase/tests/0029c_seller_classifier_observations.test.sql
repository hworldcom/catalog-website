BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(16);

INSERT INTO public.sellers (id, slug, name)
VALUES
  (
    '29c00000-0000-0000-0000-000000000001',
    'qa-0029c-seller-one',
    'QA 0029c Seller One'
  ),
  (
    '29c00000-0000-0000-0000-000000000002',
    'qa-0029c-seller-two',
    'QA 0029c Seller Two'
  );

CREATE TEMP TABLE qa_0029c_workflows (
  ordinal integer PRIMARY KEY,
  workflow_id uuid NOT NULL
);

INSERT INTO qa_0029c_workflows
SELECT
  1,
  id
FROM public.create_or_get_seller_classifier_batch(
  '29c00000-0000-0000-0000-000000000001',
  '29c00000-0000-0000-0000-000000000011',
  '29c00000-0000-0000-0000-000000000099',
  '29c00000-0000-0000-0000-000000000101',
  'seller'
);

DO $$
BEGIN
  PERFORM 1
  FROM public.complete_seller_classifier_batch_provisioning(
    (SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 1),
    '29c00000-0000-0000-0000-000000000201',
    20,
    10485760
  );
END;
$$;

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_batch_observation(
      (SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 1),
      '29c00000-0000-0000-0000-000000000002',
      'upload',
      'upload',
      2,
      0,
      NULL,
      false
    )
  ),
  'not_found',
  'another seller cannot record an observation'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_batch_observation(
      (SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 1),
      '29c00000-0000-0000-0000-000000000001',
      'upload',
      'upload',
      2,
      0,
      NULL,
      false
    )
  ),
  'recorded',
  'the owner records an upload observation'
);

SELECT results_eq(
  $$
    SELECT original_file_count, processed_file_count
    FROM public.seller_classifier_batches
    WHERE id = (
      SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 1
    )
  $$,
  $$ VALUES (2, 0) $$,
  'upload counts are durable'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_batch_observation(
      (SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 1),
      '29c00000-0000-0000-0000-000000000001',
      'processing',
      'processing',
      2,
      1,
      NULL,
      false
    )
  ),
  'recorded',
  'processing advances the workflow'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_batch_observation(
      (SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 1),
      '29c00000-0000-0000-0000-000000000001',
      'upload',
      'upload',
      2,
      0,
      NULL,
      false
    )
  ),
  'stale',
  'an older upload response cannot regress processing'
);

SELECT results_eq(
  $$
    SELECT last_known_stage, processed_file_count
    FROM public.seller_classifier_batches
    WHERE id = (
      SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 1
    )
  $$,
  $$ VALUES ('processing'::text, 1) $$,
  'the newer processing stage and count are preserved'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_batch_observation(
      (SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 1),
      '29c00000-0000-0000-0000-000000000001',
      'processing',
      'review',
      2,
      2,
      NULL,
      false
    )
  ),
  'recorded',
  'review advances the workflow'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_batch_observation(
      (SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 1),
      '29c00000-0000-0000-0000-000000000001',
      'processing',
      'failed',
      2,
      2,
      'seller_classifier_processing_failed',
      false
    )
  ),
  'stale',
  'a late failure cannot replace review'
);

INSERT INTO qa_0029c_workflows
SELECT
  2,
  id
FROM public.create_or_get_seller_classifier_batch(
  '29c00000-0000-0000-0000-000000000001',
  '29c00000-0000-0000-0000-000000000012',
  '29c00000-0000-0000-0000-000000000099',
  '29c00000-0000-0000-0000-000000000101',
  'seller'
);

DO $$
BEGIN
  PERFORM 1
  FROM public.complete_seller_classifier_batch_provisioning(
    (SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 2),
    '29c00000-0000-0000-0000-000000000202',
    20,
    10485760
  );
END;
$$;

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_batch_observation(
      (SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 2),
      '29c00000-0000-0000-0000-000000000001',
      'processing',
      'failed',
      1,
      0,
      'seller_classifier_processing_failed',
      false
    )
  ),
  'recorded',
  'a downstream failure is valid after provisioning'
);

SELECT results_eq(
  $$
    SELECT provisioning_status, last_known_stage, error_code, retryable
    FROM public.seller_classifier_batches
    WHERE id = (
      SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 2
    )
  $$,
  $$
    VALUES (
      'ready'::text,
      'failed'::text,
      'seller_classifier_processing_failed'::text,
      false
    )
  $$,
  'a ready workflow retains its downstream terminal error'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_batch_observation(
      (SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 2),
      '29c00000-0000-0000-0000-000000000001',
      'processing_retry',
      'processing',
      1,
      0,
      NULL,
      false
    )
  ),
  'stale',
  'a non-retryable failure cannot be reopened'
);

INSERT INTO qa_0029c_workflows
SELECT
  3,
  id
FROM public.create_or_get_seller_classifier_batch(
  '29c00000-0000-0000-0000-000000000001',
  '29c00000-0000-0000-0000-000000000013',
  '29c00000-0000-0000-0000-000000000099',
  '29c00000-0000-0000-0000-000000000101',
  'seller'
);

DO $$
BEGIN
  PERFORM 1
  FROM public.complete_seller_classifier_batch_provisioning(
    (SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 3),
    '29c00000-0000-0000-0000-000000000203',
    20,
    10485760
  );
END;
$$;

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_batch_observation(
      (SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 3),
      '29c00000-0000-0000-0000-000000000001',
      'processing',
      'failed',
      1,
      0,
      'seller_classifier_processing_failed',
      true
    )
  ),
  'recorded',
  'an explicitly retryable downstream failure is durable'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_batch_observation(
      (SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 3),
      '29c00000-0000-0000-0000-000000000001',
      'processing_retry',
      'processing',
      1,
      0,
      NULL,
      false
    )
  ),
  'recorded',
  'an explicit processing retry reopens an eligible failure'
);

SELECT results_eq(
  $$
    SELECT last_known_stage, error_code, retryable
    FROM public.seller_classifier_batches
    WHERE id = (
      SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 3
    )
  $$,
  $$ VALUES ('processing'::text, NULL::text, false) $$,
  'retry clears the downstream error and retry flag'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.record_seller_classifier_batch_observation(
      (SELECT workflow_id FROM qa_0029c_workflows WHERE ordinal = 3),
      '29c00000-0000-0000-0000-000000000001',
      'processing',
      'processing',
      1,
      2,
      NULL,
      false
    )
  $$,
  '22023',
  'seller_classifier_batch_observation_invalid',
  'impossible counts are rejected'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.record_seller_classifier_batch_observation(uuid,uuid,text,text,integer,integer,text,boolean)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.record_seller_classifier_batch_observation(uuid,uuid,text,text,integer,integer,text,boolean)',
    'EXECUTE'
  ),
  'browser database roles cannot record observations'
);

SELECT * FROM finish();

ROLLBACK;
