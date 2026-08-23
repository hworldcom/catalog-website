CREATE OR REPLACE FUNCTION public.create_or_get_owned_classifier_import(
  p_workflow_id uuid,
  p_seller_id uuid,
  p_classifier_organization_id uuid,
  p_classifier_batch_id uuid,
  p_requested_by_user_id uuid
)
RETURNS TABLE (
  operation_result text,
  id uuid,
  classifier_organization_id uuid,
  classifier_batch_id uuid,
  seller_id uuid,
  seller_classifier_workflow_id uuid,
  pipeline_version text,
  status public.classifier_import_status,
  operation_kind public.classifier_import_operation_kind,
  requested_by_user_id uuid,
  attempt_count integer,
  attempt_token uuid,
  claim_started_at timestamptz,
  last_heartbeat_at timestamptz,
  error_code text,
  retryable boolean,
  retry_policy public.classifier_import_retry_policy,
  created_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_workflow public.seller_classifier_batches%ROWTYPE;
  selected_run public.classifier_import_runs%ROWTYPE;
  selected_result text;
BEGIN
  IF p_workflow_id IS NULL
    OR p_seller_id IS NULL
    OR p_classifier_organization_id IS NULL
    OR p_classifier_batch_id IS NULL
    OR p_requested_by_user_id IS NULL
  THEN
    RAISE EXCEPTION 'seller_classifier_approval_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT workflow.*
  INTO selected_workflow
  FROM public.seller_classifier_batches AS workflow
  WHERE workflow.id = p_workflow_id
    AND workflow.seller_id = p_seller_id
    AND workflow.classifier_organization_id = p_classifier_organization_id
    AND workflow.classifier_batch_id = p_classifier_batch_id
  FOR UPDATE;

  IF selected_workflow.id IS NULL THEN
    selected_result := 'not_found';
  ELSIF selected_workflow.provisioning_status <> 'ready' THEN
    selected_result := 'stale';
  ELSE
    SELECT run.*
    INTO selected_run
    FROM public.classifier_import_runs AS run
    WHERE run.classifier_organization_id = p_classifier_organization_id
      AND run.classifier_batch_id = p_classifier_batch_id
    FOR UPDATE;

    IF selected_run.id IS NOT NULL THEN
      IF selected_run.seller_id <> p_seller_id
        OR selected_run.seller_classifier_workflow_id IS NULL
        OR selected_run.seller_classifier_workflow_id <> p_workflow_id
      THEN
        selected_result := 'ownership_conflict';
      ELSE
        selected_result := 'existing';
      END IF;
    ELSIF selected_workflow.last_known_stage <> 'approved' THEN
      selected_result := 'stale';
    ELSE
      BEGIN
        INSERT INTO public.classifier_import_runs AS run (
          classifier_organization_id,
          classifier_batch_id,
          seller_id,
          seller_classifier_workflow_id,
          requested_by_user_id
        )
        VALUES (
          p_classifier_organization_id,
          p_classifier_batch_id,
          p_seller_id,
          p_workflow_id,
          p_requested_by_user_id
        )
        RETURNING run.* INTO selected_run;
        selected_result := 'created';
      EXCEPTION
        WHEN unique_violation THEN
          SELECT run.*
          INTO selected_run
          FROM public.classifier_import_runs AS run
          WHERE run.classifier_organization_id = p_classifier_organization_id
            AND run.classifier_batch_id = p_classifier_batch_id
          FOR UPDATE;

          IF selected_run.id IS NULL
            OR selected_run.seller_id <> p_seller_id
            OR selected_run.seller_classifier_workflow_id IS NULL
            OR selected_run.seller_classifier_workflow_id <> p_workflow_id
          THEN
            selected_result := 'ownership_conflict';
          ELSE
            selected_result := 'existing';
          END IF;
      END;
    END IF;

    IF selected_result IN ('created', 'existing') THEN
      IF selected_run.status IN ('completed', 'completed_with_errors', 'failed') THEN
        IF NOT public.project_classifier_import_to_seller_workflow(selected_run.id) THEN
          RAISE EXCEPTION 'seller_classifier_import_projection_failed'
            USING ERRCODE = '55000';
        END IF;
        SELECT run.*
        INTO selected_run
        FROM public.classifier_import_runs AS run
        WHERE run.id = selected_run.id;
      ELSE
        UPDATE public.seller_classifier_batches AS workflow
        SET
          last_known_stage = 'importing',
          error_code = NULL,
          retryable = false
        WHERE workflow.id = selected_workflow.id;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT
    selected_result,
    selected_run.id,
    selected_run.classifier_organization_id,
    selected_run.classifier_batch_id,
    selected_run.seller_id,
    selected_run.seller_classifier_workflow_id,
    selected_run.pipeline_version,
    selected_run.status,
    selected_run.operation_kind,
    selected_run.requested_by_user_id,
    selected_run.attempt_count,
    selected_run.attempt_token,
    selected_run.claim_started_at,
    selected_run.last_heartbeat_at,
    selected_run.error_code,
    selected_run.retryable,
    selected_run.retry_policy,
    selected_run.created_at,
    selected_run.completed_at,
    selected_run.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_or_get_owned_classifier_import(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_or_get_owned_classifier_import(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid
) TO service_role;
