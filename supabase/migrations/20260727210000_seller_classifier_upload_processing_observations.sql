BEGIN;

ALTER TABLE public.seller_classifier_batches
  DROP CONSTRAINT seller_classifier_batches_ready_check;

ALTER TABLE public.seller_classifier_batches
  ADD CONSTRAINT seller_classifier_batches_ready_check
    CHECK (
      provisioning_status <> 'ready'
      OR (
        classifier_batch_id IS NOT NULL
        AND max_files IS NOT NULL
        AND max_file_size_bytes IS NOT NULL
      )
    ),
  ADD CONSTRAINT seller_classifier_batches_stage_error_check
    CHECK (
      (
        last_known_stage = 'failed'
        AND error_code IS NOT NULL
      )
      OR (
        last_known_stage <> 'failed'
        AND error_code IS NULL
        AND retryable = false
      )
    );

CREATE FUNCTION public.record_seller_classifier_batch_observation(
  p_workflow_id uuid,
  p_seller_id uuid,
  p_observation_kind text,
  p_stage text,
  p_original_file_count integer,
  p_processed_file_count integer,
  p_error_code text,
  p_retryable boolean
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
  current_rank integer;
  incoming_rank integer;
  next_original_file_count integer;
  next_processed_file_count integer;
BEGIN
  IF p_workflow_id IS NULL
    OR p_seller_id IS NULL
    OR p_observation_kind NOT IN ('upload', 'processing', 'processing_retry')
    OR p_stage NOT IN ('upload', 'processing', 'review', 'approved', 'failed')
    OR p_original_file_count IS NULL
    OR p_original_file_count < 0
    OR p_processed_file_count IS NULL
    OR p_processed_file_count < 0
    OR p_processed_file_count > p_original_file_count
    OR p_retryable IS NULL
    OR (
      p_observation_kind = 'upload'
      AND p_stage <> 'upload'
    )
    OR (
      p_observation_kind = 'processing_retry'
      AND p_stage <> 'processing'
    )
    OR (
      p_stage = 'failed'
      AND (
        p_error_code IS NULL
        OR btrim(p_error_code) = ''
      )
    )
    OR (
      p_stage <> 'failed'
      AND (
        p_error_code IS NOT NULL
        OR p_retryable
      )
    )
  THEN
    RAISE EXCEPTION 'seller_classifier_batch_observation_invalid'
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
  ELSIF selected.last_known_stage IN ('importing', 'drafts_ready') THEN
    selected_result := 'stale';
  ELSIF selected.last_known_stage = 'failed' THEN
    IF p_observation_kind = 'processing_retry'
      AND selected.retryable
    THEN
      selected.last_known_stage := 'processing';
      selected.error_code := NULL;
      selected.retryable := false;
      selected_result := 'recorded';
    ELSE
      selected_result := 'stale';
    END IF;
  ELSE
    current_rank := CASE selected.last_known_stage
      WHEN 'upload' THEN 10
      WHEN 'processing' THEN 20
      WHEN 'review' THEN 30
      WHEN 'approved' THEN 40
      ELSE 0
    END;
    incoming_rank := CASE p_stage
      WHEN 'upload' THEN 10
      WHEN 'processing' THEN 20
      WHEN 'review' THEN 30
      WHEN 'approved' THEN 40
      WHEN 'failed' THEN 50
      ELSE 0
    END;

    IF p_stage = 'failed'
      AND selected.last_known_stage NOT IN ('upload', 'processing')
    THEN
      selected_result := 'stale';
    ELSIF incoming_rank < current_rank THEN
      selected_result := 'stale';
    ELSE
      selected.last_known_stage := p_stage;
      selected.error_code := p_error_code;
      selected.retryable := p_retryable;
      selected_result := 'recorded';
    END IF;
  END IF;

  IF selected_result = 'recorded' THEN
    next_original_file_count := greatest(
      selected.original_file_count,
      p_original_file_count
    );
    next_processed_file_count := greatest(
      selected.processed_file_count,
      p_processed_file_count
    );

    IF next_processed_file_count > next_original_file_count THEN
      RAISE EXCEPTION 'seller_classifier_batch_observation_invalid'
        USING ERRCODE = '22023';
    END IF;

    selected.original_file_count := next_original_file_count;
    selected.processed_file_count := next_processed_file_count;

    UPDATE public.seller_classifier_batches AS workflow
    SET
      last_known_stage = selected.last_known_stage,
      original_file_count = selected.original_file_count,
      processed_file_count = selected.processed_file_count,
      error_code = selected.error_code,
      retryable = selected.retryable
    WHERE workflow.id = selected.id
    RETURNING workflow.* INTO selected;
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

REVOKE ALL ON FUNCTION public.record_seller_classifier_batch_observation(
  uuid,
  uuid,
  text,
  text,
  integer,
  integer,
  text,
  boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_seller_classifier_batch_observation(
  uuid,
  uuid,
  text,
  text,
  integer,
  integer,
  text,
  boolean
) TO service_role;

COMMIT;
