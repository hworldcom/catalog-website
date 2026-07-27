BEGIN;

CREATE FUNCTION public.fail_claimed_product_image_publication(
  p_product_draft_id uuid,
  p_attempt_token uuid,
  p_error_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cleanup_needed boolean;
BEGIN
  IF NULLIF(btrim(p_error_code), '') IS NULL THEN
    RAISE EXCEPTION 'product_publication_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.product_image_publication_items AS item
    WHERE item.product_draft_id = p_product_draft_id
      AND item.attempt_token = p_attempt_token
      AND item.object_created_by_attempt_token IS NOT NULL
  )
  INTO cleanup_needed;

  UPDATE public.product_image_publication_runs AS run
  SET
    status = CASE WHEN cleanup_needed THEN 'cleanup_required' ELSE 'failed' END,
    attempt_token = NULL,
    claim_started_at = NULL,
    error_code = CASE
      WHEN cleanup_needed THEN 'product_publication_cleanup_required'
      ELSE p_error_code
    END
  WHERE run.product_draft_id = p_product_draft_id
    AND run.status = 'running'
    AND run.attempt_token = p_attempt_token;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.product_image_publication_items AS item
  SET
    status = CASE
      WHEN item.object_created_by_attempt_token IS NOT NULL
        THEN 'cleanup_required'
      ELSE 'failed'
    END,
    attempt_token = NULL,
    error_code = p_error_code
  WHERE item.product_draft_id = p_product_draft_id
    AND item.attempt_token = p_attempt_token;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_claimed_product_image_publication(
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_claimed_product_image_publication(
  uuid,
  uuid,
  text
) TO service_role;

COMMIT;
