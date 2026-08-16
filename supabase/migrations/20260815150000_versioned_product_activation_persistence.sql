CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 0040c1 is a fresh-start replacement. The matching worker migration in
-- 0040c2 must ship in the same runnable release.
DROP TABLE public.product_image_publication_items;
DROP TABLE public.product_image_publication_runs CASCADE;

CREATE TABLE public.product_image_publication_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderation_submission_id uuid NOT NULL,
  product_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  snapshot_hash text NOT NULL,
  expected_submission_revision bigint NOT NULL,
  phase text NOT NULL DEFAULT 'activation',
  status text NOT NULL DEFAULT 'pending',
  dispatch_generation integer NOT NULL DEFAULT 1,
  dispatch_status text NOT NULL DEFAULT 'pending',
  dispatch_attempt_count integer NOT NULL DEFAULT 0,
  dispatch_error_code text,
  dispatched_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  attempt_token uuid,
  claim_started_at timestamptz,
  error_code text,
  completed_at timestamptz,
  abandoned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_image_publication_runs_submission_unique
    UNIQUE (moderation_submission_id),
  CONSTRAINT product_image_publication_runs_identity_unique
    UNIQUE (id, moderation_submission_id, product_id),
  CONSTRAINT product_image_publication_runs_submission_fkey
    FOREIGN KEY (moderation_submission_id, product_id, seller_id)
    REFERENCES public.product_moderation_submissions(id, product_id, seller_id)
    ON DELETE RESTRICT,
  CONSTRAINT product_image_publication_runs_snapshot_hash
    CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT product_image_publication_runs_revision_positive
    CHECK (expected_submission_revision > 0),
  CONSTRAINT product_image_publication_runs_phase
    CHECK (phase IN ('activation', 'post_switch_cleanup')),
  CONSTRAINT product_image_publication_runs_status
    CHECK (status IN ('pending', 'running', 'failed', 'cleanup_required', 'completed', 'abandoned')),
  CONSTRAINT product_image_publication_runs_dispatch_generation_positive
    CHECK (dispatch_generation > 0),
  CONSTRAINT product_image_publication_runs_dispatch_status
    CHECK (dispatch_status IN ('pending', 'dispatched', 'failed')),
  CONSTRAINT product_image_publication_runs_dispatch_attempt_count
    CHECK (dispatch_attempt_count >= 0),
  CONSTRAINT product_image_publication_runs_attempt_count
    CHECK (attempt_count >= 0),
  CONSTRAINT product_image_publication_runs_dispatch_state
    CHECK (
      (dispatch_status = 'pending'
        AND dispatch_error_code IS NULL
        AND dispatched_at IS NULL)
      OR (dispatch_status = 'dispatched'
        AND dispatch_error_code IS NULL
        AND dispatched_at IS NOT NULL)
      OR (dispatch_status = 'failed'
        AND dispatch_error_code = 'product_activation_dispatch_failed'
        AND dispatched_at IS NULL)
    ),
  CONSTRAINT product_image_publication_runs_worker_state
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
        AND attempt_token IS NULL
        AND claim_started_at IS NULL
        AND length(btrim(error_code)) > 0
        AND completed_at IS NULL
        AND abandoned_at IS NULL)
      OR (status = 'cleanup_required'
        AND phase = 'post_switch_cleanup'
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
        AND phase = 'activation'
        AND attempt_token IS NULL
        AND claim_started_at IS NULL
        AND length(btrim(error_code)) > 0
        AND completed_at IS NULL
        AND abandoned_at IS NOT NULL)
    )
);

