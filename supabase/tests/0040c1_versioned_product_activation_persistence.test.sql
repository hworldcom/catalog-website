BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(20);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '40c10000-0000-4000-8000-000000000001',
  'qa-0040c1-activation',
  'QA 0040c1 Activation',
  'Q4C'
);
SELECT pg_temp.approve_fixture_seller('40c10000-0000-4000-8000-000000000001');

CREATE TEMP TABLE qa_product AS
SELECT * FROM public.save_initial_product_draft_with_description(
  NULL,
  '40c10000-0000-4000-8000-000000000001',
  NULL,
  true,
  'Versioned cotton shirt',
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
  '40c10000-0000-4000-8000-000000000101', product_draft_id, 0, 'available',
  'product-drafts/qa/0040c1-cover.jpg', 'image/jpeg', 100,
  'product-draft-images', 'seller_upload',
  '40c10000-0000-4000-8000-000000000201', 'cover.jpg'
FROM qa_product;

UPDATE public.products AS product
SET cover_image_id = '40c10000-0000-4000-8000-000000000101'
WHERE product.id = (SELECT product_draft_id FROM qa_product);

CREATE TEMP TABLE qa_initial_submission AS
SELECT * FROM public.submit_product_moderation(
  (SELECT product_draft_id FROM qa_product),
  '40c10000-0000-4000-8000-000000000001',
  (SELECT moderation_revision FROM public.products
    WHERE id = (SELECT product_draft_id FROM qa_product)),
  '40c10000-0000-4000-8000-000000000301',
  '40c10000-0000-4000-8000-000000000401'
);

CREATE TEMP TABLE qa_approval AS
SELECT * FROM public.decide_product_moderation_submission(
  (SELECT id FROM qa_initial_submission),
  (SELECT revision FROM qa_initial_submission),
  'approve',
  NULL,
  '40c10000-0000-4000-8000-000000000302',
  '40c10000-0000-4000-8000-000000000402'
);

SELECT is(
  (SELECT review_status FROM qa_approval),
  'approved',
  'approval records the immutable moderation decision'
);

SELECT ok(
  (SELECT activation_run_id IS NOT NULL AND dispatch_generation = 1
    AND dispatch_required FROM qa_approval),
  'approval creates one pending activation run and first dispatch generation'
);

SELECT is(
  (
    SELECT run.snapshot_hash
    FROM public.product_image_publication_runs AS run
    WHERE run.id = (SELECT activation_run_id FROM qa_approval)
  ),
  (
    SELECT encode(
      extensions.digest(convert_to(submission.snapshot_json::text, 'UTF8'), 'sha256'),
      'hex'
    )
    FROM public.product_moderation_submissions AS submission
    WHERE submission.id = (SELECT id FROM qa_initial_submission)
  ),
  'the run stores the canonical immutable snapshot hash'
);

SELECT results_eq(
  $$
    SELECT item.product_draft_image_id, item.publication_order, item.is_cover,
      item.source_object_key, item.expected_source_size_bytes
    FROM public.product_image_publication_items AS item
    WHERE item.run_id = (SELECT activation_run_id FROM qa_approval)
  $$,
  $$
    VALUES (
      '40c10000-0000-4000-8000-000000000101'::uuid,
      0,
      true,
      'product-drafts/qa/0040c1-cover.jpg'::text,
      100::bigint
    )
  $$,
  'approval freezes only the exact submitted image membership and metadata'
);

CREATE TEMP TABLE qa_approval_replay AS
SELECT * FROM public.decide_product_moderation_submission(
  (SELECT id FROM qa_initial_submission),
  (SELECT revision FROM qa_initial_submission),
  'approve',
  NULL,
  '40c10000-0000-4000-8000-000000000302',
  '40c10000-0000-4000-8000-000000000402'
);

SELECT results_eq(
  $$ SELECT result, activation_run_id, dispatch_generation, dispatch_required
     FROM qa_approval_replay $$,
  $$ SELECT 'replay'::text, activation_run_id, 1, true FROM qa_approval $$,
  'an exact approval replay returns the same undispatched generation'
);

SELECT is(
  (SELECT count(*)::integer FROM public.product_image_publication_runs
    WHERE moderation_submission_id = (SELECT id FROM qa_initial_submission)),
  1,
  'one moderation submission can own only one activation run'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.decide_product_moderation_submission(%L,%s,%L,%L,%L,%L)',
    (SELECT id FROM qa_initial_submission),
    (SELECT revision FROM qa_initial_submission),
    'reject',
    'Conflicting reuse',
    '40c10000-0000-4000-8000-000000000302',
    '40c10000-0000-4000-8000-000000000402'
  ),
  '23505',
  'product_moderation_decision_conflict',
  'reusing a decision request identifier with another payload conflicts'
);

