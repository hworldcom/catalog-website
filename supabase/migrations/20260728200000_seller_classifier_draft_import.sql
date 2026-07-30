BEGIN;

ALTER TABLE public.classifier_import_runs
  ADD COLUMN seller_classifier_workflow_id uuid
    REFERENCES public.seller_classifier_batches(id)
    ON DELETE RESTRICT;

CREATE UNIQUE INDEX classifier_import_runs_seller_workflow_unique
  ON public.classifier_import_runs (seller_classifier_workflow_id)
  WHERE seller_classifier_workflow_id IS NOT NULL;

ALTER TABLE public.classifier_import_group_outcomes
  ADD COLUMN source_group_position integer;

ALTER TABLE public.classifier_import_group_outcomes
  ADD CONSTRAINT classifier_import_group_outcomes_source_position_nonnegative
    CHECK (source_group_position IS NULL OR source_group_position >= 0);

CREATE UNIQUE INDEX classifier_import_group_outcomes_source_position_unique
  ON public.classifier_import_group_outcomes (
    classifier_import_run_id,
    source_group_position
  )
  WHERE source_group_position IS NOT NULL;

CREATE FUNCTION public.enforce_classifier_import_workflow_immutability()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.seller_classifier_workflow_id IS NOT NULL
    AND NEW.seller_classifier_workflow_id
      IS DISTINCT FROM OLD.seller_classifier_workflow_id
  THEN
    RAISE EXCEPTION 'classifier_import_workflow_immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_classifier_import_runs_workflow_immutable
  BEFORE UPDATE OF seller_classifier_workflow_id
  ON public.classifier_import_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_classifier_import_workflow_immutability();

