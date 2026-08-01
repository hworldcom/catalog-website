BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(34);

INSERT INTO public.sellers (id, slug, name, published)
VALUES
  (
    '29a10000-0000-0000-0000-000000000001',
    'qa-0029i1-seller',
    'QA 0029i1 Seller',
    false
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
    '29a10000-0000-0000-0000-000000000011',
    '29a10000-0000-0000-0000-000000000001',
    '29a10000-0000-0000-0000-000000000021',
    '29a10000-0000-0000-0000-000000000099',
    '29a10000-0000-0000-0000-000000000031',
    20,
    20971520,
    'ready',
    'review',
    '29a10000-0000-0000-0000-000000000101',
    'administrator'
  ),
  (
    '29a10000-0000-0000-0000-000000000012',
    '29a10000-0000-0000-0000-000000000001',
    '29a10000-0000-0000-0000-000000000022',
    '29a10000-0000-0000-0000-000000000099',
    '29a10000-0000-0000-0000-000000000032',
    20,
    20971520,
    'ready',
    'review',
    '29a10000-0000-0000-0000-000000000102',
    'seller'
  ),
  (
    '29a10000-0000-0000-0000-000000000013',
    '29a10000-0000-0000-0000-000000000001',
    '29a10000-0000-0000-0000-000000000023',
    '29a10000-0000-0000-0000-000000000099',
    '29a10000-0000-0000-0000-000000000033',
    20,
    20971520,
    'ready',
    'review',
    '29a10000-0000-0000-0000-000000000103',
    'administrator'
  );

CREATE TEMP TABLE qa_action_tokens (
  label text PRIMARY KEY,
  token uuid NOT NULL
) ON COMMIT DROP;

SELECT has_table(
  'public',
  'delegated_administrator_action_attempts',
  'the durable administrator action table exists'
);

SELECT is(
  (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.delegated_administrator_action_attempts'::regclass
  ),
  true,
  'row-level security is enabled'
);

SELECT is(
  has_table_privilege(
    'service_role',
    'public.delegated_administrator_action_attempts',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  true,
  'the service role owns durable action access'
);

SELECT is(
  has_table_privilege(
    'authenticated',
    'public.delegated_administrator_action_attempts',
    'SELECT'
  ),
  false,
  'browser-authenticated callers cannot read audit rows'
);

SELECT is(
  has_function_privilege(
    'service_role',
    'public.claim_delegated_administrator_action(uuid,uuid,uuid,text,uuid,text,integer)',
    'EXECUTE'
  ),
  true,
  'the service role can claim actions'
);

SELECT is(
  has_function_privilege(
    'authenticated',
    'public.claim_delegated_administrator_action(uuid,uuid,uuid,text,uuid,text,integer)',
    'EXECUTE'
  ),
  false,
  'browser-authenticated callers cannot claim actions'
);

SELECT is(
  has_function_privilege(
    'service_role',
    'public.finalize_delegated_administrator_action_success(uuid,uuid)',
    'EXECUTE'
  ),
  true,
  'the service role can finalize success'
);

SELECT is(
  has_function_privilege(
    'service_role',
    'public.finalize_delegated_administrator_action_failure(uuid,uuid,text)',
    'EXECUTE'
  ),
  true,
  'the service role can finalize failure'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.claim_delegated_administrator_action(
      '29a10000-0000-0000-0000-000000000201',
      '29a10000-0000-0000-0000-000000000098',
      '29a10000-0000-0000-0000-000000000101',
      'approve_group',
      '29a10000-0000-0000-0000-000000000301',
      repeat('a', 64),
      120
    )
  ),
  'workflow_not_found',
  'an unknown workflow is non-disclosing'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.delegated_administrator_action_attempts
    WHERE request_id = '29a10000-0000-0000-0000-000000000201'
  ),
  0,
  'an unknown workflow creates no audit row'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.claim_delegated_administrator_action(
      '29a10000-0000-0000-0000-000000000202',
      '29a10000-0000-0000-0000-000000000012',
      '29a10000-0000-0000-0000-000000000101',
      'approve_group',
      '29a10000-0000-0000-0000-000000000301',
      repeat('a', 64),
      120
    )
  ),
  'workflow_not_found',
  'a seller-created workflow is non-disclosing'
);

WITH claimed AS (
  SELECT *
  FROM public.claim_delegated_administrator_action(
    '29a10000-0000-0000-0000-000000000203',
    '29a10000-0000-0000-0000-000000000011',
    '29a10000-0000-0000-0000-000000000101',
    'approve_group',
    '29a10000-0000-0000-0000-000000000301',
    repeat('a', 64),
    120
  )
),
saved AS (
  INSERT INTO qa_action_tokens (label, token)
  SELECT 'success', attempt_token
  FROM claimed
)
SELECT is(
  (SELECT operation_result FROM claimed),
  'claimed',
  'an administrator-created workflow is claimed'
);