CREATE TEMP TABLE qa_dispatch_failure AS
SELECT * FROM public.record_product_activation_dispatch_result(
  (SELECT activation_run_id FROM qa_approval), 1, 'failed'
);

SELECT results_eq(
  $$ SELECT result, dispatch_generation, dispatch_status FROM qa_dispatch_failure $$,
  $$ VALUES ('recorded'::text, 1, 'failed'::text) $$,
  'a confirmed enqueue failure is durable while activation remains pending'
);

SELECT is(
  (SELECT status FROM public.product_image_publication_runs
    WHERE id = (SELECT activation_run_id FROM qa_approval)),
  'pending',
  'dispatch failure does not change worker activation state'
);

CREATE TEMP TABLE qa_dispatch_retry AS
SELECT * FROM public.retry_product_activation_dispatch(
  (SELECT activation_run_id FROM qa_approval),
  1,
  '40c10000-0000-4000-8000-000000000501',
  '40c10000-0000-4000-8000-000000000402'
);

SELECT results_eq(
  $$ SELECT result, dispatch_generation, dispatch_status, dispatch_required
     FROM qa_dispatch_retry $$,
  $$ VALUES ('retried'::text, 2, 'pending'::text, true) $$,
  'an explicit retry increments the generation after confirmed failure'
);

SELECT results_eq(
  format(
    'SELECT result, dispatch_generation, dispatch_status, dispatch_required
     FROM public.retry_product_activation_dispatch(%L,1,%L,%L)',
    (SELECT activation_run_id FROM qa_approval),
    '40c10000-0000-4000-8000-000000000501',
    '40c10000-0000-4000-8000-000000000402'
  ),
  $$ VALUES ('replay'::text, 2, 'pending'::text, true) $$,
  'an exact retry replay retains its generation'
);

SELECT results_eq(
  format(
    'SELECT result, dispatch_generation, dispatch_status, dispatch_required
     FROM public.record_product_activation_dispatch_result(%L,1,%L)',
    (SELECT activation_run_id FROM qa_approval), 'dispatched'
  ),
  $$ VALUES ('stale'::text, 2, 'pending'::text, false) $$,
  'a late result from the previous dispatch generation is a no-op'
);

SELECT is(
  (
    SELECT dispatch_status
    FROM public.record_product_activation_dispatch_result(
      (SELECT activation_run_id FROM qa_approval), 2, 'dispatched'
    )
  ),
  'dispatched',
  'the current generation can be confirmed as dispatched'
);

SELECT is(
  (
    SELECT result
    FROM public.record_product_activation_dispatch_result(
      (SELECT activation_run_id FROM qa_approval), 2, 'dispatched'
    )
  ),
  'replay',
  'an exact dispatch result replay is idempotent'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.record_product_activation_dispatch_result(%L,2,%L)',
    (SELECT activation_run_id FROM qa_approval), 'failed'
  ),
  '55000',
  'product_activation_dispatch_not_allowed',
  'a contradictory result for the same generation conflicts'
);

-- Simulate the 0040c2 public switch so a later immutable update submission can
-- prove that publication history is versioned by submission rather than product.
UPDATE public.product_image_publication_items AS item
SET status = 'completed', source_sha256 = repeat('a', 64),
  public_size_bytes = expected_source_size_bytes, public_sha256 = repeat('a', 64),
  public_url = 'https://example.test/' || item.product_draft_image_id::text || '.jpg'
WHERE item.run_id = (SELECT activation_run_id FROM qa_approval);
UPDATE public.product_image_publication_runs AS run
SET status = 'completed', completed_at = now()
WHERE run.id = (SELECT activation_run_id FROM qa_approval);
SET LOCAL session_replication_role = replica;
UPDATE public.products AS product
SET status = 'published',
  approved_moderation_submission_id = (SELECT id FROM qa_initial_submission),
  active_moderation_submission_id = NULL,
  cover_image_url = 'https://example.test/40c10000-0000-4000-8000-000000000101.jpg'
WHERE product.id = (SELECT product_draft_id FROM qa_product);
SET LOCAL session_replication_role = origin;

SELECT count(*) FROM public.begin_product_moderation_editing(
  (SELECT product_draft_id FROM qa_product),
  '40c10000-0000-4000-8000-000000000001'
);
SELECT count(*) FROM public.update_initial_product_draft_title(
  (SELECT product_draft_id FROM qa_product),
  '40c10000-0000-4000-8000-000000000001',
  (SELECT revision FROM public.product_moderation_working_copies
    WHERE product_id = (SELECT product_draft_id FROM qa_product)),
  'Revised versioned cotton shirt',
  'human'
);

