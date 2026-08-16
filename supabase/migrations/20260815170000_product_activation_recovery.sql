BEGIN;

ALTER TABLE public.product_image_publication_runs
  DROP CONSTRAINT product_image_publication_runs_phase,
  DROP CONSTRAINT product_image_publication_runs_worker_state;

ALTER TABLE public.product_image_publication_runs
  ADD CONSTRAINT product_image_publication_runs_phase
    CHECK (phase IN ('activation', 'pre_switch_cleanup', 'post_switch_cleanup')),
  ADD CONSTRAINT product_image_publication_runs_worker_state
    CHECK (
      (status = 'pending'
        AND attempt_token IS NULL
        AND claim_started_at IS NULL
        AND error_code IS NULL
        AND completed_at IS NULL
        AND abandoned_at IS NULL)
      OR (status = 'running'
        AND dispatch_status = 'dispatched'
        AND attempt_token IS NOT NULL
        AND claim_started_at IS NOT NULL
        AND error_code IS NULL
        AND completed_at IS NULL
        AND abandoned_at IS NULL)
      OR (status = 'failed'
        AND phase = 'activation'
        AND attempt_token IS NULL
        AND claim_started_at IS NULL
        AND length(btrim(error_code)) > 0
        AND completed_at IS NULL
        AND abandoned_at IS NULL)
      OR (status = 'cleanup_required'
        AND phase IN ('pre_switch_cleanup', 'post_switch_cleanup')
        AND attempt_token IS NULL
        AND claim_started_at IS NULL
        AND length(btrim(error_code)) > 0
        AND completed_at IS NULL
        AND abandoned_at IS NULL)
      OR (status = 'completed'
        AND dispatch_status = 'dispatched'
        AND attempt_token IS NULL
        AND claim_started_at IS NULL
        AND error_code IS NULL
        AND completed_at IS NOT NULL
        AND abandoned_at IS NULL)
      OR (status = 'abandoned'
        AND phase = 'pre_switch_cleanup'
        AND attempt_token IS NULL
        AND claim_started_at IS NULL
        AND length(btrim(error_code)) > 0
        AND completed_at IS NULL
        AND abandoned_at IS NOT NULL)
    );

CREATE OR REPLACE FUNCTION public.enforce_product_activation_run_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.moderation_submission_id IS DISTINCT FROM OLD.moderation_submission_id
    OR NEW.product_id IS DISTINCT FROM OLD.product_id
    OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
    OR NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash
    OR NEW.expected_submission_revision IS DISTINCT FROM OLD.expected_submission_revision
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'product_activation_run_immutable' USING ERRCODE = '23514';
  END IF;

  IF NEW.phase IS DISTINCT FROM OLD.phase AND NOT (
    OLD.phase = 'activation'
    AND (
      (NEW.phase = 'pre_switch_cleanup' AND OLD.status = 'failed')
      OR (NEW.phase = 'post_switch_cleanup' AND OLD.status = 'running')
    )
  ) THEN
    RAISE EXCEPTION 'product_activation_phase_immutable' USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.product_activation_recovery_requests (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  run_id uuid NOT NULL REFERENCES public.product_image_publication_runs(id) ON DELETE RESTRICT,
  expected_dispatch_generation integer NOT NULL,
  action text NOT NULL,
  actor_identifier uuid NOT NULL,
  normalized_input jsonb NOT NULL,
  resulting_dispatch_generation integer NOT NULL,
  resulting_phase text NOT NULL,
  resulting_status text NOT NULL,
  dispatch_required boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, request_id),
  CONSTRAINT product_activation_recovery_requests_generation_check
    CHECK (
      expected_dispatch_generation > 0
      AND resulting_dispatch_generation >= expected_dispatch_generation
    ),
  CONSTRAINT product_activation_recovery_requests_action_check
    CHECK (action IN ('retry_activation', 'request_abandonment', 'retry_cleanup')),
  CONSTRAINT product_activation_recovery_requests_input_check
    CHECK (jsonb_typeof(normalized_input) = 'object'),
  CONSTRAINT product_activation_recovery_requests_phase_check
    CHECK (resulting_phase IN ('activation', 'pre_switch_cleanup', 'post_switch_cleanup')),
  CONSTRAINT product_activation_recovery_requests_status_check
    CHECK (resulting_status IN ('pending', 'abandoned'))
);