CREATE TABLE public.product_image_publication_items (
  run_id uuid NOT NULL,
  moderation_submission_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_draft_image_id uuid NOT NULL,
  source_bucket text NOT NULL,
  source_object_key text NOT NULL,
  destination_key text NOT NULL,
  source_position integer NOT NULL,
  publication_order integer NOT NULL,
  is_cover boolean NOT NULL DEFAULT false,
  expected_source_size_bytes bigint NOT NULL,
  expected_content_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_token uuid,
  source_sha256 text,
  public_size_bytes bigint,
  public_sha256 text,
  public_etag text,
  public_url text,
  object_created_by_attempt_token uuid,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_image_publication_items_pkey
    PRIMARY KEY (run_id, product_draft_image_id),
  CONSTRAINT product_image_publication_items_order_unique
    UNIQUE (run_id, publication_order),
  CONSTRAINT product_image_publication_items_destination_unique
    UNIQUE (run_id, destination_key),
  CONSTRAINT product_image_publication_items_run_fkey
    FOREIGN KEY (run_id, moderation_submission_id, product_id)
    REFERENCES public.product_image_publication_runs(id, moderation_submission_id, product_id)
    ON DELETE CASCADE,
  CONSTRAINT product_image_publication_items_submission_image_fkey
    FOREIGN KEY (moderation_submission_id, product_id, product_draft_image_id)
    REFERENCES public.product_moderation_submission_images(
      submission_id, product_id, product_draft_image_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT product_image_publication_items_source_fields
    CHECK (
      source_bucket = 'product-draft-images'
      AND length(btrim(source_object_key)) > 0
      AND length(btrim(destination_key)) > 0
      AND source_position >= 0
      AND publication_order >= 0
      AND expected_source_size_bytes > 0
      AND expected_content_type IN ('image/jpeg', 'image/png', 'image/webp')
    ),
  CONSTRAINT product_image_publication_items_status
    CHECK (status IN ('pending', 'copying', 'verified', 'failed', 'cleanup_required', 'completed')),
  CONSTRAINT product_image_publication_items_claim_fields
    CHECK (
      (status IN ('copying', 'verified') AND attempt_token IS NOT NULL)
      OR (status NOT IN ('copying', 'verified') AND attempt_token IS NULL)
    ),
  CONSTRAINT product_image_publication_items_digest_fields
    CHECK (
      (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$')
      AND (public_sha256 IS NULL OR public_sha256 ~ '^[0-9a-f]{64}$')
    ),
  CONSTRAINT product_image_publication_items_failure_fields
    CHECK (
      status NOT IN ('failed', 'cleanup_required')
      OR length(btrim(error_code)) > 0
    ),
  CONSTRAINT product_image_publication_items_verified_fields
    CHECK (
      status NOT IN ('verified', 'completed')
      OR (
        source_sha256 IS NOT NULL
        AND public_size_bytes = expected_source_size_bytes
        AND public_sha256 = source_sha256
        AND length(btrim(public_url)) > 0
        AND error_code IS NULL
      )
    )
);

CREATE UNIQUE INDEX product_image_publication_items_one_cover
  ON public.product_image_publication_items(run_id)
  WHERE is_cover;

CREATE INDEX product_image_publication_runs_claim_idx
  ON public.product_image_publication_runs(status, dispatch_status, claim_started_at);
CREATE INDEX product_image_publication_runs_product_idx
  ON public.product_image_publication_runs(product_id, created_at DESC);

CREATE TABLE public.product_activation_dispatch_retries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.product_image_publication_runs(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  previous_generation integer NOT NULL,
  next_generation integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_activation_dispatch_retries_request_unique
    UNIQUE (run_id, request_id),
  CONSTRAINT product_activation_dispatch_retries_generation_shape
    CHECK (
      previous_generation > 0
      AND next_generation IN (previous_generation, previous_generation + 1)
    )
);

CREATE FUNCTION public.enforce_product_activation_run_immutability()
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
  IF OLD.phase = 'post_switch_cleanup' AND NEW.phase <> OLD.phase THEN
    RAISE EXCEPTION 'product_activation_phase_immutable' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.enforce_product_activation_item_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.run_id IS DISTINCT FROM OLD.run_id
    OR NEW.moderation_submission_id IS DISTINCT FROM OLD.moderation_submission_id
    OR NEW.product_id IS DISTINCT FROM OLD.product_id
    OR NEW.product_draft_image_id IS DISTINCT FROM OLD.product_draft_image_id
    OR NEW.source_bucket IS DISTINCT FROM OLD.source_bucket
    OR NEW.source_object_key IS DISTINCT FROM OLD.source_object_key
    OR NEW.destination_key IS DISTINCT FROM OLD.destination_key
    OR NEW.source_position IS DISTINCT FROM OLD.source_position
    OR NEW.publication_order IS DISTINCT FROM OLD.publication_order
    OR NEW.is_cover IS DISTINCT FROM OLD.is_cover
    OR NEW.expected_source_size_bytes IS DISTINCT FROM OLD.expected_source_size_bytes
    OR NEW.expected_content_type IS DISTINCT FROM OLD.expected_content_type
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'product_activation_item_immutable' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_product_image_publication_runs_immutable
  BEFORE UPDATE ON public.product_image_publication_runs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_activation_run_immutability();
CREATE TRIGGER trg_product_image_publication_items_immutable
  BEFORE UPDATE ON public.product_image_publication_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_activation_item_immutability();

CREATE FUNCTION public.decide_product_moderation_submission(
  p_submission_id uuid,
  p_expected_revision bigint,
  p_decision text,
  p_reason text,
  p_decision_request_id uuid,
  p_administrator_user_id uuid
)
RETURNS TABLE (
  result text,
  submission_id uuid,
  product_id uuid,
  seller_id uuid,
  review_status text,
  revision bigint,
  activation_run_id uuid,
  dispatch_generation integer,
  dispatch_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  submission_identity record;
  selected_submission public.product_moderation_submissions%ROWTYPE;
  selected_product public.products%ROWTYPE;
  selected_seller public.sellers%ROWTYPE;
  selected_working_copy public.product_moderation_working_copies%ROWTYPE;
  replay_event public.product_moderation_events%ROWTYPE;
  selected_run public.product_image_publication_runs%ROWTYPE;
  normalized_reason text;
  event_type text;
  resulting_status text;
  calculated_hash text;
  image_count integer;
  cover_count integer;
BEGIN
  normalized_reason := NULLIF(btrim(regexp_replace(COALESCE(p_reason, ''), '[[:space:]]+', ' ', 'g')), '');
  IF p_submission_id IS NULL
    OR p_expected_revision IS NULL OR p_expected_revision < 1
    OR p_decision NOT IN ('approve', 'request_changes', 'reject')
    OR p_decision_request_id IS NULL
    OR p_administrator_user_id IS NULL
    OR (p_decision = 'approve' AND normalized_reason IS NOT NULL)
    OR (p_decision IN ('request_changes', 'reject')
      AND (normalized_reason IS NULL OR char_length(normalized_reason) > 1000))
  THEN
    RAISE EXCEPTION 'product_moderation_decision_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT submission.product_id, submission.seller_id
  INTO submission_identity
  FROM public.product_moderation_submissions AS submission
  WHERE submission.id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT seller.* INTO selected_seller
  FROM public.sellers AS seller
  WHERE seller.id = submission_identity.seller_id
  FOR UPDATE;
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = submission_identity.product_id
    AND product.seller_id = submission_identity.seller_id
  FOR UPDATE;
  SELECT submission.* INTO selected_submission
  FROM public.product_moderation_submissions AS submission
  WHERE submission.id = p_submission_id
    AND submission.product_id = selected_product.id
    AND submission.seller_id = selected_seller.id
  FOR UPDATE;

  event_type := CASE p_decision
    WHEN 'approve' THEN 'approved'
    WHEN 'request_changes' THEN 'changes_requested'
    ELSE 'rejected'
  END;
  resulting_status := CASE p_decision
    WHEN 'approve' THEN 'approved'
    WHEN 'request_changes' THEN 'changes_requested'
    ELSE 'rejected'
  END;

  SELECT event.* INTO replay_event
  FROM public.product_moderation_events AS event
  WHERE event.product_id = selected_product.id
    AND event.request_id = p_decision_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF replay_event.submission_id IS DISTINCT FROM selected_submission.id
      OR replay_event.event_type IS DISTINCT FROM event_type
      OR replay_event.expected_revision IS DISTINCT FROM p_expected_revision
      OR replay_event.actor_user_id IS DISTINCT FROM p_administrator_user_id
      OR NULLIF(btrim(COALESCE(replay_event.reason, '')), '')
        IS DISTINCT FROM normalized_reason
    THEN
      RAISE EXCEPTION 'product_moderation_decision_conflict' USING ERRCODE = '23505';
    END IF;
    SELECT run.* INTO selected_run
    FROM public.product_image_publication_runs AS run
    WHERE run.moderation_submission_id = selected_submission.id;
    IF p_decision = 'approve' AND (
      selected_run.id IS NULL
      OR selected_run.snapshot_hash IS DISTINCT FROM encode(
        extensions.digest(
          convert_to(selected_submission.snapshot_json::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      )
      OR selected_run.expected_submission_revision IS DISTINCT FROM selected_submission.revision
    ) THEN
      RAISE EXCEPTION 'product_moderation_submission_stale' USING ERRCODE = '55000';
    END IF;
    RETURN QUERY SELECT
      'replay'::text,
      selected_submission.id,
      selected_submission.product_id,
      selected_submission.seller_id,
      selected_submission.review_status,
      selected_submission.revision,
      selected_run.id,
      selected_run.dispatch_generation,
      selected_run.id IS NOT NULL AND selected_run.dispatch_status = 'pending';
    RETURN;
  END IF;

  IF selected_seller.approved_profile_submission_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.seller_profile_submissions AS approval
      WHERE approval.id = selected_seller.approved_profile_submission_id
        AND approval.seller_id = selected_seller.id
        AND approval.status = 'approved'
    )
  THEN
    RAISE EXCEPTION 'product_moderation_seller_approval_required' USING ERRCODE = '55000';
  END IF;
  IF selected_product.active_moderation_submission_id IS DISTINCT FROM selected_submission.id
    OR selected_submission.review_status <> 'pending'
  THEN
    RAISE EXCEPTION 'product_moderation_submission_stale' USING ERRCODE = '55000';
  END IF;
  IF selected_submission.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'product_moderation_revision_conflict' USING ERRCODE = '40001';
  END IF;

  IF selected_submission.submission_kind = 'initial_publication' THEN
    IF selected_product.status <> 'draft'
      OR selected_product.approved_moderation_submission_id IS NOT NULL
      OR selected_product.moderation_revision <> p_expected_revision
    THEN
      RAISE EXCEPTION 'product_moderation_revision_conflict' USING ERRCODE = '40001';
    END IF;
  ELSE
    SELECT working_copy.* INTO selected_working_copy
    FROM public.product_moderation_working_copies AS working_copy
    WHERE working_copy.product_id = selected_product.id
    FOR UPDATE;
    IF NOT FOUND
      OR selected_product.status NOT IN ('published', 'archived')
      OR selected_product.approved_moderation_submission_id IS NULL
      OR selected_working_copy.revision <> p_expected_revision
    THEN
      RAISE EXCEPTION 'product_moderation_revision_conflict' USING ERRCODE = '40001';
    END IF;
  END IF;

  IF selected_submission.snapshot_schema_version <> 1
    OR selected_submission.snapshot_json ->> 'productId' IS DISTINCT FROM selected_product.id::text
    OR selected_submission.snapshot_json ->> 'sellerId' IS DISTINCT FROM selected_seller.id::text
    OR COALESCE(btrim(selected_submission.snapshot_json ->> 'title'), '') = ''
    OR char_length(selected_submission.snapshot_json ->> 'title') > 50
    OR selected_submission.snapshot_json ->> 'titleSource' NOT IN ('human', 'model')
    OR selected_submission.snapshot_json ->> 'categoryId' IS NULL
    OR jsonb_typeof(selected_submission.snapshot_json -> 'audiences') <> 'array'
    OR jsonb_array_length(selected_submission.snapshot_json -> 'audiences') < 1
  THEN
    RAISE EXCEPTION 'product_moderation_submission_stale' USING ERRCODE = '23514';
  END IF;
  PERFORM public.validate_product_moderation_submission_images(selected_submission.id);

  SELECT count(*)::integer, count(*) FILTER (WHERE membership.is_cover)::integer
  INTO image_count, cover_count
  FROM public.product_moderation_submission_images AS membership
  JOIN public.product_draft_images AS image
    ON image.product_draft_id = membership.product_id
   AND image.id = membership.product_draft_image_id
  WHERE membership.submission_id = selected_submission.id
    AND image.status = 'available'
    AND image.storage_bucket = 'product-draft-images'
    AND image.size_bytes > 0
    AND image.content_type IN ('image/jpeg', 'image/png', 'image/webp');
  IF image_count <> jsonb_array_length(selected_submission.snapshot_json -> 'imageIds')
    OR image_count < 1 OR cover_count <> 1
  THEN
    RAISE EXCEPTION 'product_moderation_images_not_ready' USING ERRCODE = '55000';
  END IF;

  UPDATE public.product_moderation_submissions AS submission
  SET
    review_status = resulting_status,
    administrator_user_id = p_administrator_user_id,
    decision_request_id = p_decision_request_id,
    seller_visible_reason = normalized_reason,
    decided_at = now()
  WHERE submission.id = selected_submission.id
  RETURNING * INTO selected_submission;

  INSERT INTO public.product_moderation_events (
    product_id, seller_id, submission_id, event_type, actor_user_id,
    expected_revision, reason, request_id
  ) VALUES (
    selected_submission.product_id, selected_submission.seller_id,
    selected_submission.id, event_type, p_administrator_user_id,
    p_expected_revision, normalized_reason, p_decision_request_id
  );

  IF p_decision = 'approve' THEN
    calculated_hash := encode(
      extensions.digest(
        convert_to(selected_submission.snapshot_json::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    );
    INSERT INTO public.product_image_publication_runs (
      moderation_submission_id, product_id, seller_id, snapshot_hash,
      expected_submission_revision
    ) VALUES (
      selected_submission.id, selected_submission.product_id,
      selected_submission.seller_id, calculated_hash, selected_submission.revision
    )
    ON CONFLICT (moderation_submission_id) DO NOTHING;
    SELECT run.* INTO selected_run
    FROM public.product_image_publication_runs AS run
    WHERE run.moderation_submission_id = selected_submission.id;
    IF selected_run.snapshot_hash IS DISTINCT FROM calculated_hash
      OR selected_run.product_id IS DISTINCT FROM selected_submission.product_id
      OR selected_run.seller_id IS DISTINCT FROM selected_submission.seller_id
      OR selected_run.expected_submission_revision IS DISTINCT FROM selected_submission.revision
    THEN
      RAISE EXCEPTION 'product_moderation_decision_conflict' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.product_image_publication_items (
      run_id, moderation_submission_id, product_id, product_draft_image_id,
      source_bucket, source_object_key, destination_key, source_position,
      publication_order, is_cover, expected_source_size_bytes,
      expected_content_type
    )
    SELECT
      selected_run.id,
      selected_submission.id,
      selected_submission.product_id,
      membership.product_draft_image_id,
      image.storage_bucket,
      image.destination_key,
      'published-products/' || selected_submission.product_id::text || '/'
        || selected_run.id::text || '/' || membership.product_draft_image_id::text
        || CASE image.content_type
          WHEN 'image/png' THEN '.png'
          WHEN 'image/webp' THEN '.webp'
          ELSE '.jpg'
        END,
      image.source_position,
      membership.position,
      membership.is_cover,
      image.size_bytes,
      image.content_type
    FROM public.product_moderation_submission_images AS membership
    JOIN public.product_draft_images AS image
      ON image.product_draft_id = membership.product_id
     AND image.id = membership.product_draft_image_id
    WHERE membership.submission_id = selected_submission.id
    ORDER BY membership.position
    ON CONFLICT (run_id, product_draft_image_id) DO NOTHING;
  ELSE
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
    END IF;
  END IF;

  RETURN QUERY SELECT
    'decided'::text,
    selected_submission.id,
    selected_submission.product_id,
    selected_submission.seller_id,
    selected_submission.review_status,
    selected_submission.revision,
    selected_run.id,
    selected_run.dispatch_generation,
    selected_run.id IS NOT NULL AND selected_run.dispatch_status = 'pending';
END;
$$;

CREATE FUNCTION public.record_product_activation_dispatch_result(
  p_run_id uuid,
  p_dispatch_generation integer,
  p_result text
)
RETURNS TABLE (
  result text,
  run_id uuid,
  dispatch_generation integer,
  dispatch_status text,
  dispatch_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE selected_run public.product_image_publication_runs%ROWTYPE;
BEGIN
  IF p_run_id IS NULL OR p_dispatch_generation IS NULL OR p_dispatch_generation < 1
    OR p_result NOT IN ('dispatched', 'failed')
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
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_moderation_submissions AS submission
    WHERE submission.id = selected_run.moderation_submission_id
      AND submission.product_id = selected_run.product_id
      AND submission.seller_id = selected_run.seller_id
      AND submission.review_status = 'approved'
      AND submission.revision = selected_run.expected_submission_revision
      AND encode(
        extensions.digest(convert_to(submission.snapshot_json::text, 'UTF8'), 'sha256'),
        'hex'
      ) = selected_run.snapshot_hash
  ) THEN
    RAISE EXCEPTION 'product_moderation_submission_stale' USING ERRCODE = '55000';
  END IF;
  IF p_dispatch_generation < selected_run.dispatch_generation THEN
    RETURN QUERY SELECT 'stale'::text, selected_run.id,
      selected_run.dispatch_generation, selected_run.dispatch_status, false;
    RETURN;
  END IF;
  IF p_dispatch_generation > selected_run.dispatch_generation THEN
    RAISE EXCEPTION 'product_activation_dispatch_not_allowed' USING ERRCODE = '55000';
  END IF;
  IF selected_run.dispatch_status <> 'pending' THEN
    IF selected_run.dispatch_status = p_result THEN
      RETURN QUERY SELECT 'replay'::text, selected_run.id,
        selected_run.dispatch_generation, selected_run.dispatch_status, false;
      RETURN;
    END IF;
    RAISE EXCEPTION 'product_activation_dispatch_not_allowed' USING ERRCODE = '55000';
  END IF;
  IF selected_run.status <> 'pending' THEN
    RAISE EXCEPTION 'product_activation_dispatch_not_allowed' USING ERRCODE = '55000';
  END IF;

  UPDATE public.product_image_publication_runs AS run
  SET
    dispatch_status = p_result,
    dispatch_attempt_count = dispatch_attempt_count + 1,
    dispatch_error_code = CASE WHEN p_result = 'failed'
      THEN 'product_activation_dispatch_failed' ELSE NULL END,
    dispatched_at = CASE WHEN p_result = 'dispatched' THEN now() ELSE NULL END
  WHERE run.id = selected_run.id
  RETURNING * INTO selected_run;
  RETURN QUERY SELECT 'recorded'::text, selected_run.id,
    selected_run.dispatch_generation, selected_run.dispatch_status, false;
END;
$$;

CREATE FUNCTION public.retry_product_activation_dispatch(
  p_run_id uuid,
  p_expected_dispatch_generation integer,
  p_request_id uuid,
  p_actor_user_id uuid
)
RETURNS TABLE (
  result text,
  run_id uuid,
  dispatch_generation integer,
  dispatch_status text,
  dispatch_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.product_image_publication_runs%ROWTYPE;
  replay_retry public.product_activation_dispatch_retries%ROWTYPE;
  next_generation integer;
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
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_moderation_submissions AS submission
    WHERE submission.id = selected_run.moderation_submission_id
      AND submission.product_id = selected_run.product_id
      AND submission.seller_id = selected_run.seller_id
      AND submission.review_status = 'approved'
      AND submission.revision = selected_run.expected_submission_revision
      AND encode(
        extensions.digest(convert_to(submission.snapshot_json::text, 'UTF8'), 'sha256'),
        'hex'
      ) = selected_run.snapshot_hash
  ) THEN
    RAISE EXCEPTION 'product_moderation_submission_stale' USING ERRCODE = '55000';
  END IF;
  SELECT retry.* INTO replay_retry
  FROM public.product_activation_dispatch_retries AS retry
  WHERE retry.run_id = selected_run.id AND retry.request_id = p_request_id;
  IF FOUND THEN
    IF replay_retry.actor_user_id <> p_actor_user_id
      OR replay_retry.previous_generation <> p_expected_dispatch_generation
    THEN
      RAISE EXCEPTION 'product_activation_dispatch_not_allowed' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT 'replay'::text, selected_run.id,
      selected_run.dispatch_generation, selected_run.dispatch_status,
      selected_run.dispatch_generation = replay_retry.next_generation
        AND selected_run.dispatch_status = 'pending';
    RETURN;
  END IF;
  IF selected_run.status <> 'pending'
    OR selected_run.dispatch_generation <> p_expected_dispatch_generation
    OR selected_run.dispatch_status NOT IN ('pending', 'failed')
  THEN
    RAISE EXCEPTION 'product_activation_dispatch_not_allowed' USING ERRCODE = '55000';
  END IF;
  next_generation := selected_run.dispatch_generation
    + CASE WHEN selected_run.dispatch_status = 'failed' THEN 1 ELSE 0 END;
  INSERT INTO public.product_activation_dispatch_retries (
    run_id, request_id, actor_user_id, previous_generation, next_generation
  ) VALUES (
    selected_run.id, p_request_id, p_actor_user_id,
    selected_run.dispatch_generation, next_generation
  );
  IF selected_run.dispatch_status = 'failed' THEN
    UPDATE public.product_image_publication_runs AS run
    SET dispatch_generation = next_generation,
        dispatch_status = 'pending',
        dispatch_error_code = NULL,
        dispatched_at = NULL
    WHERE run.id = selected_run.id
    RETURNING * INTO selected_run;
  END IF;
  RETURN QUERY SELECT 'retried'::text, selected_run.id,
    selected_run.dispatch_generation, selected_run.dispatch_status, true;
END;
$$;

REVOKE ALL ON TABLE public.product_image_publication_runs
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.product_image_publication_items
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.product_activation_dispatch_retries
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.product_image_publication_runs TO service_role;
GRANT ALL ON TABLE public.product_image_publication_items TO service_role;
GRANT ALL ON TABLE public.product_activation_dispatch_retries TO service_role;

ALTER TABLE public.product_image_publication_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_image_publication_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_activation_dispatch_retries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.decide_product_moderation_submission(
  uuid, bigint, text, text, uuid, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_product_activation_dispatch_result(
  uuid, integer, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_product_activation_dispatch(
  uuid, integer, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_product_moderation_submission(
  uuid, bigint, text, text, uuid, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_product_activation_dispatch_result(
  uuid, integer, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_product_activation_dispatch(
  uuid, integer, uuid, uuid
) TO service_role;
