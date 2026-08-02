BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(19);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES
  (
    '29000000-0000-0000-0000-000000000001',
    'qa-0029b-seller-one',
    'QA 0029b Seller One',
    'Q11'
  ),
  (
    '29000000-0000-0000-0000-000000000002',
    'qa-0029b-seller-two',
    'QA 0029b Seller Two',
    'Q12'
  );

CREATE TEMP TABLE qa_0029b_first AS
SELECT *
FROM public.create_or_get_seller_classifier_batch(
  '29000000-0000-0000-0000-000000000001',
  '29000000-0000-0000-0000-000000000011',
  '29000000-0000-0000-0000-000000000099',
  '29000000-0000-0000-0000-000000000101',
  'seller'
);

SELECT is(
  (SELECT operation_result FROM qa_0029b_first),
  'created',
  'the first seller request creates an owned workflow'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.create_or_get_seller_classifier_batch(
      '29000000-0000-0000-0000-000000000001',
      '29000000-0000-0000-0000-000000000011',
      '29000000-0000-0000-0000-000000000099',
      '29000000-0000-0000-0000-000000000102',
      'seller'
    )
  ),
  'existing',
  'the same seller request is idempotent'
);

SELECT is(
  (
    SELECT initiated_by_user_id
    FROM public.seller_classifier_batches
    WHERE id = (SELECT id FROM qa_0029b_first)
  ),
  '29000000-0000-0000-0000-000000000101'::uuid,
  'an idempotent replay cannot replace the initiating user'
);

CREATE TEMP TABLE qa_0029b_second_seller AS
SELECT *
FROM public.create_or_get_seller_classifier_batch(
  '29000000-0000-0000-0000-000000000002',
  '29000000-0000-0000-0000-000000000011',
  '29000000-0000-0000-0000-000000000099',
  '29000000-0000-0000-0000-000000000202',
  'seller'
);

SELECT isnt(
  (SELECT id FROM qa_0029b_second_seller),
  (SELECT id FROM qa_0029b_first),
  'two sellers may reuse a browser request identifier without sharing ownership'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.complete_seller_classifier_batch_provisioning(
      (SELECT id FROM qa_0029b_first),
      '29000000-0000-0000-0000-000000000301',
      20,
      20971520
    )
  ),
  'completed',
  'classifier provisioning establishes the immutable remote batch and limits'
);

SELECT results_eq(
  $$
    SELECT provisioning_status, last_known_stage, error_code, retryable
    FROM public.seller_classifier_batches
    WHERE id = (SELECT id FROM qa_0029b_first)
  $$,
  $$
    VALUES ('ready'::text, 'upload'::text, NULL::text, false)
  $$,
  'a completed workflow is ready for upload without an error'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.complete_seller_classifier_batch_provisioning(
      (SELECT id FROM qa_0029b_first),
      '29000000-0000-0000-0000-000000000301',
      20,
      20971520
    )
  ),
  'ready',
  'the exact completion can be replayed'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.complete_seller_classifier_batch_provisioning(
      (SELECT id FROM qa_0029b_first),
      '29000000-0000-0000-0000-000000000302',
      20,
      20971520
    )
  ),
  'conflict',
  'a conflicting remote batch cannot replace the established batch'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.fail_seller_classifier_batch_provisioning(
      (SELECT id FROM qa_0029b_first),
      'seller_classifier_unavailable',
      true
    )
  ),
  'ready',
  'a late failure cannot replace successful provisioning'
);

SELECT throws_ok(
  $$
    UPDATE public.seller_classifier_batches
    SET seller_id = '29000000-0000-0000-0000-000000000002'
    WHERE id = (SELECT id FROM qa_0029b_first)
  $$,
  '23514',
  'seller_classifier_batch_immutable',
  'seller ownership is immutable'
);

CREATE TEMP TABLE qa_0029b_retryable AS
SELECT *
FROM public.create_or_get_seller_classifier_batch(
  '29000000-0000-0000-0000-000000000001',
  '29000000-0000-0000-0000-000000000012',
  '29000000-0000-0000-0000-000000000099',
  '29000000-0000-0000-0000-000000000101',
  'seller'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.fail_seller_classifier_batch_provisioning(
      (SELECT id FROM qa_0029b_retryable),
      'seller_classifier_unavailable',
      true
    )
  ),
  'failed',
  'a bounded transport failure persists retry permission'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.claim_seller_classifier_batch_provisioning_retry(
      (SELECT id FROM qa_0029b_retryable),
      '29000000-0000-0000-0000-000000000002'
    )
  ),
  'not_found',
  'another seller cannot discover a retryable workflow'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.claim_seller_classifier_batch_provisioning_retry(
      (SELECT id FROM qa_0029b_retryable),
      '29000000-0000-0000-0000-000000000001'
    )
  ),
  'claimed',
  'the owning seller atomically claims a retry'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.claim_seller_classifier_batch_provisioning_retry(
      (SELECT id FROM qa_0029b_retryable),
      '29000000-0000-0000-0000-000000000001'
    )
  ),
  'in_progress',
  'a concurrent retry cannot issue another classifier request'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.complete_seller_classifier_batch_provisioning(
      (SELECT id FROM qa_0029b_retryable),
      '29000000-0000-0000-0000-000000000303',
      20,
      20971520
    )
  ),
  'completed',
  'a claimed retry can recover the remote batch'
);

CREATE TEMP TABLE qa_0029b_nonretryable AS
SELECT *
FROM public.create_or_get_seller_classifier_batch(
  '29000000-0000-0000-0000-000000000001',
  '29000000-0000-0000-0000-000000000013',
  '29000000-0000-0000-0000-000000000099',
  '29000000-0000-0000-0000-000000000101',
  'seller'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.fail_seller_classifier_batch_provisioning(
      (SELECT id FROM qa_0029b_nonretryable),
      'seller_classifier_unavailable',
      false
    )
  ),
  'failed',
  'a non-retryable classifier response persists a terminal failure'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.claim_seller_classifier_batch_provisioning_retry(
      (SELECT id FROM qa_0029b_nonretryable),
      '29000000-0000-0000-0000-000000000001'
    )
  ),
  'not_retryable',
  'a terminal provisioning failure cannot be claimed'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.seller_classifier_batches', 'SELECT')
  AND NOT has_table_privilege(
    'authenticated',
    'public.seller_classifier_batches',
    'SELECT'
  ),
  'browser database roles cannot read classifier ownership rows'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_or_get_seller_classifier_batch(uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.claim_seller_classifier_batch_provisioning_retry(uuid,uuid)',
    'EXECUTE'
  ),
  'browser database roles cannot execute ownership functions'
);

SELECT * FROM finish();

ROLLBACK;