SELECT is(
  (
    SELECT seller_id
    FROM public.delegated_administrator_action_attempts
    WHERE request_id = '29a10000-0000-0000-0000-000000000203'
  ),
  '29a10000-0000-0000-0000-000000000001'::uuid,
  'the immutable workflow seller is copied'
);

SELECT results_eq(
  $$
    SELECT status, attempt_count, attempt_token IS NOT NULL, error_code
    FROM public.delegated_administrator_action_attempts
    WHERE request_id = '29a10000-0000-0000-0000-000000000203'
  $$,
  $$
    VALUES ('running'::text, 1, true, NULL::text)
  $$,
  'a first claim has the required running shape'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.claim_delegated_administrator_action(
      '29a10000-0000-0000-0000-000000000203',
      '29a10000-0000-0000-0000-000000000011',
      '29a10000-0000-0000-0000-000000000101',
      'approve_group',
      '29a10000-0000-0000-0000-000000000301',
      repeat('a', 64),
      120
    )
  ),
  'in_progress',
  'a non-expired running action is not reclaimed'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.claim_delegated_administrator_action(
      '29a10000-0000-0000-0000-000000000203',
      '29a10000-0000-0000-0000-000000000011',
      '29a10000-0000-0000-0000-000000000101',
      'approve_group',
      '29a10000-0000-0000-0000-000000000301',
      repeat('b', 64),
      120
    )
  ),
  'request_conflict',
  'changed payload reuse is rejected'
);

SELECT is(
  public.finalize_delegated_administrator_action_success(
    '29a10000-0000-0000-0000-000000000203',
    '29a10000-0000-0000-0000-000000000399'
  ),
  false,
  'a foreign token cannot finalize an action'
);

SELECT is(
  public.finalize_delegated_administrator_action_success(
    '29a10000-0000-0000-0000-000000000203',
    (SELECT token FROM qa_action_tokens WHERE label = 'success')
  ),
  true,
  'the current token finalizes success'
);

SELECT results_eq(
  $$
    SELECT status, attempt_token, completed_at IS NOT NULL, error_code
    FROM public.delegated_administrator_action_attempts
    WHERE request_id = '29a10000-0000-0000-0000-000000000203'
  $$,
  $$
    VALUES ('succeeded'::text, NULL::uuid, true, NULL::text)
  $$,
  'successful finalization has the required terminal shape'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.claim_delegated_administrator_action(
      '29a10000-0000-0000-0000-000000000203',
      '29a10000-0000-0000-0000-000000000011',
      '29a10000-0000-0000-0000-000000000101',
      'approve_group',
      '29a10000-0000-0000-0000-000000000301',
      repeat('a', 64),
      120
    )
  ),
  'succeeded',
  'a successful request replays without a new claim'
);

SELECT is(
  (
    SELECT operation_result
    FROM public.claim_delegated_administrator_action(
      '29a10000-0000-0000-0000-000000000203',
      '29a10000-0000-0000-0000-000000000013',
      '29a10000-0000-0000-0000-000000000101',
      'approve_group',
      '29a10000-0000-0000-0000-000000000301',
      repeat('a', 64),
      120
    )
  ),
  'request_conflict',
  'a request identifier cannot be reused across administrator workflows'
);

WITH claimed AS (
  SELECT *
  FROM public.claim_delegated_administrator_action(
    '29a10000-0000-0000-0000-000000000204',
    '29a10000-0000-0000-0000-000000000011',
    '29a10000-0000-0000-0000-000000000101',
    'approve_and_create_drafts',
    NULL,
    repeat('c', 64),
    120
  )
),
saved AS (
  INSERT INTO qa_action_tokens (label, token)
  SELECT 'failure', attempt_token
  FROM claimed
)
SELECT is(
  (SELECT operation_result FROM claimed),
  'claimed',
  'a second request receives an independent claim'
);

SELECT is(
  public.finalize_delegated_administrator_action_failure(
    '29a10000-0000-0000-0000-000000000204',
    (SELECT token FROM qa_action_tokens WHERE label = 'failure'),
    'delegated_review_not_allowed'
  ),
  true,
  'the current token finalizes a seller-safe failure'
);

SELECT results_eq(
  $$
    SELECT operation_result, error_code
    FROM public.claim_delegated_administrator_action(
      '29a10000-0000-0000-0000-000000000204',
      '29a10000-0000-0000-0000-000000000011',
      '29a10000-0000-0000-0000-000000000101',
      'approve_and_create_drafts',
      NULL,
      repeat('c', 64),
      120
    )
  $$,
  $$
    VALUES ('failed'::text, 'delegated_review_not_allowed'::text)
  $$,
  'a failed request replays its safe error'
);

