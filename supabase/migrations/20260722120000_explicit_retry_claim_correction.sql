DROP INDEX IF EXISTS public.classifier_import_runs_worker_candidates;

CREATE INDEX classifier_import_runs_worker_candidates
  ON public.classifier_import_runs (updated_at, id)
  WHERE status IN ('pending', 'running');

CREATE OR REPLACE FUNCTION public.claim_next_classifier_import_run(
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

CREATE OR REPLACE FUNCTION public.claim_classifier_image_promotion(
  p_import_id uuid,
  p_run_attempt_token uuid,
  p_promotion_id uuid,
  p_claim_timeout_seconds integer
)
RETURNS SETOF public.product_draft_image_promotions
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_claim_timeout_seconds <= 0 THEN
    RAISE EXCEPTION 'p_claim_timeout_seconds must be positive';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    UPDATE public.product_draft_image_promotions AS promotion
    SET
      status = 'started',
      attempt_count = promotion.attempt_count + 1,
      attempt_token = gen_random_uuid(),
      claim_started_at = now(),
      last_attempt_at = now(),
      error_code = NULL,
      retryable = false,
      destination_size_bytes = NULL,
      promoted_at = NULL
    WHERE promotion.id = p_promotion_id
      AND (
        promotion.status = 'pending'
        OR (
          promotion.status = 'started'
          AND promotion.claim_started_at
            < now() - make_interval(secs => p_claim_timeout_seconds)
        )
      )
      AND EXISTS (
        SELECT 1
        FROM public.classifier_import_runs AS run
        JOIN public.classifier_import_group_outcomes AS outcome
          ON outcome.classifier_import_run_id = run.id
          AND outcome.classifier_group_id = promotion.classifier_group_id
          AND outcome.product_draft_id = promotion.product_draft_id
        WHERE run.id = p_import_id
          AND run.status = 'running'
          AND run.attempt_token = p_run_attempt_token
          AND run.classifier_organization_id = promotion.classifier_organization_id
          AND run.classifier_batch_id = promotion.classifier_batch_id
      )
    RETURNING promotion.*
  ),
  image_updated AS (
    UPDATE public.product_draft_images AS draft_image
    SET
      status = 'pending',
      content_type = NULL,
      size_bytes = NULL
    FROM claimed
    WHERE draft_image.id = claimed.product_draft_image_id
  )
  UPDATE public.classifier_import_group_outcomes AS outcome
  SET
    status = 'processing',
    error_code = NULL,
    retryable = false
  FROM claimed
  WHERE outcome.classifier_import_run_id = p_import_id
    AND outcome.classifier_group_id = claimed.classifier_group_id
  RETURNING claimed.*;
END;
$$;
