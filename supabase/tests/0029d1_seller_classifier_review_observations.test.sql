BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(12);

INSERT INTO public.sellers (id, slug, name)
VALUES
  (
    '29d10000-0000-0000-0000-000000000001',
    'qa-0029d1-seller-one',
    'QA 0029d1 Seller One'
  ),
  (
    '29d10000-0000-0000-0000-000000000002',
    'qa-0029d1-seller-two',
    'QA 0029d1 Seller Two'
  );

CREATE TEMP TABLE qa_0029d1_workflows (
  ordinal integer PRIMARY KEY,
  workflow_id uuid NOT NULL
);

INSERT INTO qa_0029d1_workflows
SELECT
  ordinal,
  id
FROM (
  SELECT
    ordinal,
    (
      SELECT id
      FROM public.create_or_get_seller_classifier_batch(
        '29d10000-0000-0000-0000-000000000001',
        ('29d10000-0000-0000-0000-' || lpad((10 + ordinal)::text, 12, '0'))::uuid,
        '29d10000-0000-0000-0000-000000000099',
        '29d10000-0000-0000-0000-000000000101',
        'seller'
      )
    ) AS id
  FROM generate_series(1, 4) AS ordinal
) AS created;

DO $$
DECLARE
  workflow record;
BEGIN
  FOR workflow IN
    SELECT *
    FROM qa_0029d1_workflows
    WHERE ordinal <= 3
  LOOP
    PERFORM 1
    FROM public.complete_seller_classifier_batch_provisioning(
      workflow.workflow_id,
      ('29d10000-0000-0000-0000-' || lpad((200 + workflow.ordinal)::text, 12, '0'))::uuid,
      20,
      20971520
    );
  END LOOP;
END;
$$;

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_review_observation(
      (SELECT workflow_id FROM qa_0029d1_workflows WHERE ordinal = 1),
      '29d10000-0000-0000-0000-000000000002',
      'review',
      2
    )
  ),
  'not_found',
  'another seller cannot record a review observation'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_review_observation(
      (SELECT workflow_id FROM qa_0029d1_workflows WHERE ordinal = 1),
      '29d10000-0000-0000-0000-000000000001',
      'review',
      2
    )
  ),
  'recorded',
  'review can recover directly from upload'
);

SELECT results_eq(
  $$
    SELECT last_known_stage, group_count, original_file_count, processed_file_count
    FROM public.seller_classifier_batches
    WHERE id = (
      SELECT workflow_id FROM qa_0029d1_workflows WHERE ordinal = 1
    )
  $$,
  $$ VALUES ('review'::text, 2, 0, 0) $$,
  'review stores the exact group count and preserves image counts'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_review_observation(
      (SELECT workflow_id FROM qa_0029d1_workflows WHERE ordinal = 1),
      '29d10000-0000-0000-0000-000000000001',
      'review',
      3
    )
  ),
  'recorded',
  'same-stage review refreshes the group count'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_review_observation(
      (SELECT workflow_id FROM qa_0029d1_workflows WHERE ordinal = 1),
      '29d10000-0000-0000-0000-000000000001',
      'approved',
      3
    )
  ),
  'recorded',
  'approved advances review'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_review_observation(
      (SELECT workflow_id FROM qa_0029d1_workflows WHERE ordinal = 1),
      '29d10000-0000-0000-0000-000000000001',
      'review',
      4
    )
  ),
  'stale',
  'review cannot regress approved'
);

SELECT results_eq(
  $$
    SELECT last_known_stage, group_count
    FROM public.seller_classifier_batches
    WHERE id = (
      SELECT workflow_id FROM qa_0029d1_workflows WHERE ordinal = 1
    )
  $$,
  $$ VALUES ('approved'::text, 3) $$,
  'a stale observation preserves the approved summary'
);

UPDATE public.seller_classifier_batches
SET last_known_stage = 'importing'
WHERE id = (SELECT workflow_id FROM qa_0029d1_workflows WHERE ordinal = 2);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_review_observation(
      (SELECT workflow_id FROM qa_0029d1_workflows WHERE ordinal = 2),
      '29d10000-0000-0000-0000-000000000001',
      'approved',
      5
    )
  ),
  'stale',
  'review observation cannot regress importing'
);

UPDATE public.seller_classifier_batches
SET
  last_known_stage = 'failed',
  error_code = 'seller_classifier_processing_failed',
  retryable = false
WHERE id = (SELECT workflow_id FROM qa_0029d1_workflows WHERE ordinal = 3);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_review_observation(
      (SELECT workflow_id FROM qa_0029d1_workflows WHERE ordinal = 3),
      '29d10000-0000-0000-0000-000000000001',
      'review',
      1
    )
  ),
  'stale',
  'review observation cannot reopen a failed workflow'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.record_seller_classifier_review_observation(
      (SELECT workflow_id FROM qa_0029d1_workflows WHERE ordinal = 4),
      '29d10000-0000-0000-0000-000000000001',
      'review',
      1
    )
  ),
  'not_ready',
  'review observation requires completed provisioning'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.record_seller_classifier_review_observation(
      (SELECT workflow_id FROM qa_0029d1_workflows WHERE ordinal = 1),
      '29d10000-0000-0000-0000-000000000001',
      'processing',
      1
    )
  $$,
  '22023',
  'seller_classifier_review_observation_invalid',
  'invalid stages are rejected'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.record_seller_classifier_review_observation(
      (SELECT workflow_id FROM qa_0029d1_workflows WHERE ordinal = 1),
      '29d10000-0000-0000-0000-000000000001',
      'review',
      -1
    )
  $$,
  '22023',
  'seller_classifier_review_observation_invalid',
  'negative group counts are rejected'
);

SELECT * FROM finish();
ROLLBACK;
