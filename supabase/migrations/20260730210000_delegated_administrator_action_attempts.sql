BEGIN;

CREATE TABLE public.delegated_administrator_action_attempts (
  request_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES public.seller_classifier_batches(id),
  seller_id uuid NOT NULL REFERENCES public.sellers(id),
  administrator_user_id uuid NOT NULL,
  action_type text NOT NULL,
  target_id uuid,
  request_fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  attempt_token uuid,
  claim_started_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT delegated_administrator_action_type_check
    CHECK (
      action_type IN (
        'approve_group',
        'approve_and_create_drafts',
        'retry_draft_import',
        'publish_product_draft',
        'retry_product_publication'
      )
    ),
  CONSTRAINT delegated_administrator_action_target_check
    CHECK (
      (action_type = 'approve_and_create_drafts' AND target_id IS NULL)
      OR (
        action_type IN (
          'approve_group',
          'retry_draft_import',
          'publish_product_draft',
          'retry_product_publication'
        )
        AND target_id IS NOT NULL
      )
    ),
  CONSTRAINT delegated_administrator_action_fingerprint_check
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT delegated_administrator_action_status_check
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  CONSTRAINT delegated_administrator_action_attempt_count_check
    CHECK (attempt_count >= 0),
  CONSTRAINT delegated_administrator_action_error_code_check
    CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,128}$'),
  CONSTRAINT delegated_administrator_action_status_shape_check
    CHECK (
      (
        status = 'pending'
        AND attempt_count = 0
        AND attempt_token IS NULL
        AND claim_started_at IS NULL
        AND completed_at IS NULL
        AND error_code IS NULL
      )
      OR (
        status = 'running'
        AND attempt_count > 0
        AND attempt_token IS NOT NULL
        AND claim_started_at IS NOT NULL
        AND completed_at IS NULL
        AND error_code IS NULL
      )
      OR (
        status = 'succeeded'
        AND attempt_count > 0
        AND attempt_token IS NULL
        AND claim_started_at IS NOT NULL
        AND completed_at IS NOT NULL
        AND error_code IS NULL
      )
      OR (
        status = 'failed'
        AND attempt_count > 0
        AND attempt_token IS NULL
        AND claim_started_at IS NOT NULL
        AND completed_at IS NOT NULL
        AND error_code IS NOT NULL
      )
    )
);

CREATE INDEX delegated_administrator_action_claim_candidates
  ON public.delegated_administrator_action_attempts (
    status,
    claim_started_at,
    created_at,
    request_id
  )
  WHERE status IN ('pending', 'running');

CREATE INDEX delegated_administrator_action_workflow_audit
  ON public.delegated_administrator_action_attempts (
    workflow_id,
    action_type,
    created_at DESC,
    request_id
  );

ALTER TABLE public.delegated_administrator_action_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.delegated_administrator_action_attempts
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.delegated_administrator_action_attempts TO service_role;