CREATE INDEX product_activation_recovery_requests_run_idx
  ON public.product_activation_recovery_requests(run_id, created_at);

CREATE FUNCTION public.finish_product_activation_abandonment(
  p_run_id uuid,
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.product_image_publication_runs%ROWTYPE;
  selected_submission public.product_moderation_submissions%ROWTYPE;
  selected_product public.products%ROWTYPE;
BEGIN
  SELECT run.* INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.id = p_run_id
  FOR UPDATE;
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = selected_run.product_id
    AND product.seller_id = selected_run.seller_id
  FOR UPDATE;
  SELECT submission.* INTO selected_submission
  FROM public.product_moderation_submissions AS submission
  WHERE submission.id = selected_run.moderation_submission_id
    AND submission.product_id = selected_run.product_id
    AND submission.seller_id = selected_run.seller_id
  FOR SHARE;

  IF selected_run.id IS NULL OR selected_product.id IS NULL OR selected_submission.id IS NULL
    OR NOT (
      selected_run.phase = 'pre_switch_cleanup'
      OR (selected_run.phase = 'activation' AND selected_run.status = 'failed')
    )
    OR selected_product.active_moderation_submission_id IS DISTINCT FROM selected_submission.id
    OR EXISTS (
      SELECT 1 FROM public.product_activation_cleanup_items AS item
      WHERE item.run_id = selected_run.id AND item.status <> 'completed'
    )
  THEN
    RAISE EXCEPTION 'product_moderation_abandonment_not_allowed' USING ERRCODE = '55000';
  END IF;

  UPDATE public.products AS product
  SET active_moderation_submission_id = NULL,
      moderation_revision = CASE
        WHEN selected_submission.submission_kind = 'initial_publication'
          THEN product.moderation_revision + 1
        ELSE product.moderation_revision
      END
  WHERE product.id = selected_product.id;

  IF selected_submission.submission_kind = 'update' THEN
    UPDATE public.product_moderation_working_copies AS working_copy
    SET revision = revision + 1, updated_at = now()
    WHERE working_copy.product_id = selected_product.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_moderation_abandonment_not_allowed' USING ERRCODE = '55000';
    END IF;
  END IF;

  UPDATE public.product_image_publication_runs AS run
  SET phase = 'pre_switch_cleanup',
      status = 'abandoned',
      attempt_token = NULL,
      claim_started_at = NULL,
      error_code = 'product_activation_abandoned',
      abandoned_at = now()
  WHERE run.id = selected_run.id;

  INSERT INTO public.product_moderation_events (
    product_id, seller_id, submission_id, event_type, actor_user_id,
    expected_revision, request_id
  ) VALUES (
    selected_product.id, selected_product.seller_id, selected_submission.id,
    'abandoned', selected_submission.submitted_by_user_id,
    selected_submission.revision, p_request_id
  ) ON CONFLICT (product_id, request_id) DO NOTHING;
END;
$$;

CREATE FUNCTION public.retry_product_activation_run(
  p_run_id uuid,
  p_expected_dispatch_generation integer,
  p_request_id uuid,
  p_administrator_user_id uuid
)
RETURNS TABLE (
  result text,
  run_id uuid,
  product_id uuid,
  seller_id uuid,
  phase text,
  status text,
  dispatch_generation integer,
  dispatch_status text,
  dispatch_required boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.product_image_publication_runs%ROWTYPE;
  selected_product public.products%ROWTYPE;
  replay_request public.product_activation_recovery_requests%ROWTYPE;
  normalized jsonb;
BEGIN
  IF p_run_id IS NULL OR p_expected_dispatch_generation IS NULL
    OR p_expected_dispatch_generation < 1 OR p_request_id IS NULL
    OR p_administrator_user_id IS NULL
  THEN
    RAISE EXCEPTION 'product_activation_dispatch_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT run.* INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = selected_run.product_id
    AND product.seller_id = selected_run.seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;

  normalized := jsonb_build_object(
    'runId', p_run_id,
    'expectedDispatchGeneration', p_expected_dispatch_generation,
    'action', 'retry_activation',
    'actorIdentifier', p_administrator_user_id
  );
  SELECT request.* INTO replay_request
  FROM public.product_activation_recovery_requests AS request
  WHERE request.product_id = selected_run.product_id
    AND request.request_id = p_request_id;
  IF FOUND THEN
    IF replay_request.run_id IS DISTINCT FROM selected_run.id
      OR replay_request.action <> 'retry_activation'
      OR replay_request.actor_identifier IS DISTINCT FROM p_administrator_user_id
      OR replay_request.normalized_input IS DISTINCT FROM normalized
    THEN
      RAISE EXCEPTION 'product_moderation_revision_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT
      'replay'::text, replay_request.run_id, replay_request.product_id,
      selected_run.seller_id, replay_request.resulting_phase,
      replay_request.resulting_status, replay_request.resulting_dispatch_generation,
      selected_run.dispatch_status,
      replay_request.dispatch_required AND selected_run.dispatch_status = 'pending';
    RETURN;
  END IF;

  IF selected_run.dispatch_generation <> p_expected_dispatch_generation THEN
    RAISE EXCEPTION 'product_moderation_revision_conflict' USING ERRCODE = '40001';
  END IF;
  IF selected_run.phase <> 'activation' OR selected_run.status <> 'failed'
    OR NOT public.product_activation_error_is_retryable(selected_run.error_code)
  THEN
    RAISE EXCEPTION 'product_moderation_activation_not_retryable' USING ERRCODE = '55000';
  END IF;
  IF selected_product.active_moderation_submission_id
    IS DISTINCT FROM selected_run.moderation_submission_id
  THEN
    RAISE EXCEPTION 'product_moderation_revision_conflict' USING ERRCODE = '40001';
  END IF;

  UPDATE public.product_image_publication_items AS item
  SET status = 'pending', attempt_token = NULL, error_code = NULL
  WHERE item.run_id = selected_run.id;
  UPDATE public.product_image_publication_runs AS run
  SET status = 'pending',
      dispatch_generation = run.dispatch_generation + 1,
      dispatch_status = 'pending',
      dispatch_error_code = NULL,
      dispatched_at = NULL,
      attempt_token = NULL,
      claim_started_at = NULL,
      error_code = NULL
  WHERE run.id = selected_run.id
  RETURNING * INTO selected_run;

  INSERT INTO public.product_activation_recovery_requests (
    product_id, request_id, run_id, expected_dispatch_generation,
    action, actor_identifier, normalized_input, resulting_dispatch_generation,
    resulting_phase, resulting_status, dispatch_required
  ) VALUES (
    selected_run.product_id, p_request_id, selected_run.id,
    p_expected_dispatch_generation, 'retry_activation', p_administrator_user_id,
    normalized, selected_run.dispatch_generation, selected_run.phase,
    selected_run.status, true
  );

  RETURN QUERY SELECT
    'recorded'::text, selected_run.id, selected_run.product_id,
    selected_run.seller_id, selected_run.phase, selected_run.status,
    selected_run.dispatch_generation, selected_run.dispatch_status, true;
END;
$$;

CREATE FUNCTION public.request_product_activation_abandonment(
  p_run_id uuid,
  p_expected_dispatch_generation integer,
  p_request_id uuid,
  p_seller_id uuid
)
RETURNS TABLE (
  result text,
  run_id uuid,
  product_id uuid,
  seller_id uuid,
  phase text,
  status text,
  dispatch_generation integer,
  dispatch_status text,
  dispatch_required boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.product_image_publication_runs%ROWTYPE;
  selected_product public.products%ROWTYPE;
  replay_request public.product_activation_recovery_requests%ROWTYPE;
  normalized jsonb;
  cleanup_count integer;
BEGIN
  IF p_run_id IS NULL OR p_expected_dispatch_generation IS NULL
    OR p_expected_dispatch_generation < 1 OR p_request_id IS NULL
    OR p_seller_id IS NULL
  THEN
    RAISE EXCEPTION 'product_activation_dispatch_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT run.* INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = selected_run.product_id
    AND product.seller_id = selected_run.seller_id
  FOR UPDATE;
  IF NOT FOUND OR selected_run.seller_id IS DISTINCT FROM p_seller_id THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;

  normalized := jsonb_build_object(
    'runId', p_run_id,
    'expectedDispatchGeneration', p_expected_dispatch_generation,
    'action', 'request_abandonment',
    'actorIdentifier', p_seller_id
  );
  SELECT request.* INTO replay_request
  FROM public.product_activation_recovery_requests AS request
  WHERE request.product_id = selected_run.product_id
    AND request.request_id = p_request_id;
  IF FOUND THEN
    IF replay_request.run_id IS DISTINCT FROM selected_run.id
      OR replay_request.action <> 'request_abandonment'
      OR replay_request.actor_identifier IS DISTINCT FROM p_seller_id
      OR replay_request.normalized_input IS DISTINCT FROM normalized
    THEN
      RAISE EXCEPTION 'product_moderation_revision_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT
      'replay'::text, replay_request.run_id, replay_request.product_id,
      selected_run.seller_id, replay_request.resulting_phase,
      replay_request.resulting_status, replay_request.resulting_dispatch_generation,
      selected_run.dispatch_status,
      replay_request.dispatch_required AND selected_run.dispatch_status = 'pending';
    RETURN;
  END IF;

  IF selected_run.dispatch_generation <> p_expected_dispatch_generation THEN
    RAISE EXCEPTION 'product_moderation_revision_conflict' USING ERRCODE = '40001';
  END IF;
  IF selected_run.phase <> 'activation' OR selected_run.status <> 'failed'
    OR selected_product.active_moderation_submission_id
      IS DISTINCT FROM selected_run.moderation_submission_id
  THEN
    RAISE EXCEPTION 'product_moderation_abandonment_not_allowed' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.product_activation_cleanup_items (
    run_id, destination_key, cleanup_kind, expected_size_bytes,
    expected_sha256, expected_etag
  )
  SELECT
    selected_run.id, item.destination_key, 'uncommitted_activation',
    item.public_size_bytes, item.public_sha256, item.public_etag
  FROM public.product_image_publication_items AS item
  WHERE item.run_id = selected_run.id
    AND item.object_created_by_attempt_token IS NOT NULL
    AND item.public_size_bytes IS NOT NULL
    AND item.public_sha256 ~ '^[0-9a-f]{64}$'
  ON CONFLICT ON CONSTRAINT product_activation_cleanup_items_pkey DO NOTHING;

  SELECT count(*)::integer INTO cleanup_count
  FROM public.product_activation_cleanup_items AS item
  WHERE item.run_id = selected_run.id AND item.status <> 'completed';

  IF cleanup_count = 0 THEN
    PERFORM public.finish_product_activation_abandonment(selected_run.id, p_request_id);
    SELECT run.* INTO selected_run
    FROM public.product_image_publication_runs AS run
    WHERE run.id = selected_run.id;
  ELSE
    UPDATE public.product_image_publication_runs AS run
    SET phase = 'pre_switch_cleanup',
        status = 'pending',
        dispatch_generation = run.dispatch_generation + 1,
        dispatch_status = 'pending',
        dispatch_error_code = NULL,
        dispatched_at = NULL,
        attempt_token = NULL,
        claim_started_at = NULL,
        error_code = NULL
    WHERE run.id = selected_run.id
    RETURNING * INTO selected_run;
  END IF;

  INSERT INTO public.product_activation_recovery_requests (
    product_id, request_id, run_id, expected_dispatch_generation,
    action, actor_identifier, normalized_input, resulting_dispatch_generation,
    resulting_phase, resulting_status, dispatch_required
  ) VALUES (
    selected_run.product_id, p_request_id, selected_run.id,
    p_expected_dispatch_generation, 'request_abandonment', p_seller_id,
    normalized, selected_run.dispatch_generation, selected_run.phase,
    selected_run.status, cleanup_count > 0
  );

  RETURN QUERY SELECT
    'recorded'::text, selected_run.id, selected_run.product_id,
    selected_run.seller_id, selected_run.phase, selected_run.status,
    selected_run.dispatch_generation, selected_run.dispatch_status,
    cleanup_count > 0;
END;
$$;

CREATE FUNCTION public.claim_product_activation_cleanup(
  p_run_id uuid,
  p_dispatch_generation integer,
  p_claim_timeout_seconds integer,
  p_continuing_attempt_token uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.product_image_publication_runs%ROWTYPE;
  selected_product public.products%ROWTYPE;
  fresh_attempt_token uuid;
  manifest jsonb;
  durable_error text;
BEGIN
  IF p_run_id IS NULL OR p_dispatch_generation IS NULL OR p_dispatch_generation < 1
    OR p_claim_timeout_seconds IS NULL OR p_claim_timeout_seconds < 1
  THEN
    RAISE EXCEPTION 'product_activation_claim_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT run.* INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'not_found'); END IF;
  IF selected_run.dispatch_generation <> p_dispatch_generation
    OR selected_run.dispatch_status <> 'dispatched'
    OR selected_run.phase NOT IN ('pre_switch_cleanup', 'post_switch_cleanup')
    OR selected_run.status NOT IN ('pending', 'running')
  THEN
    RETURN jsonb_build_object('result', 'stale');
  END IF;
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = selected_run.product_id
    AND product.seller_id = selected_run.seller_id
  FOR UPDATE;
  IF NOT FOUND OR selected_product.active_moderation_submission_id
    IS DISTINCT FROM selected_run.moderation_submission_id
  THEN
    RETURN jsonb_build_object('result', 'stale');
  END IF;

  IF p_continuing_attempt_token IS NOT NULL THEN
    IF selected_run.status <> 'running'
      OR selected_run.attempt_token IS DISTINCT FROM p_continuing_attempt_token
    THEN
      RETURN jsonb_build_object('result', 'stale');
    END IF;
    fresh_attempt_token := selected_run.attempt_token;
  ELSE
    IF selected_run.status = 'running'
      AND selected_run.claim_started_at > now() - make_interval(secs => p_claim_timeout_seconds)
    THEN
      RETURN jsonb_build_object('result', 'owned');
    END IF;
    IF selected_run.status = 'running' AND EXISTS (
      SELECT 1 FROM public.product_activation_cleanup_items AS item
      WHERE item.run_id = selected_run.id AND item.status = 'failed'
    ) THEN
      SELECT CASE WHEN bool_or(
        item.error_code = 'product_activation_cleanup_destination_conflict'
      ) THEN 'product_activation_cleanup_destination_conflict'
      ELSE 'product_activation_cleanup_failed' END
      INTO durable_error
      FROM public.product_activation_cleanup_items AS item
      WHERE item.run_id = selected_run.id AND item.status = 'failed';
      UPDATE public.product_activation_cleanup_items AS item
      SET status = 'pending', attempt_token = NULL
      WHERE item.run_id = selected_run.id AND item.status = 'deleting';
      UPDATE public.product_image_publication_runs AS run
      SET status = 'cleanup_required', attempt_token = NULL,
          claim_started_at = NULL, error_code = durable_error
      WHERE run.id = selected_run.id;
      RETURN jsonb_build_object('result', 'stale');
    END IF;
    UPDATE public.product_activation_cleanup_items AS item
    SET status = 'pending', attempt_token = NULL
    WHERE item.run_id = selected_run.id AND item.status = 'deleting';
    fresh_attempt_token := gen_random_uuid();
    UPDATE public.product_image_publication_runs AS run
    SET status = 'running', attempt_count = attempt_count + 1,
        attempt_token = fresh_attempt_token, claim_started_at = now(),
        error_code = NULL
    WHERE run.id = selected_run.id
    RETURNING * INTO selected_run;
  END IF;

  UPDATE public.product_activation_cleanup_items AS item
  SET status = 'deleting', attempt_token = fresh_attempt_token, error_code = NULL
  WHERE item.run_id = selected_run.id AND item.status = 'pending';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'destinationKey', item.destination_key,
    'cleanupKind', item.cleanup_kind,
    'expectedSizeBytes', item.expected_size_bytes,
    'expectedSha256', item.expected_sha256,
    'expectedEtag', item.expected_etag
  ) ORDER BY item.created_at, item.destination_key), '[]'::jsonb)
  INTO manifest
  FROM public.product_activation_cleanup_items AS item
  WHERE item.run_id = selected_run.id AND item.status = 'deleting'
    AND item.attempt_token = fresh_attempt_token;

  RETURN jsonb_build_object(
    'result', 'claimed',
    'phase', selected_run.phase,
    'runId', selected_run.id,
    'submissionId', selected_run.moderation_submission_id,
    'productId', selected_run.product_id,
    'sellerId', selected_run.seller_id,
    'dispatchGeneration', selected_run.dispatch_generation,
    'attemptCount', selected_run.attempt_count,
    'attemptToken', fresh_attempt_token,
    'cleanupItems', manifest
  );
END;
$$;

CREATE FUNCTION public.record_product_activation_cleanup_item_result(
  p_run_id uuid,
  p_dispatch_generation integer,
  p_attempt_token uuid,
  p_destination_key text,
  p_result text,
  p_error_code text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.product_image_publication_runs%ROWTYPE;
  selected_item public.product_activation_cleanup_items%ROWTYPE;
BEGIN
  IF p_run_id IS NULL OR p_dispatch_generation IS NULL OR p_dispatch_generation < 1
    OR p_attempt_token IS NULL
    OR NULLIF(btrim(COALESCE(p_destination_key, '')), '') IS NULL
    OR p_result NOT IN ('completed', 'failed')
    OR (p_result = 'completed' AND p_error_code IS NOT NULL)
    OR (p_result = 'failed' AND p_error_code NOT IN (
      'product_activation_cleanup_destination_conflict',
      'product_activation_cleanup_failed'
    ))
  THEN
    RAISE EXCEPTION 'product_activation_cleanup_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT run.* INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.id = p_run_id
  FOR UPDATE;
  SELECT item.* INTO selected_item
  FROM public.product_activation_cleanup_items AS item
  WHERE item.run_id = p_run_id AND item.destination_key = p_destination_key
  FOR UPDATE;
  IF selected_item.status = 'completed' AND p_result = 'completed' THEN RETURN 'replay'; END IF;
  IF selected_item.status = 'failed' AND p_result = 'failed'
    AND selected_item.error_code = p_error_code
  THEN RETURN 'replay'; END IF;
  IF selected_run.id IS NULL OR selected_item.run_id IS NULL
    OR selected_run.phase NOT IN ('pre_switch_cleanup', 'post_switch_cleanup')
    OR selected_run.status <> 'running'
    OR selected_run.dispatch_generation <> p_dispatch_generation
    OR selected_run.attempt_token IS DISTINCT FROM p_attempt_token
    OR selected_item.status <> 'deleting'
    OR selected_item.attempt_token IS DISTINCT FROM p_attempt_token
  THEN
    RETURN 'stale';
  END IF;

  UPDATE public.product_activation_cleanup_items AS item
  SET status = p_result, attempt_token = NULL, error_code = p_error_code,
      completed_at = CASE WHEN p_result = 'completed' THEN now() ELSE NULL END
  WHERE item.run_id = selected_item.run_id
    AND item.destination_key = selected_item.destination_key;
  RETURN p_result;
END;
$$;

CREATE FUNCTION public.finalize_product_activation_cleanup(
  p_run_id uuid,
  p_dispatch_generation integer,
  p_attempt_token uuid
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.product_image_publication_runs%ROWTYPE;
  selected_product public.products%ROWTYPE;
  abandonment_request_id uuid;
  durable_error text;
BEGIN
  IF p_run_id IS NULL OR p_dispatch_generation IS NULL OR p_dispatch_generation < 1
    OR p_attempt_token IS NULL
  THEN
    RAISE EXCEPTION 'product_activation_cleanup_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT run.* INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF selected_run.status = 'completed' THEN RETURN 'completed'; END IF;
  IF selected_run.status = 'abandoned' THEN RETURN 'abandoned'; END IF;
  IF selected_run.dispatch_generation <> p_dispatch_generation
    OR selected_run.phase NOT IN ('pre_switch_cleanup', 'post_switch_cleanup')
    OR selected_run.status <> 'running'
    OR selected_run.attempt_token IS DISTINCT FROM p_attempt_token
  THEN
    RETURN 'stale';
  END IF;
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = selected_run.product_id
    AND product.seller_id = selected_run.seller_id
  FOR UPDATE;
  IF NOT FOUND OR selected_product.active_moderation_submission_id
    IS DISTINCT FROM selected_run.moderation_submission_id
  THEN
    RETURN 'stale';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.product_activation_cleanup_items AS item
    WHERE item.run_id = selected_run.id AND item.status = 'failed'
  ) THEN
    SELECT CASE WHEN bool_or(
      item.error_code = 'product_activation_cleanup_destination_conflict'
    ) THEN 'product_activation_cleanup_destination_conflict'
    ELSE 'product_activation_cleanup_failed' END
    INTO durable_error
    FROM public.product_activation_cleanup_items AS item
    WHERE item.run_id = selected_run.id AND item.status = 'failed';
    UPDATE public.product_activation_cleanup_items AS item
    SET status = 'pending', attempt_token = NULL
    WHERE item.run_id = selected_run.id AND item.status = 'deleting';
    UPDATE public.product_image_publication_runs AS run
    SET status = 'cleanup_required', attempt_token = NULL,
        claim_started_at = NULL, error_code = durable_error
    WHERE run.id = selected_run.id;
    RETURN 'cleanup_required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_activation_cleanup_items AS item
    WHERE item.run_id = selected_run.id AND item.status <> 'completed'
  ) THEN
    RETURN 'not_allowed';
  END IF;

  IF selected_run.phase = 'pre_switch_cleanup' THEN
    SELECT request.request_id INTO abandonment_request_id
    FROM public.product_activation_recovery_requests AS request
    WHERE request.run_id = selected_run.id
      AND request.action = 'request_abandonment'
    ORDER BY request.created_at, request.request_id
    LIMIT 1;
    IF abandonment_request_id IS NULL THEN RETURN 'not_allowed'; END IF;
    PERFORM public.finish_product_activation_abandonment(
      selected_run.id, abandonment_request_id
    );
    RETURN 'abandoned';
  END IF;

  UPDATE public.products AS product
  SET active_moderation_submission_id = NULL
  WHERE product.id = selected_product.id;
  UPDATE public.product_image_publication_runs AS run
  SET status = 'completed', attempt_token = NULL, claim_started_at = NULL,
      error_code = NULL, completed_at = now()
  WHERE run.id = selected_run.id;
  RETURN 'completed';
END;
$$;

CREATE FUNCTION public.retry_product_activation_cleanup(
  p_run_id uuid,
  p_expected_dispatch_generation integer,
  p_request_id uuid,
  p_actor_user_id uuid
)
RETURNS TABLE (
  result text,
  run_id uuid,
  product_id uuid,
  seller_id uuid,
  phase text,
  status text,
  dispatch_generation integer,
  dispatch_status text,
  dispatch_required boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.product_image_publication_runs%ROWTYPE;
  selected_product public.products%ROWTYPE;
  replay_request public.product_activation_recovery_requests%ROWTYPE;
  normalized jsonb;
BEGIN
  IF p_run_id IS NULL OR p_expected_dispatch_generation IS NULL
    OR p_expected_dispatch_generation < 1 OR p_request_id IS NULL
    OR p_actor_user_id IS NULL
  THEN
    RAISE EXCEPTION 'product_activation_dispatch_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT run.* INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = selected_run.product_id
    AND product.seller_id = selected_run.seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;

  normalized := jsonb_build_object(
    'runId', p_run_id,
    'expectedDispatchGeneration', p_expected_dispatch_generation,
    'action', 'retry_cleanup',
    'actorIdentifier', p_actor_user_id
  );
  SELECT request.* INTO replay_request
  FROM public.product_activation_recovery_requests AS request
  WHERE request.product_id = selected_run.product_id
    AND request.request_id = p_request_id;
  IF FOUND THEN
    IF replay_request.run_id IS DISTINCT FROM selected_run.id
      OR replay_request.action <> 'retry_cleanup'
      OR replay_request.actor_identifier IS DISTINCT FROM p_actor_user_id
      OR replay_request.normalized_input IS DISTINCT FROM normalized
    THEN
      RAISE EXCEPTION 'product_moderation_revision_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT
      'replay'::text, replay_request.run_id, replay_request.product_id,
      selected_run.seller_id, replay_request.resulting_phase,
      replay_request.resulting_status, replay_request.resulting_dispatch_generation,
      selected_run.dispatch_status,
      replay_request.dispatch_required AND selected_run.dispatch_status = 'pending';
    RETURN;
  END IF;

  IF selected_run.dispatch_generation <> p_expected_dispatch_generation THEN
    RAISE EXCEPTION 'product_moderation_revision_conflict' USING ERRCODE = '40001';
  END IF;
  IF selected_run.phase NOT IN ('pre_switch_cleanup', 'post_switch_cleanup')
    OR selected_run.status <> 'cleanup_required'
    OR selected_product.active_moderation_submission_id
      IS DISTINCT FROM selected_run.moderation_submission_id
    OR (
      selected_run.phase = 'pre_switch_cleanup'
      AND NOT EXISTS (
        SELECT 1 FROM public.sellers AS seller
        WHERE seller.id = selected_run.seller_id
          AND seller.owner_id = p_actor_user_id
      )
      AND NOT public.has_role(p_actor_user_id, 'admin')
    )
    OR (
      selected_run.phase = 'post_switch_cleanup'
      AND NOT public.has_role(p_actor_user_id, 'admin')
    )
  THEN
    RAISE EXCEPTION 'product_moderation_cleanup_required' USING ERRCODE = '55000';
  END IF;

  UPDATE public.product_activation_cleanup_items AS item
  SET status = 'pending', attempt_token = NULL, error_code = NULL
  WHERE item.run_id = selected_run.id AND item.status = 'failed';
  UPDATE public.product_image_publication_runs AS run
  SET status = 'pending', dispatch_generation = run.dispatch_generation + 1,
      dispatch_status = 'pending', dispatch_error_code = NULL,
      dispatched_at = NULL, attempt_token = NULL, claim_started_at = NULL,
      error_code = NULL
  WHERE run.id = selected_run.id
  RETURNING * INTO selected_run;

  INSERT INTO public.product_activation_recovery_requests (
    product_id, request_id, run_id, expected_dispatch_generation,
    action, actor_identifier, normalized_input, resulting_dispatch_generation,
    resulting_phase, resulting_status, dispatch_required
  ) VALUES (
    selected_run.product_id, p_request_id, selected_run.id,
    p_expected_dispatch_generation, 'retry_cleanup', p_actor_user_id,
    normalized, selected_run.dispatch_generation, selected_run.phase,
    selected_run.status, true
  );
  RETURN QUERY SELECT
    'recorded'::text, selected_run.id, selected_run.product_id,
    selected_run.seller_id, selected_run.phase, selected_run.status,
    selected_run.dispatch_generation, selected_run.dispatch_status, true;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_recoverable_product_activation_dispatches(
  p_claim_timeout_seconds integer,
  p_limit integer
)
RETURNS TABLE (run_id uuid, dispatch_generation integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT run.id, run.dispatch_generation
  FROM public.product_image_publication_runs AS run
  WHERE run.phase IN ('activation', 'pre_switch_cleanup', 'post_switch_cleanup')
    AND (
      (run.status = 'pending' AND run.dispatch_status = 'pending')
      OR (
        run.status = 'pending'
        AND run.dispatch_status = 'dispatched'
        AND run.dispatched_at <= now() - make_interval(secs => p_claim_timeout_seconds)
      )
      OR (
        run.status = 'running'
        AND run.dispatch_status = 'dispatched'
        AND run.claim_started_at <= now() - make_interval(secs => p_claim_timeout_seconds)
      )
    )
  ORDER BY run.created_at, run.id
  LIMIT p_limit;
$$;

REVOKE ALL ON TABLE public.product_activation_recovery_requests
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.product_activation_recovery_requests TO service_role;
ALTER TABLE public.product_activation_recovery_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.finish_product_activation_abandonment(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_product_activation_run(uuid, integer, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_product_activation_abandonment(uuid, integer, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_product_activation_cleanup(uuid, integer, integer, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_product_activation_cleanup_item_result(
  uuid, integer, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_product_activation_cleanup(uuid, integer, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_product_activation_cleanup(uuid, integer, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.retry_product_activation_run(uuid, integer, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.request_product_activation_abandonment(uuid, integer, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_product_activation_cleanup(uuid, integer, integer, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_product_activation_cleanup_item_result(
  uuid, integer, uuid, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_product_activation_cleanup(uuid, integer, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_product_activation_cleanup(uuid, integer, uuid, uuid)
  TO service_role;

COMMIT;
