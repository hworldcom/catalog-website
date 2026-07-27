CREATE TYPE public.classifier_import_status AS ENUM (
  'pending',
  'running',
  'completed',
  'completed_with_errors',
  'failed'
);

CREATE TYPE public.classifier_import_operation_kind AS ENUM (
  'import',
  'reconcile'
);

CREATE TYPE public.classifier_import_retry_policy AS ENUM (
  'retryable_only',
  'include_non_retryable'
);

CREATE TYPE public.classifier_import_group_status AS ENUM (
  'pending',
  'processing',
  'complete',
  'failed'
);

ALTER TABLE public.products
  ADD COLUMN classifier_organization_id uuid,
  ADD COLUMN classifier_group_id uuid;

ALTER TABLE public.products
  ADD CONSTRAINT products_classifier_source_identity_complete
  CHECK (
    (classifier_organization_id IS NULL AND classifier_group_id IS NULL)
    OR
    (classifier_organization_id IS NOT NULL AND classifier_group_id IS NOT NULL)
  );

CREATE UNIQUE INDEX products_classifier_source_identity_unique
  ON public.products (classifier_organization_id, classifier_group_id)
  WHERE classifier_organization_id IS NOT NULL;

CREATE TABLE public.classifier_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classifier_organization_id uuid NOT NULL,
  classifier_batch_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  pipeline_version text,
  status public.classifier_import_status NOT NULL DEFAULT 'pending',
  operation_kind public.classifier_import_operation_kind NOT NULL DEFAULT 'import',
  requested_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  attempt_token uuid,
  claim_started_at timestamptz,
  last_heartbeat_at timestamptz,
  error_code text,
  retryable boolean NOT NULL DEFAULT false,
  retry_policy public.classifier_import_retry_policy NOT NULL DEFAULT 'retryable_only',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classifier_import_runs_source_unique
    UNIQUE (classifier_organization_id, classifier_batch_id),
  CONSTRAINT classifier_import_runs_claim_fields_consistent
    CHECK (
      (status = 'running' AND attempt_token IS NOT NULL
        AND claim_started_at IS NOT NULL AND last_heartbeat_at IS NOT NULL)
      OR
      (status <> 'running' AND attempt_token IS NULL
        AND claim_started_at IS NULL AND last_heartbeat_at IS NULL)
    )
);

CREATE INDEX classifier_import_runs_worker_candidates
  ON public.classifier_import_runs (updated_at, id)
  WHERE status IN ('pending', 'running', 'failed');

CREATE TRIGGER trg_classifier_import_runs_updated
  BEFORE UPDATE ON public.classifier_import_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.classifier_import_group_outcomes (
  classifier_import_run_id uuid NOT NULL
    REFERENCES public.classifier_import_runs(id) ON DELETE CASCADE,
  classifier_group_id uuid NOT NULL,
  product_draft_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  approved_category_slug text NOT NULL CHECK (length(btrim(approved_category_slug)) > 0),
  source_cover_classifier_image_id uuid NOT NULL,
  status public.classifier_import_group_status NOT NULL DEFAULT 'pending',
  error_code text,
  retryable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (classifier_import_run_id, classifier_group_id)
);

CREATE INDEX classifier_import_group_outcomes_status
  ON public.classifier_import_group_outcomes (classifier_import_run_id, status);

CREATE TRIGGER trg_classifier_import_group_outcomes_updated
  BEFORE UPDATE ON public.classifier_import_group_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON public.classifier_import_runs TO service_role;
GRANT ALL ON public.classifier_import_group_outcomes TO service_role;

ALTER TABLE public.classifier_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classifier_import_group_outcomes ENABLE ROW LEVEL SECURITY;

