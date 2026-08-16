BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(39);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '40c2b000-0000-4000-8000-000000000001',
  'qa-0040c2b-recovery',
  'QA 0040c2b Recovery',
  'Q2B'
);
SELECT pg_temp.approve_fixture_seller('40c2b000-0000-4000-8000-000000000001');
UPDATE public.sellers
SET owner_id = '40000000-0000-4000-8000-000000000001'
WHERE id = '40c2b000-0000-4000-8000-000000000001';

SELECT is(
  has_table_privilege('authenticated', 'public.product_activation_recovery_requests', 'SELECT'),
  false,
  'browser roles cannot read the recovery request ledger'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.retry_product_activation_run(uuid,integer,uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'browser roles cannot retry activation directly'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.request_product_activation_abandonment(uuid,integer,uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'browser roles cannot request abandonment directly'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.claim_product_activation_cleanup(uuid,integer,integer,uuid)',
    'EXECUTE'
  ),
  false,
  'browser roles cannot claim cleanup work'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.record_product_activation_cleanup_item_result(uuid,integer,uuid,text,text,text)',
    'EXECUTE'
  ),
  false,
  'browser roles cannot record cleanup results'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.finalize_product_activation_cleanup(uuid,integer,uuid)',
    'EXECUTE'
  ),
  false,
  'browser roles cannot finalize cleanup'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.retry_product_activation_cleanup(uuid,integer,uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'browser roles cannot retry cleanup directly'
);

CREATE FUNCTION pg_temp.create_activation_fixture(
  p_title text,
  p_image_id uuid,
  p_client_upload_id uuid
)
RETURNS TABLE (product_id uuid, submission_id uuid, run_id uuid, attempt_token uuid)
LANGUAGE plpgsql
AS $$
DECLARE
  draft record;
  submission record;
  approval record;
  claim jsonb;
BEGIN
  SELECT * INTO draft
  FROM public.save_initial_product_draft_with_description(
    NULL,
    '40c2b000-0000-4000-8000-000000000001',
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
    content_type, size_bytes, storage_bucket, source_kind,
    client_upload_id, original_filename
  ) VALUES (
    p_image_id, draft.product_draft_id, 0, 'available',
    'product-drafts/qa/' || p_image_id::text || '.jpg',
    'image/jpeg', 100, 'product-draft-images', 'seller_upload',
    p_client_upload_id, p_title || '.jpg'
  );
  UPDATE public.products
  SET cover_image_id = p_image_id
  WHERE id = draft.product_draft_id;

  SELECT * INTO submission
  FROM public.submit_product_moderation(
    draft.product_draft_id,
    '40c2b000-0000-4000-8000-000000000001',
    (SELECT moderation_revision FROM public.products WHERE id = draft.product_draft_id),
    gen_random_uuid(),
    '40000000-0000-4000-8000-000000000001'
  );
  SELECT * INTO approval
  FROM public.decide_product_moderation_submission(
    submission.id,
    submission.revision,
    'approve',
    NULL,
    gen_random_uuid(),
    '40000000-0000-4000-8000-000000000001'
  );
  PERFORM public.record_product_activation_dispatch_result(
    approval.activation_run_id, approval.dispatch_generation, 'dispatched'
  );
  claim := public.claim_product_activation_run(
    approval.activation_run_id, approval.dispatch_generation, 360
  );

  RETURN QUERY SELECT
    draft.product_draft_id,
    submission.id,
    approval.activation_run_id,
    (claim ->> 'attemptToken')::uuid;
END;
$$;

CREATE TEMP TABLE retry_fixture AS
SELECT * FROM pg_temp.create_activation_fixture(
  'Retry activation shirt',
  '40c2b000-0000-4000-8000-000000000101',
  '40c2b000-0000-4000-8000-000000000201'
);

SELECT is(
  public.fail_product_activation_attempt(
    (SELECT run_id FROM retry_fixture), 1, (SELECT attempt_token FROM retry_fixture),
    '40c2b000-0000-4000-8000-000000000101',
    'product_publication_source_unavailable'
  ),
  'failed_retryable',
  'temporary source failure is durably retryable'
);

