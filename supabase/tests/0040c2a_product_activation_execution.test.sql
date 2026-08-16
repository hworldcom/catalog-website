BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(27);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '40c2a000-0000-4000-8000-000000000001',
  'qa-0040c2a-activation',
  'QA 0040c2a Activation',
  'Q2A'
);
SELECT pg_temp.approve_fixture_seller('40c2a000-0000-4000-8000-000000000001');

CREATE TEMP TABLE qa_product AS
SELECT * FROM public.save_initial_product_draft_with_description(
  NULL,
  '40c2a000-0000-4000-8000-000000000001',
  NULL,
  true,
  'Activation cotton shirt',
  true,
  'A reviewed cotton shirt.',
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
  '40c2a000-0000-4000-8000-000000000101', product_draft_id, 0, 'available',
  'product-drafts/qa/0040c2a-cover.jpg', 'image/jpeg', 100,
  'product-draft-images', 'seller_upload',
  '40c2a000-0000-4000-8000-000000000201', 'cover.jpg'
FROM qa_product;

UPDATE public.products AS product
SET cover_image_id = '40c2a000-0000-4000-8000-000000000101'
WHERE product.id = (SELECT product_draft_id FROM qa_product);

CREATE TEMP TABLE qa_submission AS
SELECT * FROM public.submit_product_moderation(
  (SELECT product_draft_id FROM qa_product),
  '40c2a000-0000-4000-8000-000000000001',
  (SELECT moderation_revision FROM public.products
    WHERE id = (SELECT product_draft_id FROM qa_product)),
  '40c2a000-0000-4000-8000-000000000301',
  '40c2a000-0000-4000-8000-000000000401'
);

CREATE TEMP TABLE qa_approval AS
SELECT * FROM public.decide_product_moderation_submission(
  (SELECT id FROM qa_submission),
  (SELECT revision FROM qa_submission),
  'approve',
  NULL,
  '40c2a000-0000-4000-8000-000000000302',
  '40c2a000-0000-4000-8000-000000000402'
);

SELECT is(
  (SELECT dispatch_status FROM public.record_product_activation_dispatch_result(
    (SELECT activation_run_id FROM qa_approval), 1, 'dispatched'
  )),
  'dispatched',
  'the approved activation generation is durably dispatched'
);

CREATE TEMP TABLE qa_claim AS
SELECT public.claim_product_activation_run(
  (SELECT activation_run_id FROM qa_approval), 1, 360
) AS payload;

SELECT is(
  (SELECT payload ->> 'result' FROM qa_claim),
  'claimed',
  'the current dispatched generation can claim activation work'
);
SELECT is(
  (SELECT jsonb_array_length(payload -> 'items') FROM qa_claim),
  1,
  'claim returns the immutable one-image manifest'
);
SELECT is(
  (SELECT attempt_count FROM public.product_image_publication_runs
    WHERE id = (SELECT activation_run_id FROM qa_approval)),
  1,
  'claim increments the attempt count exactly once'
);
SELECT is(
  (SELECT public.claim_product_activation_run(
    (SELECT activation_run_id FROM qa_approval), 1, 360
  ) ->> 'result'),
  'owned',
  'an unexpired owner coalesces duplicate delivery'
);

CREATE TEMP TABLE qa_attempt AS
SELECT payload ->> 'attemptToken' AS token FROM qa_claim;

SELECT is(
  public.record_product_activation_object_created(
    (SELECT activation_run_id FROM qa_approval),
    1,
    (SELECT token::uuid FROM qa_attempt),
    '40c2a000-0000-4000-8000-000000000101',
    repeat('a', 64),
    100,
    repeat('a', 64),
    '"etag-initial"',
    'https://example.test/activation-initial.jpg'
  ),
  'recorded',
  'a newly created destination is durably owned before verification'
);
SELECT is(
  public.record_product_activation_object_created(
    (SELECT activation_run_id FROM qa_approval),
    1,
    (SELECT token::uuid FROM qa_attempt),
    '40c2a000-0000-4000-8000-000000000101',
    repeat('a', 64),
    100,
    repeat('a', 64),
    '"etag-initial"',
    'https://example.test/activation-initial.jpg'
  ),
  'replay',
  'an exact object-created replay is idempotent'
);
SELECT is(
  public.verify_product_activation_item(
    (SELECT activation_run_id FROM qa_approval),
    1,
    (SELECT token::uuid FROM qa_attempt),
    '40c2a000-0000-4000-8000-000000000101',
    100,
    repeat('a', 64),
    '"etag-initial"'
  ),
  'verified',
  'matching destination bytes verify the manifest item'
);
SELECT is(
  public.verify_product_activation_item(
    (SELECT activation_run_id FROM qa_approval),
    1,
    (SELECT token::uuid FROM qa_attempt),
    '40c2a000-0000-4000-8000-000000000101',
    100,
    repeat('a', 64),
    '"etag-initial"'
  ),
  'replay',
  'an exact verification replay is idempotent'
);

SELECT is(
  public.finalize_product_activation(
    (SELECT activation_run_id FROM qa_approval),
    1,
    (SELECT token::uuid FROM qa_attempt)
  ),
  'completed',
  'a completely verified initial activation switches atomically'
);
SELECT results_eq(
  $$
    SELECT product.status::text, product.title, product.description,
      product.product_code IS NOT NULL,
      product.approved_moderation_submission_id,
      product.active_moderation_submission_id
    FROM public.products AS product
    WHERE product.id = (SELECT product_draft_id FROM qa_product)
  $$,
  $$
    SELECT 'published'::text, 'Activation cotton shirt'::text,
      'A reviewed cotton shirt.'::text, true,
      (SELECT id FROM qa_submission), NULL::uuid
  $$,
  'the complete approved scalar and description projection becomes public'
);
SELECT results_eq(
  $$
    SELECT image.url, image.sort_order, image.source_product_draft_image_id
    FROM public.product_images AS image
    WHERE image.product_id = (SELECT product_draft_id FROM qa_product)
  $$,
  $$
    VALUES (
      'https://example.test/activation-initial.jpg'::text,
      0,
      '40c2a000-0000-4000-8000-000000000101'::uuid
    )
  $$,
  'the verified manifest is the exact live public image projection'
);
SELECT is(
  (SELECT public.finalize_product_activation(
    (SELECT activation_run_id FROM qa_approval), 1, (SELECT token::uuid FROM qa_attempt)
  )),
  'completed',
  'a late finalization replay cannot repeat the switch'
);
SELECT is(
  (SELECT public.claim_product_activation_run(
    (SELECT activation_run_id FROM qa_approval), 1, 360
  ) ->> 'result'),
  'stale',
  'a completed run cannot be claimed again'
);

SELECT count(*) FROM public.ensure_product_moderation_working_copy(
  (SELECT product_draft_id FROM qa_product),
  '40c2a000-0000-4000-8000-000000000001'
);
SELECT count(*) FROM public.update_initial_product_draft_title(
  (SELECT product_draft_id FROM qa_product),
  '40c2a000-0000-4000-8000-000000000001',
  (SELECT revision FROM public.product_moderation_working_copies
    WHERE product_id = (SELECT product_draft_id FROM qa_product)),
  'Updated activation cotton shirt',
  'human'
);
CREATE TEMP TABLE qa_update_submission AS
SELECT * FROM public.submit_product_moderation(
  (SELECT product_draft_id FROM qa_product),
  '40c2a000-0000-4000-8000-000000000001',
  (SELECT revision FROM public.product_moderation_working_copies
    WHERE product_id = (SELECT product_draft_id FROM qa_product)),
  '40c2a000-0000-4000-8000-000000000303',
  '40c2a000-0000-4000-8000-000000000401'
);
CREATE TEMP TABLE qa_update_approval AS
SELECT * FROM public.decide_product_moderation_submission(
  (SELECT id FROM qa_update_submission),
  (SELECT revision FROM qa_update_submission),
  'approve', NULL,
  '40c2a000-0000-4000-8000-000000000304',
  '40c2a000-0000-4000-8000-000000000402'
);
SELECT count(*) FROM public.record_product_activation_dispatch_result(
  (SELECT activation_run_id FROM qa_update_approval), 1, 'dispatched'
);
CREATE TEMP TABLE qa_update_claim AS
SELECT public.claim_product_activation_run(
  (SELECT activation_run_id FROM qa_update_approval), 1, 360
) AS payload;
SELECT is(
  public.record_product_activation_object_created(
    (SELECT activation_run_id FROM qa_update_approval), 1,
    (SELECT (payload ->> 'attemptToken')::uuid FROM qa_update_claim),
    '40c2a000-0000-4000-8000-000000000101',
    repeat('b', 64), 100, repeat('b', 64), '"etag-update"',
    'https://example.test/activation-update.jpg'
  ),
  'recorded',
  'an update owns its versioned destination independently'
);
SELECT count(*) FROM public.verify_product_activation_item(
  (SELECT activation_run_id FROM qa_update_approval), 1,
  (SELECT (payload ->> 'attemptToken')::uuid FROM qa_update_claim),
  '40c2a000-0000-4000-8000-000000000101',
  100, repeat('b', 64), '"etag-update"'
);
SELECT is(
  public.finalize_product_activation(
    (SELECT activation_run_id FROM qa_update_approval), 1,
    (SELECT (payload ->> 'attemptToken')::uuid FROM qa_update_claim)
  ),
  'cleanup_pending',
  'a successful update switches first and records superseded cleanup work'
);
SELECT results_eq(
  $$
    SELECT product.title, image.url
    FROM public.products AS product
    JOIN public.product_images AS image ON image.product_id = product.id
    WHERE product.id = (SELECT product_draft_id FROM qa_product)
  $$,
  $$ VALUES (
    'Updated activation cotton shirt'::text,
    'https://example.test/activation-update.jpg'::text
  ) $$,
  'the updated approved version replaces the previous live projection'
);
SELECT results_eq(
  $$
    SELECT cleanup.cleanup_kind, cleanup.destination_key, cleanup.status
    FROM public.product_activation_cleanup_items AS cleanup
    WHERE cleanup.run_id = (SELECT activation_run_id FROM qa_update_approval)
  $$,
  $$
    SELECT 'superseded_public'::text, item.destination_key, 'pending'::text
    FROM public.product_image_publication_items AS item
    WHERE item.run_id = (SELECT activation_run_id FROM qa_approval)
  $$,
  'the previous managed object is durable cleanup work before deletion'
);
SELECT results_eq(
  $$
    SELECT run.phase, run.status, product.active_moderation_submission_id
    FROM public.product_image_publication_runs AS run
    JOIN public.products AS product ON product.id = run.product_id
    WHERE run.id = (SELECT activation_run_id FROM qa_update_approval)
  $$,
  $$ SELECT 'post_switch_cleanup'::text, 'running'::text,
    (SELECT id FROM qa_update_submission) $$,
  'post-switch cleanup keeps the winning submission active until recovery completes'
);

CREATE TEMP TABLE qa_failure_product AS
SELECT * FROM public.save_initial_product_draft_with_description(
  NULL, '40c2a000-0000-4000-8000-000000000001', NULL,
  true, 'Failure fencing shirt', false, NULL,
  (SELECT id FROM public.categories WHERE slug = 't-shirts'),
  NULL, NULL, NULL, 'EUR', 'in_stock', false, NULL, false, 'draft',
  ARRAY['men']::text[]
);
INSERT INTO public.product_draft_images (
  id, product_draft_id, source_position, status, destination_key,
  content_type, size_bytes, storage_bucket, source_kind, client_upload_id,
  original_filename
)
SELECT '40c2a000-0000-4000-8000-000000000102', product_draft_id, 0, 'available',
  'product-drafts/qa/0040c2a-failure.jpg', 'image/jpeg', 101,
  'product-draft-images', 'seller_upload',
  '40c2a000-0000-4000-8000-000000000202', 'failure.jpg'
FROM qa_failure_product;
UPDATE public.products SET cover_image_id = '40c2a000-0000-4000-8000-000000000102'
WHERE id = (SELECT product_draft_id FROM qa_failure_product);
CREATE TEMP TABLE qa_failure_submission AS
SELECT * FROM public.submit_product_moderation(
  (SELECT product_draft_id FROM qa_failure_product),
  '40c2a000-0000-4000-8000-000000000001',
  (SELECT moderation_revision FROM public.products
    WHERE id = (SELECT product_draft_id FROM qa_failure_product)),
  '40c2a000-0000-4000-8000-000000000305',
  '40c2a000-0000-4000-8000-000000000401'
);
CREATE TEMP TABLE qa_failure_approval AS
SELECT * FROM public.decide_product_moderation_submission(
  (SELECT id FROM qa_failure_submission),
  (SELECT revision FROM qa_failure_submission), 'approve', NULL,
  '40c2a000-0000-4000-8000-000000000306',
  '40c2a000-0000-4000-8000-000000000402'
);
SELECT count(*) FROM public.record_product_activation_dispatch_result(
  (SELECT activation_run_id FROM qa_failure_approval), 1, 'dispatched'
);
CREATE TEMP TABLE qa_failure_claim AS
SELECT public.claim_product_activation_run(
  (SELECT activation_run_id FROM qa_failure_approval), 1, 1
) AS payload;
UPDATE public.product_image_publication_runs
SET claim_started_at = now() - interval '2 seconds'
WHERE id = (SELECT activation_run_id FROM qa_failure_approval);
CREATE TEMP TABLE qa_reclaim AS
SELECT public.claim_product_activation_run(
  (SELECT activation_run_id FROM qa_failure_approval), 1, 1
) AS payload;

SELECT isnt(
  (SELECT payload ->> 'attemptToken' FROM qa_failure_claim),
  (SELECT payload ->> 'attemptToken' FROM qa_reclaim),
  'an expired claim receives a fresh fencing token'
);
SELECT is(
  public.verify_product_activation_item(
    (SELECT activation_run_id FROM qa_failure_approval), 1,
    (SELECT (payload ->> 'attemptToken')::uuid FROM qa_failure_claim),
    '40c2a000-0000-4000-8000-000000000102',
    101, repeat('c', 64), NULL
  ),
  'stale',
  'a late item write from the expired attempt is a no-op'
);
SELECT is(
  public.finalize_product_activation(
    (SELECT activation_run_id FROM qa_failure_approval), 1,
    (SELECT (payload ->> 'attemptToken')::uuid FROM qa_reclaim)
  ),
  'not_allowed',
  'an incomplete manifest cannot change the public projection'
);
SELECT is(
  (SELECT status::text FROM public.products
    WHERE id = (SELECT product_draft_id FROM qa_failure_product)),
  'draft',
  'failed pre-switch finalization leaves the previous product state unchanged'
);
SELECT is(
  public.fail_product_activation_attempt(
    (SELECT activation_run_id FROM qa_failure_approval), 1,
    (SELECT (payload ->> 'attemptToken')::uuid FROM qa_reclaim),
    '40c2a000-0000-4000-8000-000000000102',
    'product_publication_source_changed'
  ),
  'failed_non_retryable',
  'the database derives non-retryable failure from the stable error code'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.claim_product_activation_run(uuid,integer,integer)',
    'EXECUTE'
  ),
  'browser roles cannot claim activation work'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.finalize_product_activation(uuid,integer,uuid)',
    'EXECUTE'
  ),
  'browser roles cannot finalize activation work'
);
SELECT ok(
  NOT has_table_privilege(
    'authenticated', 'public.product_activation_cleanup_items', 'SELECT'
  ),
  'browser roles cannot read the cleanup ownership ledger'
);

SELECT * FROM finish();
ROLLBACK;
