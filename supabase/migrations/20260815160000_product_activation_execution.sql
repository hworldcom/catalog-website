BEGIN;

CREATE TABLE public.product_activation_cleanup_items (
  run_id uuid NOT NULL
    REFERENCES public.product_image_publication_runs(id) ON DELETE CASCADE,
  destination_key text NOT NULL,
  cleanup_kind text NOT NULL,
  superseded_run_id uuid
    REFERENCES public.product_image_publication_runs(id) ON DELETE RESTRICT,
  source_product_image_id uuid,
  expected_size_bytes bigint NOT NULL,
  expected_sha256 text NOT NULL,
  expected_etag text,
  status text NOT NULL DEFAULT 'pending',
  attempt_token uuid,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (run_id, destination_key),
  CONSTRAINT product_activation_cleanup_items_kind_check
    CHECK (cleanup_kind IN ('uncommitted_activation', 'superseded_public')),
  CONSTRAINT product_activation_cleanup_items_destination_check
    CHECK (length(btrim(destination_key)) > 0),
  CONSTRAINT product_activation_cleanup_items_expected_check
    CHECK (
      expected_size_bytes > 0
      AND expected_sha256 ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT product_activation_cleanup_items_status_check
    CHECK (status IN ('pending', 'deleting', 'completed', 'failed')),
  CONSTRAINT product_activation_cleanup_items_state_check
    CHECK (
      (status = 'pending'
        AND attempt_token IS NULL
        AND error_code IS NULL
        AND completed_at IS NULL)
      OR (status = 'deleting'
        AND attempt_token IS NOT NULL
        AND error_code IS NULL
        AND completed_at IS NULL)
      OR (status = 'completed'
        AND attempt_token IS NULL
        AND error_code IS NULL
        AND completed_at IS NOT NULL)
      OR (status = 'failed'
        AND attempt_token IS NULL
        AND length(btrim(error_code)) > 0
        AND completed_at IS NULL)
    ),
  CONSTRAINT product_activation_cleanup_items_kind_identity_check
    CHECK (
      (cleanup_kind = 'uncommitted_activation'
        AND superseded_run_id IS NULL
        AND source_product_image_id IS NULL)
      OR cleanup_kind = 'superseded_public'
    )
);

CREATE INDEX product_activation_cleanup_items_status_idx
  ON public.product_activation_cleanup_items(run_id, status, created_at);

CREATE FUNCTION public.enforce_product_activation_cleanup_item_immutability()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.run_id IS DISTINCT FROM OLD.run_id
    OR NEW.destination_key IS DISTINCT FROM OLD.destination_key
    OR NEW.cleanup_kind IS DISTINCT FROM OLD.cleanup_kind
    OR NEW.superseded_run_id IS DISTINCT FROM OLD.superseded_run_id
    OR NEW.source_product_image_id IS DISTINCT FROM OLD.source_product_image_id
    OR NEW.expected_size_bytes IS DISTINCT FROM OLD.expected_size_bytes
    OR NEW.expected_sha256 IS DISTINCT FROM OLD.expected_sha256
    OR NEW.expected_etag IS DISTINCT FROM OLD.expected_etag
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'product_activation_cleanup_item_immutable' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_product_activation_cleanup_items_immutable
  BEFORE UPDATE ON public.product_activation_cleanup_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_activation_cleanup_item_immutability();

CREATE OR REPLACE FUNCTION public.bump_initial_product_moderation_revision(
  p_product_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
BEGIN
  IF public.product_moderation_registry_contains(
    'bazoria.product_moderation_activation_ids',
    p_product_id
  ) THEN
    RETURN;
  END IF;

  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id
  FOR UPDATE;

  IF NOT FOUND OR selected_product.status <> 'draft' THEN
    RETURN;
  END IF;
  IF selected_product.active_moderation_submission_id IS NOT NULL THEN
    RAISE EXCEPTION 'product_moderation_submission_conflict' USING ERRCODE = '55000';
  END IF;
  IF public.product_moderation_registry_contains(
    'bazoria.product_moderation_created_ids', p_product_id
  ) OR public.product_moderation_registry_contains(
    'bazoria.product_moderation_bumped_ids', p_product_id
  ) THEN
    RETURN;
  END IF;

  UPDATE public.products AS product
  SET moderation_revision = moderation_revision + 1
  WHERE product.id = p_product_id;
  PERFORM public.product_moderation_registry_add(
    'bazoria.product_moderation_bumped_ids', p_product_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_product_moderation_scalar_mutation()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.title IS NOT DISTINCT FROM OLD.title
    AND NEW.title_source IS NOT DISTINCT FROM OLD.title_source
    AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id
    AND NEW.description IS NOT DISTINCT FROM OLD.description
    AND NEW.moq IS NOT DISTINCT FROM OLD.moq
    AND NEW.pack_size IS NOT DISTINCT FROM OLD.pack_size
    AND NEW.price IS NOT DISTINCT FROM OLD.price
    AND NEW.currency IS NOT DISTINCT FROM OLD.currency
    AND NEW.stock IS NOT DISTINCT FROM OLD.stock
    AND NEW.cover_image_url IS NOT DISTINCT FROM OLD.cover_image_url
    AND NEW.cover_image_id IS NOT DISTINCT FROM OLD.cover_image_id
    AND NEW.product_code IS NOT DISTINCT FROM OLD.product_code
    AND NEW.status IS NOT DISTINCT FROM OLD.status
  THEN
    RETURN NEW;
  END IF;
  IF public.product_moderation_registry_contains(
    'bazoria.product_moderation_activation_ids', OLD.id
  ) THEN
    RETURN NEW;
  END IF;
  IF OLD.status <> 'draft' THEN
    RETURN NEW;
  END IF;
  IF OLD.active_moderation_submission_id IS NOT NULL THEN
    RAISE EXCEPTION 'product_moderation_submission_conflict' USING ERRCODE = '55000';
  END IF;
  IF public.product_moderation_registry_contains(
    'bazoria.product_moderation_created_ids', OLD.id
  ) THEN
    RETURN NEW;
  END IF;
  IF NOT public.product_moderation_registry_contains(
    'bazoria.product_moderation_bumped_ids', OLD.id
  ) THEN
    NEW.moderation_revision := OLD.moderation_revision + 1;
    PERFORM public.product_moderation_registry_add(
      'bazoria.product_moderation_bumped_ids', OLD.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_product_draft_title()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE normalized_title text;
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.status IN ('published', 'archived')
    AND (
      NEW.title IS DISTINCT FROM OLD.title
      OR NEW.title_source IS DISTINCT FROM OLD.title_source
    )
    AND NOT public.product_moderation_registry_contains(
      'bazoria.product_moderation_activation_ids', OLD.id
    )
  THEN
    RAISE EXCEPTION 'product_draft_title_not_editable' USING ERRCODE = '23514';
  END IF;
  normalized_title := btrim(
    regexp_replace(COALESCE(NEW.title, ''), '[[:space:]]+', ' ', 'g')
  );
  IF char_length(normalized_title) > 50 THEN
    RAISE EXCEPTION 'product_draft_title_invalid' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'published'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published')
  THEN
    IF normalized_title = '' THEN
      RAISE EXCEPTION 'product_draft_title_invalid' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.product_draft_descriptions AS description
      WHERE description.product_draft_id = NEW.id
        AND char_length(description.description_text) > 300
    ) THEN
      RAISE EXCEPTION 'product_draft_description_invalid' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_product_moderation_working_copy(
  p_product_id uuid,
  p_seller_id uuid
)
RETURNS SETOF public.product_moderation_working_copies
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  approved_submission public.product_moderation_submissions%ROWTYPE;
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  next_revision bigint;
  initial_snapshot jsonb;
BEGIN
  IF p_product_id IS NULL OR p_seller_id IS NULL THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id AND product.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF selected_product.status NOT IN ('published', 'archived')
    OR selected_product.approved_moderation_submission_id IS NULL
  THEN
    RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
  END IF;
  SELECT working_copy.* INTO selected_copy
  FROM public.product_moderation_working_copies AS working_copy
  WHERE working_copy.product_id = selected_product.id
  FOR UPDATE;
  IF FOUND THEN
    RETURN NEXT selected_copy;
    RETURN;
  END IF;
  IF selected_product.active_moderation_submission_id IS NOT NULL THEN
    RAISE EXCEPTION 'product_moderation_submission_conflict' USING ERRCODE = '55000';
  END IF;
  SELECT submission.* INTO approved_submission
  FROM public.product_moderation_submissions AS submission
  WHERE submission.id = selected_product.approved_moderation_submission_id
    AND submission.product_id = selected_product.id
    AND submission.seller_id = selected_product.seller_id
    AND submission.review_status = 'approved'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
  END IF;
  SELECT COALESCE(max(submission.revision), 0) + 1
  INTO next_revision
  FROM public.product_moderation_submissions AS submission
  WHERE submission.product_id = selected_product.id;

  initial_snapshot := jsonb_set(
    approved_submission.snapshot_json,
    '{productCode}',
    COALESCE(to_jsonb(selected_product.product_code), 'null'::jsonb),
    true
  );
  INSERT INTO public.product_moderation_working_copies (
    product_id, seller_id, revision, snapshot_schema_version, snapshot_json
  ) VALUES (
    selected_product.id,
    selected_product.seller_id,
    next_revision,
    approved_submission.snapshot_schema_version,
    initial_snapshot
  ) RETURNING * INTO selected_copy;
  INSERT INTO public.product_moderation_working_copy_images (
    product_id, product_draft_image_id, position, is_cover
  )
  SELECT selected_product.id, image.product_draft_image_id, image.position, image.is_cover
  FROM public.product_moderation_submission_images AS image
  WHERE image.submission_id = approved_submission.id
  ORDER BY image.position;
  RETURN NEXT selected_copy;
END;
$$;

CREATE FUNCTION public.product_activation_error_is_retryable(p_error_code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_error_code IN (
    'product_activation_worker_start_failed',
    'product_publication_source_unavailable',
    'product_publication_transfer_failed',
    'product_publication_verification_failed',
    'product_publication_finalization_failed'
  );
$$;

CREATE FUNCTION public.claim_product_activation_run(
  p_run_id uuid,
  p_dispatch_generation integer,
  p_claim_timeout_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.product_image_publication_runs%ROWTYPE;
  selected_submission public.product_moderation_submissions%ROWTYPE;
  selected_product public.products%ROWTYPE;
  fresh_attempt_token uuid;
  manifest jsonb;
BEGIN
  IF p_run_id IS NULL
    OR p_dispatch_generation IS NULL OR p_dispatch_generation < 1
    OR p_claim_timeout_seconds IS NULL OR p_claim_timeout_seconds < 1
  THEN
    RAISE EXCEPTION 'product_activation_claim_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT run.* INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;
  IF selected_run.dispatch_generation <> p_dispatch_generation
    OR selected_run.dispatch_status <> 'dispatched'
    OR selected_run.phase <> 'activation'
    OR selected_run.status NOT IN ('pending', 'running')
  THEN
    RETURN jsonb_build_object('result', 'stale');
  END IF;
  IF selected_run.status = 'running'
    AND selected_run.claim_started_at > now() - make_interval(secs => p_claim_timeout_seconds)
  THEN
    RETURN jsonb_build_object('result', 'owned');
  END IF;

  SELECT submission.* INTO selected_submission
  FROM public.product_moderation_submissions AS submission
  WHERE submission.id = selected_run.moderation_submission_id
    AND submission.product_id = selected_run.product_id
    AND submission.seller_id = selected_run.seller_id
  FOR SHARE;
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = selected_run.product_id
    AND product.seller_id = selected_run.seller_id
  FOR UPDATE;
  IF selected_submission.id IS NULL
    OR selected_submission.review_status <> 'approved'
    OR selected_submission.revision <> selected_run.expected_submission_revision
    OR encode(
      extensions.digest(convert_to(selected_submission.snapshot_json::text, 'UTF8'), 'sha256'),
      'hex'
    ) <> selected_run.snapshot_hash
    OR selected_product.active_moderation_submission_id IS DISTINCT FROM selected_submission.id
  THEN
    RETURN jsonb_build_object('result', 'stale');
  END IF;

  fresh_attempt_token := gen_random_uuid();
  UPDATE public.product_image_publication_runs AS run
  SET status = 'running',
      attempt_count = attempt_count + 1,
      attempt_token = fresh_attempt_token,
      claim_started_at = now(),
      error_code = NULL
  WHERE run.id = selected_run.id
  RETURNING * INTO selected_run;

  UPDATE public.product_image_publication_items AS item
  SET status = 'copying',
      attempt_token = fresh_attempt_token,
      error_code = NULL
  WHERE item.run_id = selected_run.id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'productDraftImageId', item.product_draft_image_id,
        'sourceBucket', item.source_bucket,
        'sourceObjectKey', item.source_object_key,
        'destinationKey', item.destination_key,
        'sourcePosition', item.source_position,
        'publicationOrder', item.publication_order,
        'isCover', item.is_cover,
        'expectedSourceSizeBytes', item.expected_source_size_bytes,
        'expectedContentType', item.expected_content_type,
        'sourceSha256', item.source_sha256,
        'publicSizeBytes', item.public_size_bytes,
        'publicSha256', item.public_sha256,
        'publicEtag', item.public_etag,
        'publicUrl', item.public_url,
        'objectCreatedByAttemptToken', item.object_created_by_attempt_token
      ) ORDER BY item.publication_order
    ),
    '[]'::jsonb
  ) INTO manifest
  FROM public.product_image_publication_items AS item
  WHERE item.run_id = selected_run.id;

  RETURN jsonb_build_object(
    'result', 'claimed',
    'runId', selected_run.id,
    'submissionId', selected_run.moderation_submission_id,
    'productId', selected_run.product_id,
    'sellerId', selected_run.seller_id,
    'dispatchGeneration', selected_run.dispatch_generation,
    'attemptCount', selected_run.attempt_count,
    'attemptToken', selected_run.attempt_token,
    'snapshotHash', selected_run.snapshot_hash,
    'expectedSubmissionRevision', selected_run.expected_submission_revision,
    'snapshot', selected_submission.snapshot_json,
    'items', manifest
  );
END;
$$;

CREATE FUNCTION public.record_product_activation_object_created(
  p_run_id uuid,
  p_dispatch_generation integer,
  p_attempt_token uuid,
  p_product_draft_image_id uuid,
  p_source_sha256 text,
  p_public_size_bytes bigint,
  p_public_sha256 text,
  p_public_etag text,
  p_public_url text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.product_image_publication_runs%ROWTYPE;
  selected_item public.product_image_publication_items%ROWTYPE;
BEGIN
  IF p_run_id IS NULL OR p_dispatch_generation IS NULL OR p_dispatch_generation < 1
    OR p_attempt_token IS NULL OR p_product_draft_image_id IS NULL
    OR p_source_sha256 !~ '^[0-9a-f]{64}$'
    OR p_public_sha256 !~ '^[0-9a-f]{64}$'
    OR p_public_size_bytes IS NULL OR p_public_size_bytes < 1
    OR NULLIF(btrim(COALESCE(p_public_url, '')), '') IS NULL
  THEN
    RAISE EXCEPTION 'product_activation_item_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT run.* INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.id = p_run_id
  FOR UPDATE;
  SELECT item.* INTO selected_item
  FROM public.product_image_publication_items AS item
  WHERE item.run_id = p_run_id
    AND item.product_draft_image_id = p_product_draft_image_id
  FOR UPDATE;
  IF selected_run.id IS NULL OR selected_item.run_id IS NULL
    OR selected_run.phase <> 'activation'
    OR selected_run.status <> 'running'
    OR selected_run.dispatch_generation <> p_dispatch_generation
    OR selected_run.attempt_token IS DISTINCT FROM p_attempt_token
    OR selected_item.status NOT IN ('copying', 'verified')
    OR selected_item.attempt_token IS DISTINCT FROM p_attempt_token
  THEN
    RETURN 'stale';
  END IF;
  IF selected_item.object_created_by_attempt_token = p_attempt_token THEN
    IF selected_item.source_sha256 = p_source_sha256
      AND selected_item.public_size_bytes = p_public_size_bytes
      AND selected_item.public_sha256 = p_public_sha256
      AND selected_item.public_etag IS NOT DISTINCT FROM p_public_etag
      AND selected_item.public_url = p_public_url
    THEN
      RETURN 'replay';
    END IF;
    RETURN 'conflict';
  END IF;
  IF p_public_size_bytes <> selected_item.expected_source_size_bytes
    OR p_public_sha256 <> p_source_sha256
  THEN
    RETURN 'conflict';
  END IF;

  UPDATE public.product_image_publication_items AS item
  SET source_sha256 = p_source_sha256,
      public_size_bytes = p_public_size_bytes,
      public_sha256 = p_public_sha256,
      public_etag = p_public_etag,
      public_url = p_public_url,
      object_created_by_attempt_token = p_attempt_token,
      error_code = NULL
  WHERE item.run_id = selected_item.run_id
    AND item.product_draft_image_id = selected_item.product_draft_image_id;
  RETURN 'recorded';
END;
$$;

CREATE FUNCTION public.verify_product_activation_item(
  p_run_id uuid,
  p_dispatch_generation integer,
  p_attempt_token uuid,
  p_product_draft_image_id uuid,
  p_verified_size_bytes bigint,
  p_verified_sha256 text,
  p_verified_etag text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.product_image_publication_runs%ROWTYPE;
  selected_item public.product_image_publication_items%ROWTYPE;
BEGIN
  IF p_run_id IS NULL OR p_dispatch_generation IS NULL OR p_dispatch_generation < 1
    OR p_attempt_token IS NULL OR p_product_draft_image_id IS NULL
    OR p_verified_size_bytes IS NULL OR p_verified_size_bytes < 1
    OR p_verified_sha256 !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'product_activation_item_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT run.* INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.id = p_run_id
  FOR UPDATE;
  SELECT item.* INTO selected_item
  FROM public.product_image_publication_items AS item
  WHERE item.run_id = p_run_id
    AND item.product_draft_image_id = p_product_draft_image_id
  FOR UPDATE;
  IF selected_run.id IS NULL OR selected_item.run_id IS NULL
    OR selected_run.phase <> 'activation'
    OR selected_run.status <> 'running'
    OR selected_run.dispatch_generation <> p_dispatch_generation
    OR selected_run.attempt_token IS DISTINCT FROM p_attempt_token
    OR selected_item.attempt_token IS DISTINCT FROM p_attempt_token
    OR selected_item.status NOT IN ('copying', 'verified')
  THEN
    RETURN 'stale';
  END IF;
  IF selected_item.status = 'verified' THEN
    IF selected_item.public_size_bytes = p_verified_size_bytes
      AND selected_item.public_sha256 = p_verified_sha256
      AND selected_item.public_etag IS NOT DISTINCT FROM p_verified_etag
    THEN
      RETURN 'replay';
    END IF;
    RETURN 'conflict';
  END IF;
  IF selected_item.source_sha256 IS NULL
    OR selected_item.public_url IS NULL
    OR selected_item.object_created_by_attempt_token IS NULL
    OR p_verified_size_bytes <> selected_item.expected_source_size_bytes
    OR p_verified_sha256 <> selected_item.source_sha256
  THEN
    RETURN 'conflict';
  END IF;

  UPDATE public.product_image_publication_items AS item
  SET status = 'verified',
      public_size_bytes = p_verified_size_bytes,
      public_sha256 = p_verified_sha256,
      public_etag = p_verified_etag,
      error_code = NULL
  WHERE item.run_id = selected_item.run_id
    AND item.product_draft_image_id = selected_item.product_draft_image_id;
  RETURN 'verified';
END;
$$;

CREATE FUNCTION public.fail_product_activation_attempt(
  p_run_id uuid,
  p_dispatch_generation integer,
  p_attempt_token uuid,
  p_product_draft_image_id uuid,
  p_error_code text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE selected_run public.product_image_publication_runs%ROWTYPE;
BEGIN
  IF p_run_id IS NULL OR p_dispatch_generation IS NULL OR p_dispatch_generation < 1
    OR p_attempt_token IS NULL OR p_product_draft_image_id IS NULL
    OR p_error_code NOT IN (
      'product_publication_source_unavailable',
      'product_publication_source_changed',
      'product_publication_destination_conflict',
      'product_publication_transfer_failed',
      'product_publication_verification_failed',
      'product_publication_finalization_failed',
      'product_moderation_submission_stale'
    )
  THEN
    RAISE EXCEPTION 'product_activation_failure_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT run.* INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'stale'; END IF;
  IF selected_run.status = 'failed'
    AND selected_run.dispatch_generation = p_dispatch_generation
    AND selected_run.error_code = p_error_code
  THEN
    RETURN 'replay';
  END IF;
  IF selected_run.phase <> 'activation'
    OR selected_run.status <> 'running'
    OR selected_run.dispatch_generation <> p_dispatch_generation
    OR selected_run.attempt_token IS DISTINCT FROM p_attempt_token
    OR NOT EXISTS (
      SELECT 1 FROM public.product_image_publication_items AS item
      WHERE item.run_id = selected_run.id
        AND item.product_draft_image_id = p_product_draft_image_id
        AND item.attempt_token = p_attempt_token
    )
  THEN
    RETURN 'stale';
  END IF;

  UPDATE public.product_image_publication_items AS item
  SET status = CASE
        WHEN item.product_draft_image_id = p_product_draft_image_id THEN 'failed'
        ELSE 'pending'
      END,
      attempt_token = NULL,
      error_code = CASE
        WHEN item.product_draft_image_id = p_product_draft_image_id THEN p_error_code
        ELSE NULL
      END
  WHERE item.run_id = selected_run.id;
  UPDATE public.product_image_publication_runs AS run
  SET status = 'failed',
      attempt_token = NULL,
      claim_started_at = NULL,
      error_code = p_error_code
  WHERE run.id = selected_run.id;
  RETURN CASE WHEN public.product_activation_error_is_retryable(p_error_code)
    THEN 'failed_retryable' ELSE 'failed_non_retryable' END;
END;
$$;

CREATE FUNCTION public.fail_product_activation_worker_start(
  p_run_id uuid,
  p_dispatch_generation integer,
  p_error_code text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE selected_run public.product_image_publication_runs%ROWTYPE;
BEGIN
  IF p_run_id IS NULL OR p_dispatch_generation IS NULL OR p_dispatch_generation < 1
    OR p_error_code <> 'product_activation_worker_start_failed'
  THEN
    RAISE EXCEPTION 'product_activation_failure_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT run.* INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'stale'; END IF;
  IF selected_run.status = 'failed'
    AND selected_run.dispatch_generation = p_dispatch_generation
    AND selected_run.error_code = p_error_code
  THEN
    RETURN 'replay';
  END IF;
  IF selected_run.phase <> 'activation'
    OR selected_run.status <> 'pending'
    OR selected_run.dispatch_status <> 'dispatched'
    OR selected_run.dispatch_generation <> p_dispatch_generation
    OR selected_run.attempt_token IS NOT NULL
  THEN
    RETURN 'stale';
  END IF;
  UPDATE public.product_image_publication_runs AS run
  SET status = 'failed', error_code = p_error_code
  WHERE run.id = selected_run.id;
  RETURN 'failed_retryable';
END;
$$;

CREATE FUNCTION public.list_recoverable_product_activation_dispatches(
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
  WHERE run.phase = 'activation'
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

CREATE OR REPLACE FUNCTION public.enforce_direct_product_cover_write()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.cover_image_url IS NULL
    OR (TG_OP = 'UPDATE' AND NEW.cover_image_url IS NOT DISTINCT FROM OLD.cover_image_url)
  THEN
    RETURN NEW;
  END IF;
  IF public.product_moderation_registry_contains(
    'bazoria.product_moderation_activation_ids', NEW.id
  ) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.product_image_publication_runs AS run
    JOIN public.product_image_publication_items AS item
      ON item.run_id = run.id
     AND item.is_cover
     AND item.status = 'completed'
     AND item.public_url = NEW.cover_image_url
    WHERE run.product_id = NEW.id
      AND run.seller_id = NEW.seller_id
      AND run.status = 'completed'
  ) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.direct_product_legacy_cover_allowances AS allowance
    WHERE allowance.product_draft_id = NEW.id
      AND allowance.recorded_cover_image_url = NEW.cover_image_url
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'product_draft_manual_cover_not_allowed' USING ERRCODE = '23514';
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_product_image_publication()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.product_image_publication_runs%ROWTYPE;
  manifest_count integer;
  linked_count integer;
  cover_url text;
BEGIN
  IF NEW.status = 'published'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published')
  THEN
    IF NEW.approved_moderation_submission_id IS NULL
      OR NOT public.product_moderation_registry_contains(
        'bazoria.product_moderation_activation_ids', NEW.id
      )
    THEN
      RAISE EXCEPTION 'product_publication_not_allowed' USING ERRCODE = '23514';
    END IF;
    SELECT run.* INTO selected_run
    FROM public.product_image_publication_runs AS run
    WHERE run.moderation_submission_id = NEW.approved_moderation_submission_id
      AND run.product_id = NEW.id
      AND run.seller_id = NEW.seller_id;
    IF NOT FOUND OR selected_run.phase <> 'activation'
      OR selected_run.status <> 'running'
      OR selected_run.attempt_token IS NULL
    THEN
      RAISE EXCEPTION 'product_publication_not_allowed' USING ERRCODE = '23514';
    END IF;
    SELECT count(*)::integer, max(item.public_url) FILTER (WHERE item.is_cover)
    INTO manifest_count, cover_url
    FROM public.product_image_publication_items AS item
    WHERE item.run_id = selected_run.id
      AND item.status = 'verified'
      AND item.attempt_token = selected_run.attempt_token;
    SELECT count(*)::integer INTO linked_count
    FROM public.product_images AS image
    JOIN public.product_image_publication_items AS item
      ON item.run_id = selected_run.id
     AND item.product_draft_image_id = image.source_product_draft_image_id
     AND item.publication_order = image.sort_order
     AND item.public_url = image.url
    WHERE image.product_id = NEW.id;
    IF manifest_count < 1
      OR linked_count <> manifest_count
      OR (SELECT count(*) FROM public.product_images WHERE product_id = NEW.id) <> manifest_count
      OR cover_url IS NULL
      OR NEW.cover_image_url IS DISTINCT FROM cover_url
      OR NEW.cover_image_id IS DISTINCT FROM (
        SELECT item.product_draft_image_id
        FROM public.product_image_publication_items AS item
        WHERE item.run_id = selected_run.id AND item.is_cover
      )
    THEN
      RAISE EXCEPTION 'product_publication_not_allowed' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.finalize_product_activation(
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
  selected_submission public.product_moderation_submissions%ROWTYPE;
  selected_product public.products%ROWTYPE;
  selected_seller public.sellers%ROWTYPE;
  selected_category public.categories%ROWTYPE;
  snapshot jsonb;
  snapshot_title text;
  snapshot_title_source text;
  snapshot_category_id uuid;
  snapshot_audiences text[];
  normalized_audiences text[];
  snapshot_product_code text;
  allocated_product_code text;
  snapshot_cover_image_id uuid;
  cover_url text;
  manifest_count integer;
  cleanup_count integer;
  description_entry jsonb;
  facts_snapshot jsonb;
  selected_facts_revision integer;
BEGIN
  IF p_run_id IS NULL OR p_dispatch_generation IS NULL OR p_dispatch_generation < 1
    OR p_attempt_token IS NULL
  THEN
    RAISE EXCEPTION 'product_activation_finalization_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT run.* INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF selected_run.dispatch_generation <> p_dispatch_generation THEN RETURN 'stale'; END IF;
  IF selected_run.status = 'completed' THEN RETURN 'completed'; END IF;
  IF selected_run.phase = 'post_switch_cleanup' THEN RETURN 'cleanup_pending'; END IF;
  IF selected_run.status <> 'running'
    OR selected_run.phase <> 'activation'
    OR selected_run.attempt_token IS DISTINCT FROM p_attempt_token
  THEN
    RETURN 'stale';
  END IF;

  SELECT submission.* INTO selected_submission
  FROM public.product_moderation_submissions AS submission
  WHERE submission.id = selected_run.moderation_submission_id
    AND submission.product_id = selected_run.product_id
    AND submission.seller_id = selected_run.seller_id
  FOR SHARE;
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = selected_run.product_id
    AND product.seller_id = selected_run.seller_id
  FOR UPDATE;
  SELECT seller.* INTO selected_seller
  FROM public.sellers AS seller
  WHERE seller.id = selected_run.seller_id
  FOR SHARE;

  IF selected_submission.id IS NULL OR selected_product.id IS NULL OR selected_seller.id IS NULL
    OR selected_submission.review_status <> 'approved'
    OR selected_submission.revision <> selected_run.expected_submission_revision
    OR selected_product.active_moderation_submission_id IS DISTINCT FROM selected_submission.id
    OR encode(
      extensions.digest(convert_to(selected_submission.snapshot_json::text, 'UTF8'), 'sha256'),
      'hex'
    ) <> selected_run.snapshot_hash
    OR selected_seller.approved_profile_submission_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.seller_profile_submissions AS approval
      WHERE approval.id = selected_seller.approved_profile_submission_id
        AND approval.seller_id = selected_seller.id
        AND approval.status = 'approved'
    )
  THEN
    RETURN 'not_allowed';
  END IF;

  snapshot := selected_submission.snapshot_json;
  BEGIN
    snapshot_title := btrim(snapshot ->> 'title');
    snapshot_title_source := snapshot ->> 'titleSource';
    snapshot_category_id := (snapshot ->> 'categoryId')::uuid;
    snapshot_cover_image_id := (snapshot ->> 'coverImageId')::uuid;
    snapshot_product_code := NULLIF(btrim(snapshot ->> 'productCode'), '');
    SELECT array_agg(value ORDER BY value)
    INTO snapshot_audiences
    FROM jsonb_array_elements_text(snapshot -> 'audiences') AS requested(value);
    normalized_audiences := public.normalize_product_audience_set(snapshot_audiences);
  EXCEPTION WHEN OTHERS THEN
    RETURN 'not_allowed';
  END;
  IF snapshot ->> 'schemaVersion' <> '1'
    OR snapshot ->> 'productId' IS DISTINCT FROM selected_product.id::text
    OR snapshot ->> 'sellerId' IS DISTINCT FROM selected_seller.id::text
    OR snapshot_title IS NULL OR snapshot_title = '' OR char_length(snapshot_title) > 50
    OR snapshot_title_source NOT IN ('human', 'model')
    OR cardinality(normalized_audiences) < 1
    OR jsonb_typeof(snapshot -> 'descriptions') <> 'array'
    OR jsonb_typeof(snapshot -> 'imageIds') <> 'array'
  THEN
    RETURN 'not_allowed';
  END IF;
  SELECT category.* INTO selected_category
  FROM public.categories AS category
  WHERE category.id = snapshot_category_id
    AND category.parent_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.categories AS child WHERE child.parent_id = category.id
    )
  FOR SHARE;
  IF NOT FOUND THEN RETURN 'not_allowed'; END IF;

  SELECT count(*)::integer, max(item.public_url) FILTER (WHERE item.is_cover)
  INTO manifest_count, cover_url
  FROM public.product_image_publication_items AS item
  WHERE item.run_id = selected_run.id
    AND item.status = 'verified'
    AND item.attempt_token = p_attempt_token
    AND item.source_sha256 IS NOT NULL
    AND item.public_sha256 = item.source_sha256
    AND item.public_size_bytes = item.expected_source_size_bytes;
  IF manifest_count < 1
    OR manifest_count <> jsonb_array_length(snapshot -> 'imageIds')
    OR cover_url IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.product_image_publication_items AS item
      WHERE item.run_id = selected_run.id
        AND item.product_draft_image_id = snapshot_cover_image_id
        AND item.is_cover
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(snapshot -> 'imageIds') WITH ORDINALITY AS expected(id, ordinal)
      FULL JOIN (
        SELECT manifest_item.*
        FROM public.product_image_publication_items AS manifest_item
        WHERE manifest_item.run_id = selected_run.id
      ) AS item
        ON item.product_draft_image_id = expected.id::uuid
       AND item.publication_order = expected.ordinal - 1
      WHERE expected.id IS NULL OR item.product_draft_image_id IS NULL
    )
  THEN
    RETURN 'not_allowed';
  END IF;

  IF selected_product.product_code IS NULL THEN
    IF snapshot_product_code IS NOT NULL
      OR snapshot #>> '{productCodeInput,companyCode}' IS DISTINCT FROM selected_seller.company_code
      OR snapshot #>> '{productCodeInput,categoryPrefix}' IS DISTINCT FROM selected_category.product_code_prefix
    THEN
      RETURN 'not_allowed';
    END IF;
    allocated_product_code := public.reserve_product_code(
      selected_product.id, selected_product.seller_id, selected_category.id
    );
  ELSE
    IF snapshot_product_code IS DISTINCT FROM selected_product.product_code THEN
      RETURN 'not_allowed';
    END IF;
    allocated_product_code := selected_product.product_code;
  END IF;

  PERFORM public.product_moderation_registry_add(
    'bazoria.product_moderation_activation_ids', selected_product.id
  );

  INSERT INTO public.product_activation_cleanup_items (
    run_id, destination_key, cleanup_kind, superseded_run_id,
    source_product_image_id, expected_size_bytes, expected_sha256, expected_etag
  )
  SELECT
    selected_run.id,
    prior_item.destination_key,
    'superseded_public',
    prior_run.id,
    public_image.id,
    prior_item.public_size_bytes,
    prior_item.public_sha256,
    prior_item.public_etag
  FROM public.product_images AS public_image
  JOIN public.product_image_publication_runs AS prior_run
    ON prior_run.moderation_submission_id = selected_product.approved_moderation_submission_id
   AND prior_run.product_id = selected_product.id
  JOIN public.product_image_publication_items AS prior_item
    ON prior_item.run_id = prior_run.id
   AND prior_item.product_draft_image_id = public_image.source_product_draft_image_id
   AND prior_item.public_url = public_image.url
  WHERE public_image.product_id = selected_product.id
    AND prior_item.public_size_bytes IS NOT NULL
    AND prior_item.public_sha256 ~ '^[0-9a-f]{64}$'
  ON CONFLICT (run_id, destination_key) DO NOTHING;

  DELETE FROM public.product_draft_descriptions AS description
  WHERE description.product_draft_id = selected_product.id;
  DELETE FROM public.product_draft_facts AS facts
  WHERE facts.product_draft_id = selected_product.id;
  facts_snapshot := snapshot -> 'facts';
  IF facts_snapshot IS NOT NULL AND facts_snapshot <> 'null'::jsonb THEN
    IF jsonb_typeof(facts_snapshot) <> 'object'
      OR jsonb_typeof(facts_snapshot -> 'facts') <> 'object'
      OR (facts_snapshot ->> 'factsRevision')::integer < 1
    THEN
      RAISE EXCEPTION 'product_activation_snapshot_invalid' USING ERRCODE = '23514';
    END IF;
    selected_facts_revision := (facts_snapshot ->> 'factsRevision')::integer;
    INSERT INTO public.product_draft_facts (
      product_draft_id, facts_json, facts_revision
    ) VALUES (
      selected_product.id, facts_snapshot -> 'facts', selected_facts_revision
    );
  ELSE
    selected_facts_revision := NULL;
  END IF;

  FOR description_entry IN
    SELECT value FROM jsonb_array_elements(snapshot -> 'descriptions') AS entry(value)
  LOOP
    INSERT INTO public.product_draft_descriptions (
      product_draft_id, language, description_text, source, facts_revision,
      provider, model, pipeline_version, generated_at, backfilled_from_legacy
    ) VALUES (
      selected_product.id,
      description_entry ->> 'language',
      description_entry ->> 'descriptionText',
      description_entry ->> 'source',
      (description_entry ->> 'factsRevision')::integer,
      NULLIF(description_entry ->> 'provider', ''),
      NULLIF(description_entry ->> 'model', ''),
      NULLIF(description_entry ->> 'pipelineVersion', ''),
      CASE WHEN description_entry ->> 'generatedAt' IS NULL THEN NULL
        ELSE (description_entry ->> 'generatedAt')::timestamptz END,
      (description_entry ->> 'factsRevision') IS NULL
    );
  END LOOP;

  DELETE FROM public.product_audience_memberships AS audience
  WHERE audience.product_id = selected_product.id;
  INSERT INTO public.product_audience_memberships (product_id, audience)
  SELECT selected_product.id, audience
  FROM unnest(normalized_audiences) AS requested(audience);

  DELETE FROM public.product_images AS image
  WHERE image.product_id = selected_product.id;
  INSERT INTO public.product_images (
    product_id, url, sort_order, source_product_draft_image_id
  )
  SELECT
    selected_product.id, item.public_url, item.publication_order,
    item.product_draft_image_id
  FROM public.product_image_publication_items AS item
  WHERE item.run_id = selected_run.id
  ORDER BY item.publication_order;

  SELECT count(*)::integer INTO cleanup_count
  FROM public.product_activation_cleanup_items AS cleanup
  WHERE cleanup.run_id = selected_run.id
    AND cleanup.status <> 'completed';

  UPDATE public.products AS product
  SET title = snapshot_title,
      title_source = snapshot_title_source,
      category_id = snapshot_category_id,
      moq = (snapshot ->> 'minimumOrder')::integer,
      pack_size = snapshot ->> 'packSize',
      price = (snapshot ->> 'price')::numeric,
      currency = snapshot ->> 'currency',
      stock = (snapshot ->> 'stock')::public.stock_status,
      cover_image_url = cover_url,
      cover_image_id = snapshot_cover_image_id,
      product_code = allocated_product_code,
      status = 'published',
      approved_moderation_submission_id = selected_submission.id,
      active_moderation_submission_id = CASE
        WHEN cleanup_count = 0 THEN NULL ELSE selected_submission.id END
  WHERE product.id = selected_product.id;

  DELETE FROM public.product_moderation_working_copy_images AS image
  WHERE image.product_id = selected_product.id;
  DELETE FROM public.product_moderation_working_copies AS working_copy
  WHERE working_copy.product_id = selected_product.id;

  UPDATE public.product_image_publication_items AS item
  SET status = 'completed', attempt_token = NULL, error_code = NULL
  WHERE item.run_id = selected_run.id;
  IF cleanup_count = 0 THEN
    UPDATE public.product_image_publication_runs AS run
    SET status = 'completed',
        attempt_token = NULL,
        claim_started_at = NULL,
        error_code = NULL,
        completed_at = now()
    WHERE run.id = selected_run.id;
  ELSE
    UPDATE public.product_image_publication_runs AS run
    SET phase = 'post_switch_cleanup',
        status = 'running',
        error_code = NULL
    WHERE run.id = selected_run.id;
  END IF;

  INSERT INTO public.product_moderation_events (
    product_id, seller_id, submission_id, event_type, actor_user_id,
    expected_revision, request_id
  ) VALUES (
    selected_product.id, selected_product.seller_id, selected_submission.id,
    'activated', selected_submission.administrator_user_id,
    selected_submission.revision, selected_run.id
  ) ON CONFLICT (product_id, request_id) DO NOTHING;

  RETURN CASE WHEN cleanup_count = 0 THEN 'completed' ELSE 'cleanup_pending' END;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation
  THEN
    RETURN 'not_allowed';
END;
$$;

REVOKE ALL ON TABLE public.product_activation_cleanup_items
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.product_activation_cleanup_items TO service_role;
ALTER TABLE public.product_activation_cleanup_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.product_activation_error_is_retryable(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_product_activation_run(uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_product_activation_object_created(
  uuid, integer, uuid, uuid, text, bigint, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_product_activation_item(
  uuid, integer, uuid, uuid, bigint, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_product_activation_attempt(
  uuid, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_product_activation_worker_start(uuid, integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_recoverable_product_activation_dispatches(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_product_activation(uuid, integer, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.product_activation_error_is_retryable(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_product_activation_run(uuid, integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_product_activation_object_created(
  uuid, integer, uuid, uuid, text, bigint, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_product_activation_item(
  uuid, integer, uuid, uuid, bigint, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_product_activation_attempt(
  uuid, integer, uuid, uuid, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_product_activation_worker_start(uuid, integer, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.list_recoverable_product_activation_dispatches(integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_product_activation(uuid, integer, uuid)
  TO service_role;

COMMIT;