CREATE TEMP TABLE activation_retry AS
SELECT * FROM public.retry_product_activation_run(
  (SELECT run_id FROM retry_fixture),
  1,
  '40c2b000-0000-4000-8000-000000000301',
  '40000000-0000-4000-8000-000000000001'
);

SELECT results_eq(
  $$ SELECT result, phase, status, dispatch_generation, dispatch_status, dispatch_required
     FROM activation_retry $$,
  $$ VALUES ('recorded'::text, 'activation'::text, 'pending'::text, 2, 'pending'::text, true) $$,
  'activation retry advances exactly one pending dispatch generation'
);
SELECT is(
  (SELECT status FROM public.product_image_publication_items
   WHERE run_id = (SELECT run_id FROM retry_fixture)),
  'pending',
  'activation retry resets the failed item without replacing the manifest'
);
SELECT is(
  (SELECT result FROM public.retry_product_activation_run(
    (SELECT run_id FROM retry_fixture), 1,
    '40c2b000-0000-4000-8000-000000000301',
    '40000000-0000-4000-8000-000000000001'
  )),
  'replay',
  'an exact activation retry request replays'
);
SELECT is(
  public.fail_product_activation_attempt(
    (SELECT run_id FROM retry_fixture), 1, (SELECT attempt_token FROM retry_fixture),
    '40c2b000-0000-4000-8000-000000000101',
    'product_publication_source_unavailable'
  ),
  'stale',
  'late failure from the prior activation generation is harmless'
);
SELECT is(
  (SELECT dispatch_status FROM public.record_product_activation_dispatch_result(
    (SELECT run_id FROM retry_fixture), 2, 'dispatched'
  )),
  'dispatched',
  'the retry generation can be dispatched after commit'
);

CREATE TEMP TABLE retry_claim AS
SELECT public.claim_product_activation_run(
  (SELECT run_id FROM retry_fixture), 2, 360
) AS payload;
SELECT is(
  (SELECT payload ->> 'result' FROM retry_claim),
  'claimed',
  'the retry generation receives a fresh activation claim'
);
SELECT is(
  public.fail_product_activation_attempt(
    (SELECT run_id FROM retry_fixture), 2,
    (SELECT (payload ->> 'attemptToken')::uuid FROM retry_claim),
    '40c2b000-0000-4000-8000-000000000101',
    'product_publication_source_changed'
  ),
  'failed_non_retryable',
  'source change is a non-retryable activation failure'
);
SELECT throws_ok(
  format(
    'SELECT * FROM public.retry_product_activation_run(%L, 2, %L, %L)',
    (SELECT run_id FROM retry_fixture),
    '40c2b000-0000-4000-8000-000000000302',
    '40000000-0000-4000-8000-000000000001'
  ),
  '55000',
  'product_moderation_activation_not_retryable',
  'a non-retryable failure cannot be restarted'
);
SELECT is(
  (SELECT status FROM public.request_product_activation_abandonment(
    (SELECT run_id FROM retry_fixture), 2,
    '40c2b000-0000-4000-8000-000000000303',
    '40c2b000-0000-4000-8000-000000000001'
  )),
  'abandoned',
  'abandonment without owned destinations completes atomically'
);
SELECT is(
  (SELECT active_moderation_submission_id FROM public.products
   WHERE id = (SELECT product_id FROM retry_fixture)),
  NULL::uuid,
  'completed abandonment unlocks the private product revision'
);

CREATE TEMP TABLE cleanup_fixture AS
SELECT * FROM pg_temp.create_activation_fixture(
  'Cleanup activation shirt',
  '40c2b000-0000-4000-8000-000000000102',
  '40c2b000-0000-4000-8000-000000000202'
);

