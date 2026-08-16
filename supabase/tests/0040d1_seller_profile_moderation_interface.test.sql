BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(16);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.read_seller_profile_moderation_snapshot(uuid)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.read_seller_profile_moderation_snapshot(uuid)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'service_role',
      'public.seller_profile_moderation_media_preview(uuid,uuid,text)',
      'EXECUTE'
    ),
  'the snapshot is service-only and its media helper is not callable directly'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.set_seller_storefront_enabled(uuid,boolean,uuid,uuid)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.set_seller_storefront_enabled(uuid,boolean,uuid,uuid)',
      'EXECUTE'
    ),
  'storefront preference changes remain service-only'
);

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
VALUES
  (
    '40d10000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'qa-0040d1-owner@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '40d10000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'qa-0040d1-admin@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

CREATE TEMP TABLE qa_0040d1_seller AS
SELECT *
FROM public.create_seller_with_company_code(
  '40d10000-0000-4000-8000-000000000001',
  'Snapshot Seller',
  'snapshot-seller',
  'Berlin',
  'Germany',
  (SELECT id FROM public.categories WHERE slug = 'fashion'),
  NULL,
  'SNP'
);

CREATE TEMP TABLE qa_0040d1_initial_state AS
SELECT
  working_copy.updated_at,
  public.read_seller_profile_moderation_snapshot(seller.id) AS snapshot
FROM qa_0040d1_seller AS seller
JOIN public.seller_profile_working_copies AS working_copy
  ON working_copy.seller_id = seller.id;

SELECT is(
  (SELECT snapshot->>'approvalState' FROM qa_0040d1_initial_state),
  'not_approved',
  'a new seller snapshot separates approval from storefront preference'
);

SELECT is(
  (SELECT snapshot->'approvedProfile' FROM qa_0040d1_initial_state),
  'null'::jsonb,
  'a new seller has no approved immutable profile'
);

SELECT ok(
  (SELECT (snapshot->'actions'->>'canEdit')::boolean FROM qa_0040d1_initial_state)
    AND (SELECT (snapshot->'actions'->>'canSubmit')::boolean FROM qa_0040d1_initial_state)
    AND NOT (SELECT (snapshot->'actions'->>'canWithdraw')::boolean FROM qa_0040d1_initial_state)
    AND NOT (SELECT (snapshot->'actions'->>'canEnableStorefront')::boolean FROM qa_0040d1_initial_state),
  'a new seller may edit and submit but cannot withdraw or enable a storefront'
);

SELECT ok(
  public.read_seller_profile_moderation_snapshot((SELECT id FROM qa_0040d1_seller)) IS NOT NULL
    AND (
      SELECT working_copy.updated_at = initial.updated_at
      FROM public.seller_profile_working_copies AS working_copy
      CROSS JOIN qa_0040d1_initial_state AS initial
      WHERE working_copy.seller_id = (SELECT id FROM qa_0040d1_seller)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.seller_profile_submissions
      WHERE seller_id = (SELECT id FROM qa_0040d1_seller)
    ),
  're-reading the snapshot creates no rows and updates no working-copy state'
);

CREATE TEMP TABLE qa_0040d1_initial_submission AS
SELECT *
FROM public.submit_seller_profile_working_copy(
  (SELECT id FROM qa_0040d1_seller),
  1,
  '40d10000-0000-4000-8000-000000000101',
  '40d10000-0000-4000-8000-000000000001'
);

CREATE TEMP TABLE qa_0040d1_pending_state AS
SELECT public.read_seller_profile_moderation_snapshot(id) AS snapshot
FROM qa_0040d1_seller;

SELECT results_eq(
  $$
    SELECT snapshot->'latestSubmission'->>'status',
           (snapshot->'latestSubmission'->>'revision')::bigint
    FROM qa_0040d1_pending_state
  $$,
  $$ VALUES ('pending'::text, 1::bigint) $$,
  'the latest immutable submission is visible in the snapshot'
);

SELECT ok(
  NOT (SELECT (snapshot->'actions'->>'canEdit')::boolean FROM qa_0040d1_pending_state)
    AND NOT (SELECT (snapshot->'actions'->>'canSubmit')::boolean FROM qa_0040d1_pending_state)
    AND (SELECT (snapshot->'actions'->>'canWithdraw')::boolean FROM qa_0040d1_pending_state),
  'a pending submission locks edits and permits withdrawal'
);

CREATE TEMP TABLE qa_0040d1_approved_submission AS
SELECT *
FROM public.decide_seller_profile_submission(
  (SELECT id FROM qa_0040d1_seller),
  (SELECT id FROM qa_0040d1_initial_submission),
  1,
  'approve',
  NULL,
  '40d10000-0000-4000-8000-000000000102',
  '40d10000-0000-4000-8000-000000000002'
);

CREATE TEMP TABLE qa_0040d1_approved_state AS
SELECT public.read_seller_profile_moderation_snapshot(id) AS snapshot
FROM qa_0040d1_seller;

SELECT results_eq(
  $$
    SELECT snapshot->'approvedProfile'->>'submissionId',
           snapshot->'approvedProfile'->>'name'
    FROM qa_0040d1_approved_state
  $$,
  $$
    SELECT id::text, 'Snapshot Seller'::text
    FROM qa_0040d1_initial_submission
  $$,
  'the approved profile is selected by the seller approved-submission pointer'
);

SELECT ok(
  (SELECT snapshot->>'approvalState' = 'approved_storefront_disabled' FROM qa_0040d1_approved_state)
    AND (SELECT (snapshot->'actions'->>'canEdit')::boolean FROM qa_0040d1_approved_state)
    AND (SELECT (snapshot->'actions'->>'canEnableStorefront')::boolean FROM qa_0040d1_approved_state),
  'approval permits a new private edit and a separate storefront enable action'
);

CREATE TEMP TABLE qa_0040d1_update_working_copy AS
SELECT *
FROM public.save_seller_profile_working_copy(
  (SELECT id FROM qa_0040d1_seller),
  2,
  'Updated Snapshot Seller',
  'updated-snapshot-seller',
  'Hamburg',
  'Germany',
  NULL,
  NULL,
  'Private update',
  NULL,
  NULL,
  NULL
);

CREATE TEMP TABLE qa_0040d1_update_submission AS
SELECT *
FROM public.submit_seller_profile_working_copy(
  (SELECT id FROM qa_0040d1_seller),
  3,
  '40d10000-0000-4000-8000-000000000103',
  '40d10000-0000-4000-8000-000000000001'
);

CREATE TEMP TABLE qa_0040d1_update_state AS
SELECT public.read_seller_profile_moderation_snapshot(id) AS snapshot
FROM qa_0040d1_seller;

SELECT results_eq(
  $$
    SELECT snapshot->'latestSubmission'->>'id',
           snapshot->'latestSubmission'->>'kind',
           snapshot->'approvedProfile'->>'name'
    FROM qa_0040d1_update_state
  $$,
  $$
    SELECT update_submission.id::text, 'update'::text, 'Snapshot Seller'::text
    FROM qa_0040d1_update_submission AS update_submission
  $$,
  'a newer pending update does not replace the approved public snapshot'
);

SELECT results_eq(
  $$
    SELECT result, storefront_enabled
    FROM public.set_seller_storefront_enabled(
      (SELECT id FROM qa_0040d1_seller),
      true,
      '40d10000-0000-4000-8000-000000000104',
      '40d10000-0000-4000-8000-000000000001'
    )
  $$,
  $$ VALUES ('recorded'::text, true) $$,
  'the initial storefront enable returns a recorded receipt'
);

SELECT results_eq(
  $$
    SELECT result, storefront_enabled
    FROM public.set_seller_storefront_enabled(
      (SELECT id FROM qa_0040d1_seller),
      false,
      '40d10000-0000-4000-8000-000000000105',
      '40d10000-0000-4000-8000-000000000001'
    )
  $$,
  $$ VALUES ('recorded'::text, false) $$,
  'a later storefront disable returns its own recorded receipt'
);

SELECT results_eq(
  $$
    SELECT result, storefront_enabled
    FROM public.set_seller_storefront_enabled(
      (SELECT id FROM qa_0040d1_seller),
      true,
      '40d10000-0000-4000-8000-000000000104',
      '40d10000-0000-4000-8000-000000000001'
    )
  $$,
  $$ VALUES ('replay'::text, true) $$,
  'replaying the old enable returns its immutable original receipt'
);

SELECT is(
  (SELECT storefront_enabled FROM public.sellers WHERE id = (SELECT id FROM qa_0040d1_seller)),
  false,
  'replaying an old request does not overwrite the newer storefront preference'
);

SELECT throws_ok(
  pg_catalog.format(
    'SELECT * FROM public.set_seller_storefront_enabled(%L, false, %L, %L)',
    (SELECT id FROM qa_0040d1_seller),
    '40d10000-0000-4000-8000-000000000104',
    '40d10000-0000-4000-8000-000000000001'
  ),
  '23505',
  'seller_approval_submission_conflict',
  'reusing a request identifier for a different preference is rejected'
);

SELECT * FROM finish();
ROLLBACK;
