BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(9);

SELECT is(
  (
    SELECT count(*)
    FROM public.product_draft_image_storage_cutovers
    WHERE version = 'private-product-draft-images-v1'
  ),
  1::bigint,
  'the private ProductDraft image cutover marker exists exactly once'
);

SELECT is(
  (
    SELECT status::text
    FROM public.product_draft_image_storage_cutovers
    WHERE version = 'private-product-draft-images-v1'
  ),
  'completed',
  'the private ProductDraft image cutover is completed'
);

SELECT is(
  (
    SELECT scan_phase::text
    FROM public.product_draft_image_storage_cutovers
    WHERE version = 'private-product-draft-images-v1'
  ),
  'confirming',
  'the restored cutover records its terminal confirming phase'
);

SELECT results_eq(
  $$
    SELECT
      attempt_count,
      pending_count,
      started_count,
      completed_count,
      failed_count,
      release_blocking_count
    FROM public.product_draft_image_storage_cutovers
    WHERE version = 'private-product-draft-images-v1'
  $$,
  $$ VALUES (0, 0, 0, 0, 0, 0) $$,
  'the restored cutover has no attempts or outstanding work'
);

SELECT ok(
  (
    SELECT
      attempt_token IS NULL
      AND claim_started_at IS NULL
      AND last_attempt_at IS NULL
      AND scan_cursor IS NULL
      AND error_code IS NULL
    FROM public.product_draft_image_storage_cutovers
    WHERE version = 'private-product-draft-images-v1'
  ),
  'the restored cutover has no claim, cursor, or error state'
);

SELECT ok(
  (
    SELECT started_at IS NOT NULL AND completed_at IS NOT NULL
    FROM public.product_draft_image_storage_cutovers
    WHERE version = 'private-product-draft-images-v1'
  ),
  'the restored cutover records its synthetic completed interval'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.product_draft_images
    WHERE storage_bucket = 'product-images'
  ),
  0::bigint,
  'no ProductDraft image row uses the legacy public bucket'
);

SELECT is(
  (
    SELECT count(*)
    FROM storage.objects
    WHERE bucket_id = 'product-images'
      AND name LIKE 'product-drafts/%'
  ),
  0::bigint,
  'no legacy public ProductDraft storage object remains'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.product_draft_image_storage_reconciliations
  ),
  0::bigint,
  'no legacy ProductDraft image reconciliation row remains'
);

SELECT * FROM finish();
ROLLBACK;