CREATE TEMP TABLE qa_update_submission AS
SELECT * FROM public.submit_product_moderation(
  (SELECT product_draft_id FROM qa_product),
  '40c10000-0000-4000-8000-000000000001',
  (SELECT revision FROM public.product_moderation_working_copies
    WHERE product_id = (SELECT product_draft_id FROM qa_product)),
  '40c10000-0000-4000-8000-000000000303',
  '40c10000-0000-4000-8000-000000000401'
);

CREATE TEMP TABLE qa_update_approval AS
SELECT * FROM public.decide_product_moderation_submission(
  (SELECT id FROM qa_update_submission),
  (SELECT revision FROM qa_update_submission),
  'approve', NULL,
  '40c10000-0000-4000-8000-000000000304',
  '40c10000-0000-4000-8000-000000000402'
);

SELECT is(
  (SELECT count(*)::integer FROM public.product_image_publication_runs
    WHERE product_id = (SELECT product_draft_id FROM qa_product)),
  2,
  'two approved submissions for one product retain two historical runs'
);

SELECT isnt(
  (SELECT activation_run_id FROM qa_update_approval),
  (SELECT activation_run_id FROM qa_approval),
  'a later submission receives a different immutable activation identity'
);

CREATE TEMP TABLE qa_changes_product AS
SELECT * FROM public.save_initial_product_draft_with_description(
  NULL, '40c10000-0000-4000-8000-000000000001', NULL,
  true, 'Needs a better image', false, NULL,
  (SELECT id FROM public.categories WHERE slug = 't-shirts'),
  NULL, NULL, NULL, 'EUR', 'in_stock', false, NULL, false, 'draft',
  ARRAY['women']::text[]
);
INSERT INTO public.product_draft_images (
  id, product_draft_id, source_position, status, destination_key,
  content_type, size_bytes, storage_bucket, source_kind, client_upload_id,
  original_filename
)
SELECT '40c10000-0000-4000-8000-000000000102', product_draft_id, 0, 'available',
  'product-drafts/qa/0040c1-changes.jpg', 'image/jpeg', 101,
  'product-draft-images', 'seller_upload',
  '40c10000-0000-4000-8000-000000000202', 'changes.jpg'
FROM qa_changes_product;
UPDATE public.products SET cover_image_id = '40c10000-0000-4000-8000-000000000102'
WHERE id = (SELECT product_draft_id FROM qa_changes_product);
CREATE TEMP TABLE qa_changes_submission AS
SELECT * FROM public.submit_product_moderation(
  (SELECT product_draft_id FROM qa_changes_product),
  '40c10000-0000-4000-8000-000000000001',
  (SELECT moderation_revision FROM public.products
    WHERE id = (SELECT product_draft_id FROM qa_changes_product)),
  '40c10000-0000-4000-8000-000000000305',
  '40c10000-0000-4000-8000-000000000401'
);
CREATE TEMP TABLE qa_changes_decision AS
SELECT * FROM public.decide_product_moderation_submission(
  (SELECT id FROM qa_changes_submission),
  (SELECT revision FROM qa_changes_submission),
  'request_changes', '  Add   a clearer cover image.  ',
  '40c10000-0000-4000-8000-000000000306',
  '40c10000-0000-4000-8000-000000000402'
);

SELECT results_eq(
  $$
    SELECT submission.review_status, submission.seller_visible_reason,
      product.active_moderation_submission_id IS NULL,
      product.moderation_revision > submission.revision
    FROM public.product_moderation_submissions AS submission
    JOIN public.products AS product ON product.id = submission.product_id
    WHERE submission.id = (SELECT id FROM qa_changes_submission)
  $$,
  $$ VALUES ('changes_requested'::text, 'Add a clearer cover image.'::text, true, true) $$,
  'request changes stores a normalized reason and unlocks a newer editable revision'
);

SELECT is(
  (SELECT count(*)::integer FROM public.product_image_publication_runs
    WHERE moderation_submission_id = (SELECT id FROM qa_changes_submission)),
  0,
  'request changes never creates an activation run'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.decide_product_moderation_submission(%L,%s,%L,NULL,%L,%L)',
    (SELECT id FROM qa_changes_submission),
    (SELECT revision + 1 FROM qa_changes_submission),
    'approve',
    '40c10000-0000-4000-8000-000000000307',
    '40c10000-0000-4000-8000-000000000402'
  ),
  '55000',
  'product_moderation_submission_stale',
  'a decided submission cannot be approved with a later revision'
);

SELECT * FROM finish();
ROLLBACK;