SELECT is(
  public.record_product_activation_object_created(
    (SELECT run_id FROM cleanup_fixture), 1, (SELECT attempt_token FROM cleanup_fixture),
    '40c2b000-0000-4000-8000-000000000102', repeat('a', 64), 100,
    repeat('a', 64), '"cleanup-etag"', 'https://example.test/cleanup.jpg'
  ),
  'recorded',
  'the failed run records ownership of an uncommitted destination'
);
SELECT is(
  public.fail_product_activation_attempt(
    (SELECT run_id FROM cleanup_fixture), 1, (SELECT attempt_token FROM cleanup_fixture),
    '40c2b000-0000-4000-8000-000000000102',
    'product_publication_verification_failed'
  ),
  'failed_retryable',
  'verification failure leaves the owned destination recoverable'
);

CREATE TEMP TABLE abandonment AS
SELECT * FROM public.request_product_activation_abandonment(
  (SELECT run_id FROM cleanup_fixture), 1,
  '40c2b000-0000-4000-8000-000000000304',
  '40c2b000-0000-4000-8000-000000000001'
);
SELECT results_eq(
  $$ SELECT phase, status, dispatch_generation, dispatch_required FROM abandonment $$,
  $$ VALUES ('pre_switch_cleanup'::text, 'pending'::text, 2, true) $$,
  'owned abandonment transitions one way into pending pre-switch cleanup'
);
SELECT is(
  (SELECT count(*)::integer FROM public.product_activation_cleanup_items
   WHERE run_id = (SELECT run_id FROM cleanup_fixture)),
  1,
  'abandonment creates one immutable cleanup row from recorded ownership'
);
SELECT is(
  (SELECT dispatch_status FROM public.record_product_activation_dispatch_result(
    (SELECT run_id FROM cleanup_fixture), 2, 'dispatched'
  )),
  'dispatched',
  'pre-switch cleanup is dispatched through the shared adapter contract'
);

CREATE TEMP TABLE cleanup_claim AS
SELECT public.claim_product_activation_cleanup(
  (SELECT run_id FROM cleanup_fixture), 2, 360, NULL
) AS payload;
SELECT is(
  (SELECT payload ->> 'phase' FROM cleanup_claim),
  'pre_switch_cleanup',
  'cleanup claim cannot return to activation work'
);
SELECT is(
  public.record_product_activation_cleanup_item_result(
    (SELECT run_id FROM cleanup_fixture), 2,
    (SELECT (payload ->> 'attemptToken')::uuid FROM cleanup_claim),
    (SELECT destination_key FROM public.product_activation_cleanup_items
     WHERE run_id = (SELECT run_id FROM cleanup_fixture)),
    'failed', 'product_activation_cleanup_destination_conflict'
  ),
  'failed',
  'metadata conflict is durably recorded without declaring deletion'
);
SELECT is(
  public.finalize_product_activation_cleanup(
    (SELECT run_id FROM cleanup_fixture), 2,
    (SELECT (payload ->> 'attemptToken')::uuid FROM cleanup_claim)
  ),
  'cleanup_required',
  'failed cleanup closes the claim as cleanup required'
);
SELECT is(
  (SELECT status FROM public.product_activation_cleanup_items
   WHERE run_id = (SELECT run_id FROM cleanup_fixture)),
  'failed',
  'a conflicting destination remains unresolved'
);

CREATE TEMP TABLE cleanup_retry AS
SELECT * FROM public.retry_product_activation_cleanup(
  (SELECT run_id FROM cleanup_fixture), 2,
  '40c2b000-0000-4000-8000-000000000305',
  '40000000-0000-4000-8000-000000000001'
);
SELECT results_eq(
  $$ SELECT result, status, dispatch_generation, dispatch_required FROM cleanup_retry $$,
  $$ VALUES ('recorded'::text, 'pending'::text, 3, true) $$,
  'the owning seller can explicitly retry pre-switch cleanup'
);
SELECT is(
  (SELECT dispatch_status FROM public.record_product_activation_dispatch_result(
    (SELECT run_id FROM cleanup_fixture), 3, 'dispatched'
  )),
  'dispatched',
  'cleanup retry dispatches only its new generation'
);