WITH claimed AS (
  SELECT *
  FROM public.claim_delegated_administrator_action(
    '29a10000-0000-0000-0000-000000000205',
    '29a10000-0000-0000-0000-000000000011',
    '29a10000-0000-0000-0000-000000000101',
    'retry_draft_import',
    '29a10000-0000-0000-0000-000000000401',
    repeat('d', 64),
    120
  )
),
saved AS (
  INSERT INTO qa_action_tokens (label, token)
  SELECT 'expired', attempt_token
  FROM claimed
)
SELECT is(
  (SELECT operation_result FROM claimed),
  'claimed',
  'a retry request is initially claimed'
);

UPDATE public.delegated_administrator_action_attempts
SET claim_started_at = now() - interval '5 minutes'
WHERE request_id = '29a10000-0000-0000-0000-000000000205';

SELECT is(
  (
    SELECT attempt_count
    FROM public.claim_delegated_administrator_action(
      '29a10000-0000-0000-0000-000000000205',
      '29a10000-0000-0000-0000-000000000011',
      '29a10000-0000-0000-0000-000000000101',
      'retry_draft_import',
      '29a10000-0000-0000-0000-000000000401',
      repeat('d', 64),
      120
    )
  ),
  2,
  'an expired running request is reclaimed with a new attempt'
);

SELECT is(
  public.finalize_delegated_administrator_action_success(
    '29a10000-0000-0000-0000-000000000205',
    (SELECT token FROM qa_action_tokens WHERE label = 'expired')
  ),
  false,
  'the expired owner cannot write a late result'
);

SELECT isnt(
  (
    SELECT attempt_token
    FROM public.delegated_administrator_action_attempts
    WHERE request_id = '29a10000-0000-0000-0000-000000000205'
  ),
  (SELECT token FROM qa_action_tokens WHERE label = 'expired'),
  'reclaiming replaces the attempt token'
);

SELECT is(
  public.finalize_delegated_administrator_action_success(
    '29a10000-0000-0000-0000-000000000205',
    (
      SELECT attempt_token
      FROM public.delegated_administrator_action_attempts
      WHERE request_id = '29a10000-0000-0000-0000-000000000205'
    )
  ),
  true,
  'the replacement owner can finalize'
);

SELECT throws_ok(
  $$
    INSERT INTO public.delegated_administrator_action_attempts (
      request_id,
      workflow_id,
      seller_id,
      administrator_user_id,
      action_type,
      target_id,
      request_fingerprint
    )
    VALUES (
      '29a10000-0000-0000-0000-000000000206',
      '29a10000-0000-0000-0000-000000000011',
      '29a10000-0000-0000-0000-000000000001',
      '29a10000-0000-0000-0000-000000000101',
      'approve_group',
      NULL,
      repeat('e', 64)
    )
  $$,
  '23514',
  NULL,
  'the action target shape is enforced'
);

SELECT throws_ok(
  $$
    INSERT INTO public.delegated_administrator_action_attempts (
      request_id,
      workflow_id,
      seller_id,
      administrator_user_id,
      action_type,
      target_id,
      request_fingerprint,
      status,
      attempt_count
    )
    VALUES (
      '29a10000-0000-0000-0000-000000000207',
      '29a10000-0000-0000-0000-000000000011',
      '29a10000-0000-0000-0000-000000000001',
      '29a10000-0000-0000-0000-000000000101',
      'approve_group',
      '29a10000-0000-0000-0000-000000000301',
      repeat('f', 64),
      'running',
      1
    )
  $$,
  '23514',
  NULL,
  'the running status shape requires a token and claim time'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.claim_delegated_administrator_action(
      '29a10000-0000-0000-0000-000000000208',
      '29a10000-0000-0000-0000-000000000011',
      '29a10000-0000-0000-0000-000000000101',
      'approve_group',
      '29a10000-0000-0000-0000-000000000301',
      'not-a-fingerprint',
      120
    )
  $$,
  '22023',
  'delegated_action_claim_invalid',
  'the database rejects malformed fingerprints'
);

SELECT is(
  has_function_privilege(
    'authenticated',
    'public.finalize_delegated_administrator_action_success(uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'browser-authenticated callers cannot finalize success'
);

SELECT is(
  has_function_privilege(
    'authenticated',
    'public.finalize_delegated_administrator_action_failure(uuid,uuid,text)',
    'EXECUTE'
  ),
  false,
  'browser-authenticated callers cannot finalize failure'
);

SELECT * FROM finish();
ROLLBACK;