CREATE FUNCTION public.claim_delegated_administrator_action(
  p_request_id uuid,
  p_workflow_id uuid,
  p_administrator_user_id uuid,
  p_action_type text,
  p_target_id uuid,
  p_request_fingerprint text,
  p_lease_timeout_seconds integer
)
RETURNS TABLE (
  operation_result text,
  seller_id uuid,
  target_id uuid,
  status text,
  attempt_count integer,
  attempt_token uuid,
  error_code text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_workflow public.seller_classifier_batches%ROWTYPE;
  selected_attempt public.delegated_administrator_action_attempts%ROWTYPE;
  selected_result text;
BEGIN
  IF p_request_id IS NULL
    OR p_workflow_id IS NULL
    OR p_administrator_user_id IS NULL
    OR p_action_type IS NULL
    OR p_request_fingerprint IS NULL
    OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_lease_timeout_seconds IS NULL
    OR p_lease_timeout_seconds < 31
    OR p_lease_timeout_seconds > 900
    OR p_action_type NOT IN (
      'approve_group',
      'approve_and_create_drafts',
      'retry_draft_import',
      'publish_product_draft',
      'retry_product_publication'
    )
    OR (
      p_action_type = 'approve_and_create_drafts'
      AND p_target_id IS NOT NULL
    )
    OR (
      p_action_type <> 'approve_and_create_drafts'
      AND p_target_id IS NULL
    )
  THEN
    RAISE EXCEPTION 'delegated_action_claim_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT workflow.*
  INTO selected_workflow
  FROM public.seller_classifier_batches AS workflow
  WHERE workflow.id = p_workflow_id
    AND workflow.initiator_kind = 'administrator'
    AND EXISTS (
      SELECT 1
      FROM public.sellers AS seller
      WHERE seller.id = workflow.seller_id
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      'workflow_not_found'::text,
      NULL::uuid,
      NULL::uuid,
      NULL::text,
      0,
      NULL::uuid,
      NULL::text;
    RETURN;
  END IF;

  INSERT INTO public.delegated_administrator_action_attempts (
    request_id,
    workflow_id,
    seller_id,
    administrator_user_id,
    action_type,
    target_id,
    request_fingerprint
  )
  VALUES (
    p_request_id,
    selected_workflow.id,
    selected_workflow.seller_id,
    p_administrator_user_id,
    p_action_type,
    p_target_id,
    p_request_fingerprint
  )
  ON CONFLICT (request_id) DO NOTHING;

  SELECT attempt.*
  INTO STRICT selected_attempt
  FROM public.delegated_administrator_action_attempts AS attempt
  WHERE attempt.request_id = p_request_id
  FOR UPDATE;

  IF selected_attempt.workflow_id IS DISTINCT FROM selected_workflow.id
    OR selected_attempt.seller_id IS DISTINCT FROM selected_workflow.seller_id
    OR selected_attempt.administrator_user_id IS DISTINCT FROM p_administrator_user_id
    OR selected_attempt.action_type IS DISTINCT FROM p_action_type
    OR selected_attempt.target_id IS DISTINCT FROM p_target_id
    OR selected_attempt.request_fingerprint IS DISTINCT FROM p_request_fingerprint
  THEN
    selected_result := 'request_conflict';
  END IF;

  IF selected_result IS NULL THEN
    IF selected_attempt.status = 'succeeded' THEN
      selected_result := 'succeeded';
    ELSIF selected_attempt.status = 'failed' THEN
      selected_result := 'failed';
    ELSIF selected_attempt.status = 'running'
      AND selected_attempt.claim_started_at >
        now() - make_interval(secs => p_lease_timeout_seconds)
    THEN
      selected_result := 'in_progress';
    ELSE
      UPDATE public.delegated_administrator_action_attempts AS attempt
      SET
        status = 'running',
        attempt_count = attempt.attempt_count + 1,
        attempt_token = gen_random_uuid(),
        claim_started_at = now(),
        completed_at = NULL,
        error_code = NULL
      WHERE attempt.request_id = selected_attempt.request_id
      RETURNING *
      INTO selected_attempt;
      selected_result := 'claimed';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    selected_result,
    selected_attempt.seller_id,
    selected_attempt.target_id,
    selected_attempt.status,
    selected_attempt.attempt_count,
    selected_attempt.attempt_token,
    selected_attempt.error_code;
END;
$$;

CREATE FUNCTION public.finalize_delegated_administrator_action_success(
  p_request_id uuid,
  p_attempt_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_request_id IS NULL OR p_attempt_token IS NULL THEN
    RAISE EXCEPTION 'delegated_action_finalize_invalid'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.delegated_administrator_action_attempts AS attempt
  SET
    status = 'succeeded',
    attempt_token = NULL,
    error_code = NULL,
    completed_at = now()
  WHERE attempt.request_id = p_request_id
    AND attempt.status = 'running'
    AND attempt.attempt_token = p_attempt_token;

  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.finalize_delegated_administrator_action_failure(
  p_request_id uuid,
  p_attempt_token uuid,
  p_error_code text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_request_id IS NULL
    OR p_attempt_token IS NULL
    OR p_error_code IS NULL
    OR p_error_code !~ '^[a-z0-9_]{1,128}$'
  THEN
    RAISE EXCEPTION 'delegated_action_finalize_invalid'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.delegated_administrator_action_attempts AS attempt
  SET
    status = 'failed',
    attempt_token = NULL,
    error_code = p_error_code,
    completed_at = now()
  WHERE attempt.request_id = p_request_id
    AND attempt.status = 'running'
    AND attempt.attempt_token = p_attempt_token;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_delegated_administrator_action(
  uuid,
  uuid,
  uuid,
  text,
  uuid,
  text,
  integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_delegated_administrator_action(
  uuid,
  uuid,
  uuid,
  text,
  uuid,
  text,
  integer
) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_delegated_administrator_action_success(
  uuid,
  uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_delegated_administrator_action_success(
  uuid,
  uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_delegated_administrator_action_failure(
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_delegated_administrator_action_failure(
  uuid,
  uuid,
  text
) TO service_role;

COMMIT;