-- Ticket 0024b2 replaces these two hooks with promotion-aware implementations.
CREATE FUNCTION public.classifier_import_image_action_state(p_import_id uuid)
RETURNS TABLE (
  has_retryable_failures boolean,
  has_any_failures boolean,
  has_promoted_images boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT false, false, false;
$$;

CREATE FUNCTION public.classifier_import_reset_failed_promotions(
  p_import_id uuid,
  p_include_non_retryable boolean
)
RETURNS uuid[]
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY[]::uuid[];
$$;

CREATE FUNCTION public.claim_next_classifier_import_run(
  p_lease_timeout_seconds integer
)
RETURNS SETOF public.classifier_import_runs
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_lease_timeout_seconds <= 0 THEN
    RAISE EXCEPTION 'p_lease_timeout_seconds must be positive';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT run.id
    FROM public.classifier_import_runs AS run
    WHERE
      run.status = 'pending'
      OR (run.status = 'failed' AND run.retryable)
      OR (
        run.status = 'running'
        AND run.last_heartbeat_at
          < now() - make_interval(secs => p_lease_timeout_seconds)
      )
    ORDER BY run.updated_at, run.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.classifier_import_runs AS run
  SET
    status = 'running',
    operation_kind = CASE
      WHEN run.status = 'failed' THEN 'import'::public.classifier_import_operation_kind
      ELSE run.operation_kind
    END,
    attempt_count = run.attempt_count + 1,
    attempt_token = gen_random_uuid(),
    claim_started_at = now(),
    last_heartbeat_at = now(),
    error_code = NULL,
    retryable = false,
    completed_at = NULL
  FROM candidate
  WHERE run.id = candidate.id
  RETURNING run.*;
END;
$$;

CREATE FUNCTION public.heartbeat_classifier_import_run(
  p_import_id uuid,
  p_attempt_token uuid
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE public.classifier_import_runs
    SET last_heartbeat_at = now()
    WHERE id = p_import_id
      AND status = 'running'
      AND attempt_token = p_attempt_token
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM updated);
$$;

CREATE FUNCTION public.set_classifier_import_pipeline_version(
  p_import_id uuid,
  p_attempt_token uuid,
  p_pipeline_version text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_pipeline_version IS NULL OR length(btrim(p_pipeline_version)) = 0 THEN
    RAISE EXCEPTION 'p_pipeline_version must be nonblank';
  END IF;

  UPDATE public.classifier_import_runs
  SET pipeline_version = p_pipeline_version
  WHERE id = p_import_id
    AND status = 'running'
    AND attempt_token = p_attempt_token;

  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.prepare_classifier_import_group(
  p_import_id uuid,
  p_attempt_token uuid,
  p_classifier_group_id uuid,
  p_approved_category_slug text,
  p_source_cover_classifier_image_id uuid
)
RETURNS TABLE (
  result text,
  product_draft_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_run public.classifier_import_runs%ROWTYPE;
  selected_category_id uuid;
  selected_product_id uuid;
  selected_product_seller_id uuid;
BEGIN
  SELECT *
  INTO selected_run
  FROM public.classifier_import_runs
  WHERE id = p_import_id
    AND status = 'running'
    AND attempt_token = p_attempt_token
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'claim_lost'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT id
  INTO selected_category_id
  FROM public.categories
  WHERE slug = p_approved_category_slug;

  IF selected_category_id IS NULL THEN
    INSERT INTO public.classifier_import_group_outcomes (
      classifier_import_run_id,
      classifier_group_id,
      product_draft_id,
      approved_category_slug,
      source_cover_classifier_image_id,
      status,
      error_code,
      retryable
    )
    VALUES (
      p_import_id,
      p_classifier_group_id,
      NULL,
      p_approved_category_slug,
      p_source_cover_classifier_image_id,
      'failed',
      'category_not_mapped',
      false
    )
    ON CONFLICT (classifier_import_run_id, classifier_group_id)
    DO UPDATE SET
      approved_category_slug = EXCLUDED.approved_category_slug,
      source_cover_classifier_image_id = EXCLUDED.source_cover_classifier_image_id,
      status = 'failed',
      error_code = 'category_not_mapped',
      retryable = false;

    RETURN QUERY SELECT 'category_not_mapped'::text, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.products (
    seller_id,
    category_id,
    title,
    status,
    classifier_organization_id,
    classifier_group_id
  )
  VALUES (
    selected_run.seller_id,
    selected_category_id,
    '',
    'draft',
    selected_run.classifier_organization_id,
    p_classifier_group_id
  )
  ON CONFLICT (classifier_organization_id, classifier_group_id)
    WHERE classifier_organization_id IS NOT NULL
  DO NOTHING
  RETURNING id, seller_id
  INTO selected_product_id, selected_product_seller_id;

  IF selected_product_id IS NULL THEN
    SELECT id, seller_id
    INTO selected_product_id, selected_product_seller_id
    FROM public.products
    WHERE classifier_organization_id = selected_run.classifier_organization_id
      AND classifier_group_id = p_classifier_group_id;
  END IF;

  IF selected_product_id IS NULL
    OR selected_product_seller_id <> selected_run.seller_id
  THEN
    INSERT INTO public.classifier_import_group_outcomes (
      classifier_import_run_id,
      classifier_group_id,
      product_draft_id,
      approved_category_slug,
      source_cover_classifier_image_id,
      status,
      error_code,
      retryable
    )
    VALUES (
      p_import_id,
      p_classifier_group_id,
      NULL,
      p_approved_category_slug,
      p_source_cover_classifier_image_id,
      'failed',
      'product_draft_source_conflict',
      false
    )
    ON CONFLICT (classifier_import_run_id, classifier_group_id)
    DO UPDATE SET
      approved_category_slug = EXCLUDED.approved_category_slug,
      source_cover_classifier_image_id = EXCLUDED.source_cover_classifier_image_id,
      status = 'failed',
      error_code = 'product_draft_source_conflict',
      retryable = false;

    RETURN QUERY SELECT 'product_draft_source_conflict'::text, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.classifier_import_group_outcomes (
    classifier_import_run_id,
    classifier_group_id,
    product_draft_id,
    approved_category_slug,
    source_cover_classifier_image_id,
    status,
    error_code,
    retryable
  )
  VALUES (
    p_import_id,
    p_classifier_group_id,
    selected_product_id,
    p_approved_category_slug,
    p_source_cover_classifier_image_id,
    'pending',
    NULL,
    false
  )
  ON CONFLICT (classifier_import_run_id, classifier_group_id)
  DO UPDATE SET
    product_draft_id = EXCLUDED.product_draft_id,
    approved_category_slug = EXCLUDED.approved_category_slug,
    source_cover_classifier_image_id = EXCLUDED.source_cover_classifier_image_id,
    status = 'pending',
    error_code = NULL,
    retryable = false;

  RETURN QUERY SELECT 'prepared'::text, selected_product_id;
END;
$$;

CREATE FUNCTION public.set_classifier_import_group_result(
  p_import_id uuid,
  p_attempt_token uuid,
  p_classifier_group_id uuid,
  p_status public.classifier_import_group_status,
  p_error_code text,
  p_retryable boolean
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('pending', 'processing', 'complete', 'failed') THEN
    RAISE EXCEPTION 'invalid group status';
  END IF;

  UPDATE public.classifier_import_group_outcomes AS outcome
  SET
    status = p_status,
    error_code = p_error_code,
    retryable = p_retryable
  WHERE outcome.classifier_import_run_id = p_import_id
    AND outcome.classifier_group_id = p_classifier_group_id
    AND EXISTS (
      SELECT 1
      FROM public.classifier_import_runs AS run
      WHERE run.id = p_import_id
        AND run.status = 'running'
        AND run.attempt_token = p_attempt_token
    );

  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.finalize_classifier_import_run(
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
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('completed', 'completed_with_errors', 'failed') THEN
    RAISE EXCEPTION 'invalid terminal import status';
  END IF;

  UPDATE public.classifier_import_runs
  SET
    status = p_status,
    error_code = p_error_code,
    retryable = p_retryable,
    attempt_token = NULL,
    claim_started_at = NULL,
    last_heartbeat_at = NULL,
    completed_at = now()
  WHERE id = p_import_id
    AND status = 'running'
    AND attempt_token = p_attempt_token;

  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.get_classifier_import_action_state(p_import_id uuid)
RETURNS TABLE (
  can_retry_temporary boolean,
  can_retry_all boolean,
  can_reconcile boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_run public.classifier_import_runs%ROWTYPE;
  image_state record;
  has_retryable_group_failure boolean;
  has_any_group_failure boolean;
BEGIN
  SELECT *
  INTO selected_run
  FROM public.classifier_import_runs
  WHERE id = p_import_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT *
  INTO image_state
  FROM public.classifier_import_image_action_state(p_import_id);

  SELECT
    EXISTS (
      SELECT 1
      FROM public.classifier_import_group_outcomes
      WHERE classifier_import_run_id = p_import_id
        AND status = 'failed'
        AND retryable
    ),
    EXISTS (
      SELECT 1
      FROM public.classifier_import_group_outcomes
      WHERE classifier_import_run_id = p_import_id
        AND status = 'failed'
    )
  INTO has_retryable_group_failure, has_any_group_failure;

  can_retry_temporary :=
    selected_run.status IN ('failed', 'completed_with_errors')
    AND selected_run.attempt_token IS NULL
    AND (
      (selected_run.status = 'failed' AND selected_run.retryable)
      OR has_retryable_group_failure
      OR image_state.has_retryable_failures
    );

  can_retry_all :=
    selected_run.status IN ('failed', 'completed_with_errors')
    AND selected_run.attempt_token IS NULL
    AND (
      selected_run.status = 'failed'
      OR has_any_group_failure
      OR image_state.has_any_failures
    );

  can_reconcile :=
    selected_run.status = 'completed'
    AND selected_run.attempt_token IS NULL
    AND image_state.has_promoted_images;

  RETURN NEXT;
END;
$$;

CREATE FUNCTION public.retry_classifier_import(
  p_import_id uuid,
  p_include_non_retryable boolean
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_run public.classifier_import_runs%ROWTYPE;
  image_state record;
  affected_group_ids uuid[];
  has_selected_failure boolean;
BEGIN
  SELECT *
  INTO selected_run
  FROM public.classifier_import_runs
  WHERE id = p_import_id
  FOR UPDATE;

  IF NOT FOUND THEN
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
    (
      selected_run.status = 'failed'
      AND (selected_run.retryable OR p_include_non_retryable)
    )
    OR EXISTS (
      SELECT 1
      FROM public.classifier_import_group_outcomes
      WHERE classifier_import_run_id = p_import_id
        AND status = 'failed'
        AND (retryable OR p_include_non_retryable)
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

  UPDATE public.classifier_import_group_outcomes
  SET
    status = 'pending',
    error_code = NULL,
    retryable = false
  WHERE classifier_import_run_id = p_import_id
    AND status = 'failed'
    AND (
      retryable
      OR p_include_non_retryable
      OR classifier_group_id = ANY(affected_group_ids)
    );

  UPDATE public.classifier_import_runs
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
  WHERE id = p_import_id;

  RETURN 'requeued';
END;
$$;

CREATE FUNCTION public.reconcile_classifier_import(p_import_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_run public.classifier_import_runs%ROWTYPE;
  image_state record;
BEGIN
  SELECT *
  INTO selected_run
  FROM public.classifier_import_runs
  WHERE id = p_import_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  SELECT *
  INTO image_state
  FROM public.classifier_import_image_action_state(p_import_id);

  IF selected_run.status <> 'completed'
    OR selected_run.attempt_token IS NOT NULL
    OR NOT image_state.has_promoted_images
  THEN
    RETURN 'not_allowed';
  END IF;

  UPDATE public.classifier_import_runs
  SET
    status = 'pending',
    operation_kind = 'reconcile',
    error_code = NULL,
    retryable = false,
    retry_policy = 'retryable_only',
    attempt_token = NULL,
    claim_started_at = NULL,
    last_heartbeat_at = NULL,
    completed_at = NULL
  WHERE id = p_import_id;

  RETURN 'requeued';
END;
$$;

REVOKE ALL ON FUNCTION public.classifier_import_image_action_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classifier_import_reset_failed_promotions(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_next_classifier_import_run(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.heartbeat_classifier_import_run(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_classifier_import_pipeline_version(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_classifier_import_group(uuid, uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_classifier_import_group_result(
  uuid,
  uuid,
  uuid,
  public.classifier_import_group_status,
  text,
  boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_classifier_import_run(
  uuid,
  uuid,
  public.classifier_import_status,
  text,
  boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_classifier_import_action_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retry_classifier_import(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_classifier_import(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.classifier_import_image_action_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.classifier_import_reset_failed_promotions(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_classifier_import_run(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_classifier_import_run(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_classifier_import_pipeline_version(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_classifier_import_group(uuid, uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_classifier_import_group_result(
  uuid,
  uuid,
  uuid,
  public.classifier_import_group_status,
  text,
  boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_classifier_import_run(
  uuid,
  uuid,
  public.classifier_import_status,
  text,
  boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_classifier_import_action_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_classifier_import(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_classifier_import(uuid) TO service_role;