CREATE FUNCTION public.record_seller_classifier_batch_approved(
  p_workflow_id uuid,
  p_seller_id uuid,
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
    OR p_group_count IS NULL
    OR p_group_count < 1
  THEN
    RAISE EXCEPTION 'seller_classifier_approval_invalid'
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
  ELSIF selected.last_known_stage IN ('importing', 'drafts_ready', 'failed') THEN
    selected_result := 'stale';
  ELSIF selected.last_known_stage NOT IN ('review', 'approved') THEN
    selected_result := 'stale';
  ELSE
    UPDATE public.seller_classifier_batches AS workflow
    SET
      last_known_stage = 'approved',
      group_count = p_group_count,
      error_code = NULL,
      retryable = false
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

CREATE FUNCTION public.project_classifier_import_to_seller_workflow(
  p_import_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.classifier_import_runs%ROWTYPE;
  selected_workflow public.seller_classifier_batches%ROWTYPE;
  image_state record;
  outcome_count integer;
  complete_count integer;
  incomplete_count integer;
  product_count integer;
  missing_image_count integer;
  has_retryable_group_failure boolean;
  valid_completion boolean;
  workflow_retryable boolean;
  workflow_error_code text;
BEGIN
  SELECT run.*
  INTO selected_run
  FROM public.classifier_import_runs AS run
  WHERE run.id = p_import_id
    AND run.seller_classifier_workflow_id IS NOT NULL
    AND run.status IN ('completed', 'completed_with_errors', 'failed')
    AND run.attempt_token IS NULL
  FOR UPDATE;

  IF selected_run.id IS NULL THEN
    RETURN false;
  END IF;

  SELECT workflow.*
  INTO selected_workflow
  FROM public.seller_classifier_batches AS workflow
  WHERE workflow.id = selected_run.seller_classifier_workflow_id
    AND workflow.seller_id = selected_run.seller_id
    AND workflow.classifier_organization_id = selected_run.classifier_organization_id
    AND workflow.classifier_batch_id = selected_run.classifier_batch_id
  FOR UPDATE;

  IF selected_workflow.id IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE outcome.status = 'complete')::integer,
    count(*) FILTER (WHERE outcome.status <> 'complete')::integer,
    count(DISTINCT outcome.product_draft_id)
      FILTER (WHERE outcome.product_draft_id IS NOT NULL)::integer,
    bool_or(outcome.status = 'failed' AND outcome.retryable)
  INTO
    outcome_count,
    complete_count,
    incomplete_count,
    product_count,
    has_retryable_group_failure
  FROM public.classifier_import_group_outcomes AS outcome
  WHERE outcome.classifier_import_run_id = selected_run.id;

  SELECT count(*)::integer
  INTO missing_image_count
  FROM public.classifier_import_group_outcomes AS outcome
  JOIN public.product_draft_source_memberships AS membership
    ON membership.product_draft_id = outcome.product_draft_id
    AND membership.promotion_required
  LEFT JOIN public.product_draft_images AS image
    ON image.product_draft_id = membership.product_draft_id
    AND image.classifier_image_id = membership.classifier_image_id
  LEFT JOIN public.product_draft_image_promotions AS promotion
    ON promotion.product_draft_id = membership.product_draft_id
    AND promotion.classifier_image_id = membership.classifier_image_id
  WHERE outcome.classifier_import_run_id = selected_run.id
    AND (
      image.id IS NULL
      OR image.status <> 'available'
      OR promotion.id IS NULL
      OR promotion.status <> 'promoted'
    );

  outcome_count := coalesce(outcome_count, 0);
  complete_count := coalesce(complete_count, 0);
  incomplete_count := coalesce(incomplete_count, 0);
  product_count := coalesce(product_count, 0);
  missing_image_count := coalesce(missing_image_count, 0);
  has_retryable_group_failure := coalesce(has_retryable_group_failure, false);

  valid_completion :=
    selected_run.status = 'completed'
    AND selected_workflow.group_count > 0
    AND outcome_count = selected_workflow.group_count
    AND complete_count > 0
    AND incomplete_count = 0
    AND missing_image_count = 0;

  IF selected_run.status = 'completed' AND NOT valid_completion THEN
    UPDATE public.classifier_import_runs AS run
    SET
      status = 'completed_with_errors',
      error_code = 'seller_classifier_import_incomplete',
      retryable = true
    WHERE run.id = selected_run.id
    RETURNING run.* INTO selected_run;
  END IF;

  SELECT *
  INTO image_state
  FROM public.classifier_import_image_action_state(selected_run.id);

  workflow_retryable :=
    selected_run.retryable
    OR has_retryable_group_failure
    OR coalesce(image_state.has_retryable_failures, false);

  IF valid_completion THEN
    UPDATE public.seller_classifier_batches AS workflow
    SET
      last_known_stage = 'drafts_ready',
      product_draft_count = product_count,
      error_code = NULL,
      retryable = false
    WHERE workflow.id = selected_workflow.id;
  ELSE
    workflow_error_code := CASE
      WHEN selected_run.status = 'completed_with_errors'
        THEN 'seller_classifier_import_incomplete'
      WHEN selected_run.error_code ~ '^[a-z0-9_]{1,128}$'
        THEN selected_run.error_code
      ELSE 'seller_classifier_import_failed'
    END;

    UPDATE public.seller_classifier_batches AS workflow
    SET
      last_known_stage = 'failed',
      product_draft_count = product_count,
      error_code = workflow_error_code,
      retryable = workflow_retryable
    WHERE workflow.id = selected_workflow.id;
  END IF;

  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.create_or_get_owned_classifier_import(
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
        OR (
          selected_run.seller_classifier_workflow_id IS NOT NULL
          AND selected_run.seller_classifier_workflow_id <> p_workflow_id
        )
      THEN
        selected_result := 'ownership_conflict';
      ELSE
        IF selected_run.seller_classifier_workflow_id IS NULL THEN
          UPDATE public.classifier_import_runs AS run
          SET seller_classifier_workflow_id = p_workflow_id
          WHERE run.id = selected_run.id
          RETURNING run.* INTO selected_run;
        END IF;
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
            OR (
              selected_run.seller_classifier_workflow_id IS NOT NULL
              AND selected_run.seller_classifier_workflow_id <> p_workflow_id
            )
          THEN
            selected_result := 'ownership_conflict';
          ELSE
            IF selected_run.seller_classifier_workflow_id IS NULL THEN
              UPDATE public.classifier_import_runs AS run
              SET seller_classifier_workflow_id = p_workflow_id
              WHERE run.id = selected_run.id
              RETURNING run.* INTO selected_run;
            END IF;
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

CREATE FUNCTION public.get_owned_seller_classifier_import(
  p_workflow_id uuid,
  p_seller_id uuid
)
RETURNS SETOF public.classifier_import_runs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT run.*
  FROM public.classifier_import_runs AS run
  JOIN public.seller_classifier_batches AS workflow
    ON workflow.id = run.seller_classifier_workflow_id
    AND workflow.seller_id = run.seller_id
  WHERE workflow.id = p_workflow_id
    AND workflow.seller_id = p_seller_id;
$$;

CREATE FUNCTION public.prepare_classifier_import_group_at_position(
  p_import_id uuid,
  p_attempt_token uuid,
  p_classifier_group_id uuid,
  p_approved_category_slug text,
  p_source_cover_classifier_image_id uuid,
  p_source_group_position integer
)
RETURNS TABLE (
  result text,
  product_draft_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prepared record;
BEGIN
  IF p_source_group_position IS NULL OR p_source_group_position < 0 THEN
    RAISE EXCEPTION 'classifier_import_group_position_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO prepared
  FROM public.prepare_classifier_import_group(
    p_import_id,
    p_attempt_token,
    p_classifier_group_id,
    p_approved_category_slug,
    p_source_cover_classifier_image_id
  );

  IF prepared.result <> 'claim_lost' THEN
    UPDATE public.classifier_import_group_outcomes AS outcome
    SET source_group_position = p_source_group_position
    WHERE outcome.classifier_import_run_id = p_import_id
      AND outcome.classifier_group_id = p_classifier_group_id
      AND EXISTS (
        SELECT 1
        FROM public.classifier_import_runs AS run
        WHERE run.id = p_import_id
          AND run.status = 'running'
          AND run.attempt_token = p_attempt_token
      );

    IF NOT FOUND THEN
      RETURN QUERY SELECT 'claim_lost'::text, NULL::uuid;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT prepared.result::text, prepared.product_draft_id::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_classifier_import_run(
  p_import_id uuid,
  p_attempt_token uuid,
  p_status public.classifier_import_status,
  p_error_code text,
  p_retryable boolean
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  linked_workflow_id uuid;
BEGIN
  IF p_status NOT IN ('completed', 'completed_with_errors', 'failed') THEN
    RAISE EXCEPTION 'invalid terminal import status';
  END IF;

  UPDATE public.classifier_import_runs AS run
  SET
    status = p_status,
    error_code = p_error_code,
    retryable = p_retryable,
    attempt_token = NULL,
    claim_started_at = NULL,
    last_heartbeat_at = NULL,
    completed_at = now()
  WHERE run.id = p_import_id
    AND run.status = 'running'
    AND run.attempt_token = p_attempt_token
  RETURNING run.seller_classifier_workflow_id INTO linked_workflow_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF linked_workflow_id IS NOT NULL
    AND NOT public.project_classifier_import_to_seller_workflow(p_import_id)
  THEN
    RAISE EXCEPTION 'seller_classifier_import_projection_failed'
      USING ERRCODE = '55000';
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_classifier_import(
  p_import_id uuid,
  p_include_non_retryable boolean
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.classifier_import_runs%ROWTYPE;
  image_state record;
  affected_group_ids uuid[];
  has_selected_failure boolean;
BEGIN
  SELECT run.*
  INTO selected_run
  FROM public.classifier_import_runs AS run
  WHERE run.id = p_import_id
  FOR UPDATE;

  IF selected_run.id IS NULL THEN
    RETURN 'not_found';
  END IF;

  IF selected_run.status NOT IN ('failed', 'completed_with_errors')
    OR selected_run.attempt_token IS NOT NULL
  THEN
    RETURN 'not_allowed';
  END IF;

  SELECT *
  INTO image_state
  FROM public.classifier_import_image_action_state(p_import_id);

  SELECT
    selected_run.retryable
    OR (
      selected_run.status = 'failed'
      AND p_include_non_retryable
    )
    OR EXISTS (
      SELECT 1
      FROM public.classifier_import_group_outcomes AS outcome
      WHERE outcome.classifier_import_run_id = p_import_id
        AND outcome.status = 'failed'
        AND (outcome.retryable OR p_include_non_retryable)
    )
    OR (
      CASE
        WHEN p_include_non_retryable THEN image_state.has_any_failures
        ELSE image_state.has_retryable_failures
      END
    )
  INTO has_selected_failure;

  IF NOT has_selected_failure THEN
    RETURN 'noop';
  END IF;

  affected_group_ids := public.classifier_import_reset_failed_promotions(
    p_import_id,
    p_include_non_retryable
  );

  UPDATE public.classifier_import_group_outcomes AS outcome
  SET
    status = 'pending',
    error_code = NULL,
    retryable = false
  WHERE outcome.classifier_import_run_id = p_import_id
    AND outcome.status = 'failed'
    AND (
      outcome.retryable
      OR p_include_non_retryable
      OR outcome.classifier_group_id = ANY(affected_group_ids)
    );

  UPDATE public.classifier_import_runs AS run
  SET
    status = 'pending',
    operation_kind = 'import',
    error_code = NULL,
    retryable = false,
    retry_policy = CASE
      WHEN p_include_non_retryable
        THEN 'include_non_retryable'::public.classifier_import_retry_policy
      ELSE 'retryable_only'::public.classifier_import_retry_policy
    END,
    attempt_token = NULL,
    claim_started_at = NULL,
    last_heartbeat_at = NULL,
    completed_at = NULL
  WHERE run.id = p_import_id;

  IF selected_run.seller_classifier_workflow_id IS NOT NULL THEN
    UPDATE public.seller_classifier_batches AS workflow
    SET
      last_known_stage = 'importing',
      error_code = NULL,
      retryable = false
    WHERE workflow.id = selected_run.seller_classifier_workflow_id
      AND workflow.seller_id = selected_run.seller_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'seller_classifier_import_projection_failed'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN 'requeued';
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_classifier_import_workflow_immutability()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_seller_classifier_batch_approved(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.project_classifier_import_to_seller_workflow(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_or_get_owned_classifier_import(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_owned_seller_classifier_import(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_classifier_import_group_at_position(
  uuid,
  uuid,
  uuid,
  text,
  uuid,
  integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_seller_classifier_batch_approved(uuid, uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.project_classifier_import_to_seller_workflow(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.create_or_get_owned_classifier_import(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_owned_seller_classifier_import(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_classifier_import_group_at_position(
  uuid,
  uuid,
  uuid,
  text,
  uuid,
  integer
) TO service_role;

COMMIT;
