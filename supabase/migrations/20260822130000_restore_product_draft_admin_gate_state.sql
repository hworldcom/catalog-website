BEGIN;

LOCK TABLE public.product_draft_image_storage_cutovers
  IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.product_draft_image_storage_reconciliations
  IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.product_draft_images
  IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE storage.objects
  IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
DECLARE
  target_version CONSTANT text := 'private-product-draft-images-v1';
  existing_status public.product_draft_image_storage_cutover_status;
BEGIN
  SELECT cutover.status
  INTO existing_status
  FROM public.product_draft_image_storage_cutovers AS cutover
  WHERE cutover.version = target_version;

  IF existing_status = 'completed' THEN
    RETURN;
  END IF;

  IF existing_status IS NOT NULL THEN
    RAISE EXCEPTION 'product_draft_image_cutover_restore_not_allowed'
      USING
        ERRCODE = '55000',
        DETAIL = 'cutover_status=' || existing_status::text;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_draft_images AS image
    WHERE image.storage_bucket = 'product-images'
  ) THEN
    RAISE EXCEPTION 'product_draft_image_cutover_restore_not_allowed'
      USING
        ERRCODE = '55000',
        DETAIL = 'legacy_product_draft_image_rows_present';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE object.bucket_id = 'product-images'
      AND object.name LIKE 'product-drafts/%'
  ) THEN
    RAISE EXCEPTION 'product_draft_image_cutover_restore_not_allowed'
      USING
        ERRCODE = '55000',
        DETAIL = 'legacy_public_product_draft_objects_present';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_draft_image_storage_reconciliations
  ) THEN
    RAISE EXCEPTION 'product_draft_image_cutover_restore_not_allowed'
      USING
        ERRCODE = '55000',
        DETAIL = 'product_draft_image_reconciliation_rows_present';
  END IF;

  INSERT INTO public.product_draft_image_storage_cutovers (
    version,
    status,
    scan_phase,
    attempt_count,
    attempt_token,
    claim_started_at,
    last_attempt_at,
    scan_cursor,
    pending_count,
    started_count,
    completed_count,
    failed_count,
    release_blocking_count,
    error_code,
    started_at,
    completed_at
  )
  VALUES (
    target_version,
    'completed',
    'confirming',
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    0,
    0,
    0,
    0,
    0,
    NULL,
    transaction_timestamp(),
    transaction_timestamp()
  );
END;
$migration$;

COMMIT;