CREATE TEMP TABLE cleanup_retry_claim AS
SELECT public.claim_product_activation_cleanup(
  (SELECT run_id FROM cleanup_fixture), 3, 360, NULL
) AS payload;
SELECT is(
  (SELECT jsonb_array_length(payload -> 'cleanupItems') FROM cleanup_retry_claim),
  1,
  'cleanup retry retains the same unresolved destination manifest'
);
SELECT is(
  public.record_product_activation_cleanup_item_result(
    (SELECT run_id FROM cleanup_fixture), 3,
    (SELECT (payload ->> 'attemptToken')::uuid FROM cleanup_retry_claim),
    (SELECT destination_key FROM public.product_activation_cleanup_items
     WHERE run_id = (SELECT run_id FROM cleanup_fixture)),
    'completed', NULL
  ),
  'completed',
  'a missing or verified-and-deleted object can complete cleanup'
);
SELECT is(
  public.finalize_product_activation_cleanup(
    (SELECT run_id FROM cleanup_fixture), 3,
    (SELECT (payload ->> 'attemptToken')::uuid FROM cleanup_retry_claim)
  ),
  'abandoned',
  'successful pre-switch cleanup terminates only as abandoned'
);
SELECT is(
  (SELECT active_moderation_submission_id FROM public.products
   WHERE id = (SELECT product_id FROM cleanup_fixture)),
  NULL::uuid,
  'cleanup completion clears the active submission pointer'
);
SELECT is(
  (SELECT result FROM public.retry_product_activation_cleanup(
    (SELECT run_id FROM cleanup_fixture), 2,
    '40c2b000-0000-4000-8000-000000000305',
    '40000000-0000-4000-8000-000000000001'
  )),
  'replay',
  'an exact cleanup retry request remains idempotent after completion'
);

CREATE TEMP TABLE post_switch_fixture AS
SELECT * FROM pg_temp.create_activation_fixture(
  'Post switch cleanup shirt',
  '40c2b000-0000-4000-8000-000000000103',
  '40c2b000-0000-4000-8000-000000000203'
);
INSERT INTO public.product_activation_cleanup_items (
  run_id, destination_key, cleanup_kind, superseded_run_id,
  expected_size_bytes, expected_sha256, expected_etag
) VALUES (
  (SELECT run_id FROM post_switch_fixture),
  'published-products/old-version.jpg',
  'superseded_public',
  (SELECT run_id FROM post_switch_fixture),
  100,
  repeat('b', 64),
  NULL
);
UPDATE public.product_image_publication_runs
SET phase = 'post_switch_cleanup'
WHERE id = (SELECT run_id FROM post_switch_fixture);

CREATE TEMP TABLE post_switch_claim AS
SELECT public.claim_product_activation_cleanup(
  (SELECT run_id FROM post_switch_fixture), 1, 360,
  (SELECT attempt_token FROM post_switch_fixture)
) AS payload;
SELECT is(
  (SELECT payload ->> 'result' FROM post_switch_claim),
  'claimed',
  'the activation owner can continue immediately into post-switch cleanup'
);
SELECT is(
  public.record_product_activation_cleanup_item_result(
    (SELECT run_id FROM post_switch_fixture), 1,
    (SELECT attempt_token FROM post_switch_fixture),
    'published-products/old-version.jpg', 'completed', NULL
  ),
  'completed',
  'post-switch superseded object cleanup is fenced to the activation attempt'
);
SELECT is(
  public.finalize_product_activation_cleanup(
    (SELECT run_id FROM post_switch_fixture), 1,
    (SELECT attempt_token FROM post_switch_fixture)
  ),
  'completed',
  'post-switch cleanup completes without repeating activation'
);
SELECT is(
  (SELECT phase || ':' || status FROM public.product_image_publication_runs
   WHERE id = (SELECT run_id FROM post_switch_fixture)),
  'post_switch_cleanup:completed',
  'completed post-switch cleanup preserves its one-way terminal phase'
);
SELECT throws_ok(
  format(
    'UPDATE public.product_image_publication_runs SET phase = %L WHERE id = %L',
    'activation',
    (SELECT run_id FROM post_switch_fixture)
  ),
  '23514',
  'product_activation_phase_immutable',
  'cleanup phases cannot transition back to activation'
);

SELECT * FROM finish();
ROLLBACK;
