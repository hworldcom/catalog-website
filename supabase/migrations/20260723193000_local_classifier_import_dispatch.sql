CREATE FUNCTION public.claim_classifier_import_run(
  p_import_id uuid,
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
    WHERE run.id = p_import_id
      AND (
        run.status = 'pending'
        OR (
          run.status = 'running'
          AND run.last_heartbeat_at
            < now() - make_interval(secs => p_lease_timeout_seconds)
        )
      )
    FOR UPDATE SKIP LOCKED
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

REVOKE ALL ON FUNCTION public.claim_classifier_import_run(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_classifier_import_run(uuid, integer) TO service_role;
