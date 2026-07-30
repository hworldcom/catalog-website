BEGIN;

CREATE FUNCTION public.record_seller_classifier_review_observation(
  p_workflow_id uuid,
  p_seller_id uuid,
  p_stage text,
  p_group_count integer
)
RETURNS TABLE (
  operation_result text,
  id uuid,
  seller_id uuid,
  client_request_id uuid,
  classifier_organization_id uuid,
  classifier_batch_id uuid,
  max_files integer,
  max_file_size_bytes bigint,
  provisioning_status text,
  last_known_stage text,
  original_file_count integer,
  processed_file_count integer,
  group_count integer,
  product_draft_count integer,
  error_code text,
  retryable boolean,
  initiated_by_user_id uuid,
  initiator_kind text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected public.seller_classifier_batches%ROWTYPE;
  selected_result text;
BEGIN
  IF p_workflow_id IS NULL
    OR p_seller_id IS NULL
    OR p_stage NOT IN ('review', 'approved')
    OR p_group_count IS NULL
    OR p_group_count < 0
  THEN
    RAISE EXCEPTION 'seller_classifier_review_observation_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT workflow.*
  INTO selected
  FROM public.seller_classifier_batches AS workflow
  WHERE workflow.id = p_workflow_id
    AND workflow.seller_id = p_seller_id
  FOR UPDATE;

  IF selected.id IS NULL THEN
    selected_result := 'not_found';
  ELSIF selected.provisioning_status <> 'ready' THEN
    selected_result := 'not_ready';
  ELSIF selected.last_known_stage IN ('failed', 'importing', 'drafts_ready') THEN
    selected_result := 'stale';
  ELSIF selected.last_known_stage = 'approved' AND p_stage = 'review' THEN
    selected_result := 'stale';
  ELSIF selected.last_known_stage NOT IN (
    'upload',
    'processing',
    'review',
    'approved'
  ) THEN
    selected_result := 'stale';
  ELSE
    UPDATE public.seller_classifier_batches AS workflow
    SET
      last_known_stage = p_stage,
      group_count = p_group_count
    WHERE workflow.id = selected.id
    RETURNING workflow.* INTO selected;
    selected_result := 'recorded';
  END IF;

  RETURN QUERY SELECT
    selected_result,
    selected.id,
    selected.seller_id,
    selected.client_request_id,
    selected.classifier_organization_id,
    selected.classifier_batch_id,
    selected.max_files,
    selected.max_file_size_bytes,
    selected.provisioning_status,
    selected.last_known_stage,
    selected.original_file_count,
    selected.processed_file_count,
    selected.group_count,
    selected.product_draft_count,
    selected.error_code,
    selected.retryable,
    selected.initiated_by_user_id,
    selected.initiator_kind,
    selected.created_at,
    selected.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.record_seller_classifier_review_observation(
  uuid,
  uuid,
  text,
  integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_seller_classifier_review_observation(
  uuid,
  uuid,
  text,
  integer
) TO service_role;

COMMIT;
