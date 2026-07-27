CREATE TYPE public.product_draft_image_storage_reconciliation_status AS ENUM (
  'pending',
  'started',
  'completed',
  'failed'
);

CREATE TYPE public.product_draft_image_public_object_state AS ENUM (
  'unchecked',
  'absent',
  'deleted',
  'unresolved'
);

CREATE TYPE public.product_draft_image_storage_cutover_status AS ENUM (
  'pending',
  'running',
  'completed',
  'failed'
);

CREATE TYPE public.product_draft_image_storage_cutover_scan_phase AS ENUM (
  'reconciliation',
  'discovery',
  'confirming'
);

CREATE TABLE public.product_draft_image_storage_reconciliations (
  destination_key text PRIMARY KEY,
  product_draft_image_id uuid UNIQUE
    REFERENCES public.product_draft_images(id) ON DELETE RESTRICT,
  status public.product_draft_image_storage_reconciliation_status
    NOT NULL DEFAULT 'pending',
  public_object_state public.product_draft_image_public_object_state
    NOT NULL DEFAULT 'unchecked',
  attempt_count integer NOT NULL DEFAULT 0,
  attempt_token uuid,
  claim_started_at timestamptz,
  last_attempt_at timestamptz,
  error_code text,
  retryable boolean NOT NULL DEFAULT false,
  release_blocking boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_draft_image_storage_reconciliations_key
    CHECK (
      length(btrim(destination_key)) > length('product-drafts/')
      AND destination_key LIKE 'product-drafts/%'
    ),
  CONSTRAINT product_draft_image_storage_reconciliations_attempt_count
    CHECK (attempt_count >= 0),
  CONSTRAINT product_draft_image_storage_reconciliations_claim
    CHECK (
      (
        status = 'started'
        AND attempt_token IS NOT NULL
        AND claim_started_at IS NOT NULL
      )
      OR (
        status <> 'started'
        AND attempt_token IS NULL
        AND claim_started_at IS NULL
      )
    ),
  CONSTRAINT product_draft_image_storage_reconciliations_terminal
    CHECK (
      (
        status IN ('completed', 'failed')
        AND completed_at IS NOT NULL
      )
      OR (
        status IN ('pending', 'started')
        AND completed_at IS NULL
      )
    ),
  CONSTRAINT product_draft_image_storage_reconciliations_completed
    CHECK (
      status <> 'completed'
      OR (
        error_code IS NULL
        AND NOT retryable
        AND NOT release_blocking
        AND public_object_state IN ('absent', 'deleted')
      )
    ),
  CONSTRAINT product_draft_image_storage_reconciliations_failed
    CHECK (
      status <> 'failed'
      OR (error_code IS NOT NULL AND length(btrim(error_code)) > 0)
    ),
  CONSTRAINT product_draft_image_storage_reconciliations_pending
    CHECK (
      status <> 'pending'
      OR (
        public_object_state = 'unchecked'
        AND error_code IS NULL
        AND NOT retryable
        AND NOT release_blocking
      )
    )
);

CREATE INDEX product_draft_image_storage_reconciliations_claim_idx
  ON public.product_draft_image_storage_reconciliations (
    status,
    retryable,
    claim_started_at,
    destination_key
  );

CREATE INDEX product_draft_image_storage_reconciliations_blocking_idx
  ON public.product_draft_image_storage_reconciliations (
    release_blocking,
    status
  );

CREATE TABLE public.product_draft_image_storage_cutovers (
  version text PRIMARY KEY,
  status public.product_draft_image_storage_cutover_status
    NOT NULL DEFAULT 'pending',
  scan_phase public.product_draft_image_storage_cutover_scan_phase
    NOT NULL DEFAULT 'reconciliation',
  attempt_count integer NOT NULL DEFAULT 0,
  attempt_token uuid,
  claim_started_at timestamptz,
  last_attempt_at timestamptz,
  scan_cursor text,
  pending_count integer NOT NULL DEFAULT 0,
  started_count integer NOT NULL DEFAULT 0,
  completed_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  release_blocking_count integer NOT NULL DEFAULT 0,
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_draft_image_storage_cutovers_version
    CHECK (length(btrim(version)) > 0),
  CONSTRAINT product_draft_image_storage_cutovers_attempt_count
    CHECK (attempt_count >= 0),
  CONSTRAINT product_draft_image_storage_cutovers_counts
    CHECK (
      pending_count >= 0
      AND started_count >= 0
      AND completed_count >= 0
      AND failed_count >= 0
      AND release_blocking_count >= 0
    ),
  CONSTRAINT product_draft_image_storage_cutovers_claim
    CHECK (
      (
        status = 'running'
        AND attempt_token IS NOT NULL
        AND claim_started_at IS NOT NULL
      )
      OR (
        status <> 'running'
        AND attempt_token IS NULL
        AND claim_started_at IS NULL
      )
    ),
  CONSTRAINT product_draft_image_storage_cutovers_completed
    CHECK (
      status <> 'completed'
      OR (
        scan_phase = 'confirming'
        AND scan_cursor IS NULL
        AND pending_count = 0
        AND started_count = 0
        AND release_blocking_count = 0
        AND error_code IS NULL
        AND completed_at IS NOT NULL
      )
    ),
  CONSTRAINT product_draft_image_storage_cutovers_incomplete
    CHECK (status = 'completed' OR completed_at IS NULL),
  CONSTRAINT product_draft_image_storage_cutovers_error
    CHECK (
      (status = 'failed' AND error_code IS NOT NULL AND length(btrim(error_code)) > 0)
      OR (status <> 'failed' AND error_code IS NULL)
    )
);

CREATE TRIGGER trg_product_draft_image_storage_reconciliations_updated
  BEFORE UPDATE ON public.product_draft_image_storage_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_product_draft_image_storage_cutovers_updated
  BEFORE UPDATE ON public.product_draft_image_storage_cutovers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON public.product_draft_image_storage_reconciliations TO service_role;
GRANT ALL ON public.product_draft_image_storage_cutovers TO service_role;

ALTER TABLE public.product_draft_image_storage_reconciliations
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_draft_image_storage_cutovers
  ENABLE ROW LEVEL SECURITY;

INSERT INTO public.product_draft_image_storage_reconciliations (
  destination_key,
  product_draft_image_id
)
SELECT
  destination_key,
  id
FROM public.product_draft_images;

INSERT INTO public.product_draft_image_storage_cutovers (
  version,
  pending_count
)
VALUES (
  'private-product-draft-images-v1',
  (SELECT count(*) FROM public.product_draft_image_storage_reconciliations)
);

CREATE FUNCTION public.claim_product_draft_image_storage_cutover(
  p_version text,
  p_claim_timeout_seconds integer
)
RETURNS SETOF public.product_draft_image_storage_cutovers
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_version text;
BEGIN
  IF p_claim_timeout_seconds <= 0 THEN
    RAISE EXCEPTION 'p_claim_timeout_seconds must be positive';
  END IF;

  UPDATE public.product_draft_image_storage_cutovers AS cutover
  SET
    status = 'running',
    scan_phase = CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.product_draft_image_storage_reconciliations AS reconciliation
        WHERE reconciliation.status IN ('pending', 'started')
          OR (reconciliation.status = 'failed' AND reconciliation.retryable)
      )
      THEN 'reconciliation'::public.product_draft_image_storage_cutover_scan_phase
      ELSE 'discovery'::public.product_draft_image_storage_cutover_scan_phase
    END,
    attempt_count = cutover.attempt_count + 1,
    attempt_token = gen_random_uuid(),
    claim_started_at = now(),
    last_attempt_at = now(),
    scan_cursor = NULL,
    pending_count = (
      SELECT count(*)
      FROM public.product_draft_image_storage_reconciliations
      WHERE status = 'pending'
    ),
    started_count = (
      SELECT count(*)
      FROM public.product_draft_image_storage_reconciliations
      WHERE status = 'started'
    ),
    completed_count = (
      SELECT count(*)
      FROM public.product_draft_image_storage_reconciliations
      WHERE status = 'completed'
    ),
    failed_count = (
      SELECT count(*)
      FROM public.product_draft_image_storage_reconciliations
      WHERE status = 'failed'
    ),
    release_blocking_count = (
      SELECT count(*)
      FROM public.product_draft_image_storage_reconciliations
      WHERE release_blocking
    ),
    error_code = NULL,
    started_at = coalesce(cutover.started_at, now()),
    completed_at = NULL
  WHERE cutover.version = p_version
    AND (
      cutover.status IN ('pending', 'failed')
      OR (
        cutover.status = 'running'
        AND cutover.last_attempt_at
          < now() - make_interval(secs => p_claim_timeout_seconds)
      )
    )
  RETURNING cutover.version
  INTO claimed_version;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.product_draft_image_storage_reconciliations
  SET
    status = 'pending',
    public_object_state = 'unchecked',
    attempt_token = NULL,
    claim_started_at = NULL,
    error_code = NULL,
    retryable = false,
    release_blocking = false,
    completed_at = NULL
  WHERE status = 'started'
    OR (status = 'failed' AND retryable);

  PERFORM public.heartbeat_product_draft_image_storage_cutover(
    p_version,
    (
      SELECT attempt_token
      FROM public.product_draft_image_storage_cutovers
      WHERE version = claimed_version
    )
  );

  RETURN QUERY
  SELECT cutover.*
  FROM public.product_draft_image_storage_cutovers AS cutover
  WHERE cutover.version = claimed_version;
END;
$$;

CREATE FUNCTION public.heartbeat_product_draft_image_storage_cutover(
  p_version text,
  p_attempt_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.product_draft_image_storage_cutovers AS cutover
  SET
    last_attempt_at = now(),
    pending_count = (
      SELECT count(*)
      FROM public.product_draft_image_storage_reconciliations
      WHERE status = 'pending'
    ),
    started_count = (
      SELECT count(*)
      FROM public.product_draft_image_storage_reconciliations
      WHERE status = 'started'
    ),
    completed_count = (
      SELECT count(*)
      FROM public.product_draft_image_storage_reconciliations
      WHERE status = 'completed'
    ),
    failed_count = (
      SELECT count(*)
      FROM public.product_draft_image_storage_reconciliations
      WHERE status = 'failed'
    ),
    release_blocking_count = (
      SELECT count(*)
      FROM public.product_draft_image_storage_reconciliations
      WHERE release_blocking
    )
  WHERE cutover.version = p_version
    AND cutover.status = 'running'
    AND cutover.attempt_token = p_attempt_token;

  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.claim_next_product_draft_image_storage_reconciliation(
  p_version text,
  p_cutover_attempt_token uuid,
  p_claim_timeout_seconds integer
)
RETURNS TABLE (
  destination_key text,
  product_draft_image_id uuid,
  reconciliation_status public.product_draft_image_storage_reconciliation_status,
  public_object_state public.product_draft_image_public_object_state,
  attempt_count integer,
  attempt_token uuid,
  image_status public.product_draft_image_status,
  storage_bucket text,
  content_type text,
  size_bytes bigint,
  classifier_organization_id uuid,
  classifier_batch_id uuid,
  classifier_group_id uuid,
  classifier_image_id uuid,
  source_content_length bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_claim_timeout_seconds <= 0 THEN
    RAISE EXCEPTION 'p_claim_timeout_seconds must be positive';
  END IF;

  IF NOT public.heartbeat_product_draft_image_storage_cutover(
    p_version,
    p_cutover_attempt_token
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT reconciliation.destination_key
    FROM public.product_draft_image_storage_reconciliations AS reconciliation
    WHERE (
      reconciliation.status = 'pending'
      OR (
        reconciliation.status = 'started'
        AND reconciliation.last_attempt_at
          < now() - make_interval(secs => p_claim_timeout_seconds)
      )
    )
    ORDER BY reconciliation.destination_key
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.product_draft_image_storage_reconciliations AS reconciliation
    SET
      status = 'started',
      public_object_state = 'unchecked',
      attempt_count = reconciliation.attempt_count + 1,
      attempt_token = gen_random_uuid(),
      claim_started_at = now(),
      last_attempt_at = now(),
      error_code = NULL,
      retryable = false,
      release_blocking = false,
      completed_at = NULL
    FROM candidate
    WHERE reconciliation.destination_key = candidate.destination_key
    RETURNING reconciliation.*
  )
  SELECT
    claimed.destination_key,
    claimed.product_draft_image_id,
    claimed.status,
    claimed.public_object_state,
    claimed.attempt_count,
    claimed.attempt_token,
    draft_image.status,
    draft_image.storage_bucket,
    draft_image.content_type,
    draft_image.size_bytes,
    promotion.classifier_organization_id,
    promotion.classifier_batch_id,
    promotion.classifier_group_id,
    promotion.classifier_image_id,
    promotion.source_content_length
  FROM claimed
  LEFT JOIN public.product_draft_images AS draft_image
    ON draft_image.id = claimed.product_draft_image_id
  LEFT JOIN public.product_draft_image_promotions AS promotion
    ON promotion.product_draft_image_id = claimed.product_draft_image_id;
END;
$$;

CREATE FUNCTION public.verify_product_draft_image_storage_reconciliation_claim(
  p_version text,
  p_cutover_attempt_token uuid,
  p_destination_key text,
  p_reconciliation_attempt_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.heartbeat_product_draft_image_storage_cutover(
    p_version,
    p_cutover_attempt_token
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.product_draft_image_storage_reconciliations AS reconciliation
  SET last_attempt_at = now()
  WHERE reconciliation.destination_key = p_destination_key
    AND reconciliation.status = 'started'
    AND reconciliation.attempt_token = p_reconciliation_attempt_token;

  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.finalize_product_draft_image_storage_reconciliation(
  p_version text,
  p_cutover_attempt_token uuid,
  p_destination_key text,
  p_reconciliation_attempt_token uuid,
  p_status public.product_draft_image_storage_reconciliation_status,
  p_public_object_state public.product_draft_image_public_object_state,
  p_error_code text,
  p_retryable boolean,
  p_release_blocking boolean,
  p_set_private_bucket boolean
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_image_id uuid;
BEGIN
  IF p_status NOT IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'p_status must be terminal';
  END IF;
  IF p_status = 'completed'
    AND (
      p_error_code IS NOT NULL
      OR p_retryable
      OR p_release_blocking
      OR p_public_object_state NOT IN ('absent', 'deleted')
    )
  THEN
    RAISE EXCEPTION 'completed reconciliation fields are invalid';
  END IF;
  IF p_status = 'failed'
    AND (p_error_code IS NULL OR length(btrim(p_error_code)) = 0)
  THEN
    RAISE EXCEPTION 'failed reconciliation requires p_error_code';
  END IF;

  IF NOT public.heartbeat_product_draft_image_storage_cutover(
    p_version,
    p_cutover_attempt_token
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.product_draft_image_storage_reconciliations AS reconciliation
  SET
    status = p_status,
    public_object_state = p_public_object_state,
    attempt_token = NULL,
    claim_started_at = NULL,
    last_attempt_at = now(),
    error_code = p_error_code,
    retryable = p_retryable,
    release_blocking = p_release_blocking,
    completed_at = now()
  WHERE reconciliation.destination_key = p_destination_key
    AND reconciliation.status = 'started'
    AND reconciliation.attempt_token = p_reconciliation_attempt_token
  RETURNING reconciliation.product_draft_image_id
  INTO selected_image_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_set_private_bucket AND selected_image_id IS NOT NULL THEN
    UPDATE public.product_draft_images
    SET storage_bucket = 'product-draft-images'
    WHERE id = selected_image_id;
  END IF;

  PERFORM public.heartbeat_product_draft_image_storage_cutover(
    p_version,
    p_cutover_attempt_token
  );
  RETURN true;
END;
$$;

CREATE FUNCTION public.retry_product_draft_image_storage_reconciliation(
  p_version text,
  p_destination_key text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_cutover_status public.product_draft_image_storage_cutover_status;
BEGIN
  SELECT status
  INTO selected_cutover_status
  FROM public.product_draft_image_storage_cutovers
  WHERE version = p_version
  FOR UPDATE;

  IF NOT FOUND OR selected_cutover_status NOT IN ('pending', 'failed') THEN
    RETURN false;
  END IF;

  UPDATE public.product_draft_image_storage_reconciliations
  SET
    status = 'pending',
    public_object_state = 'unchecked',
    attempt_token = NULL,
    claim_started_at = NULL,
    error_code = NULL,
    retryable = false,
    release_blocking = false,
    completed_at = NULL
  WHERE destination_key = p_destination_key
    AND status = 'failed';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.product_draft_image_storage_cutovers
  SET
    status = 'pending',
    scan_phase = 'reconciliation',
    scan_cursor = NULL,
    attempt_token = NULL,
    claim_started_at = NULL,
    pending_count = (
      SELECT count(*)
      FROM public.product_draft_image_storage_reconciliations
      WHERE status = 'pending'
    ),
    started_count = (
      SELECT count(*)
      FROM public.product_draft_image_storage_reconciliations
      WHERE status = 'started'
    ),
    completed_count = (
      SELECT count(*)
      FROM public.product_draft_image_storage_reconciliations
      WHERE status = 'completed'
    ),
    failed_count = (
      SELECT count(*)
      FROM public.product_draft_image_storage_reconciliations
      WHERE status = 'failed'
    ),
    release_blocking_count = (
      SELECT count(*)
      FROM public.product_draft_image_storage_reconciliations
      WHERE release_blocking
    ),
    error_code = NULL,
    completed_at = NULL
  WHERE version = p_version
    AND status IN ('pending', 'failed');

  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.list_legacy_product_draft_public_object_keys(
  p_cursor text,
  p_limit integer
)
RETURNS TABLE (destination_key text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 100';
  END IF;
  IF p_cursor IS NOT NULL AND p_cursor NOT LIKE 'product-drafts/%' THEN
    RAISE EXCEPTION 'p_cursor must be under product-drafts/';
  END IF;

  RETURN QUERY
  SELECT object.name
  FROM storage.objects AS object
  WHERE object.bucket_id = 'product-images'
    AND object.name LIKE 'product-drafts/%'
    AND (p_cursor IS NULL OR object.name > p_cursor)
  ORDER BY object.name
  LIMIT p_limit;
END;
$$;

CREATE FUNCTION public.record_product_draft_image_storage_scan_object(
  p_version text,
  p_cutover_attempt_token uuid,
  p_destination_key text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_image_id uuid;
  selected_error_code text;
BEGIN
  IF p_destination_key NOT LIKE 'product-drafts/%' THEN
    RAISE EXCEPTION 'p_destination_key must be under product-drafts/';
  END IF;

  IF NOT public.heartbeat_product_draft_image_storage_cutover(
    p_version,
    p_cutover_attempt_token
  ) THEN
    RETURN 'claim_lost';
  END IF;

  SELECT product_draft_image_id
  INTO selected_image_id
  FROM public.product_draft_image_storage_reconciliations
  WHERE destination_key = p_destination_key;

  IF FOUND THEN
    selected_error_code = CASE
      WHEN selected_image_id IS NULL THEN 'legacy_destination_unowned'
      ELSE 'legacy_public_delete_failed'
    END;

    UPDATE public.product_draft_image_storage_reconciliations
    SET
      status = 'failed',
      public_object_state = 'unresolved',
      attempt_token = NULL,
      claim_started_at = NULL,
      last_attempt_at = now(),
      error_code = selected_error_code,
      retryable = selected_image_id IS NOT NULL,
      release_blocking = true,
      completed_at = now()
    WHERE destination_key = p_destination_key;
  ELSE
    selected_error_code = 'legacy_destination_unowned';
    INSERT INTO public.product_draft_image_storage_reconciliations (
      destination_key,
      product_draft_image_id,
      status,
      public_object_state,
      error_code,
      retryable,
      release_blocking,
      completed_at
    )
    VALUES (
      p_destination_key,
      NULL,
      'failed',
      'unresolved',
      selected_error_code,
      false,
      true,
      now()
    );
  END IF;

  PERFORM public.heartbeat_product_draft_image_storage_cutover(
    p_version,
    p_cutover_attempt_token
  );
  RETURN selected_error_code;
END;
$$;

CREATE FUNCTION public.set_product_draft_image_storage_cutover_scan_progress(
  p_version text,
  p_attempt_token uuid,
  p_scan_phase public.product_draft_image_storage_cutover_scan_phase,
  p_expected_cursor text,
  p_next_cursor text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.product_draft_image_storage_cutovers
  SET
    scan_cursor = p_next_cursor,
    last_attempt_at = now()
  WHERE version = p_version
    AND status = 'running'
    AND attempt_token = p_attempt_token
    AND scan_phase = p_scan_phase
    AND scan_cursor IS NOT DISTINCT FROM p_expected_cursor;

  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.begin_product_draft_image_storage_cutover_scan_phase(
  p_version text,
  p_attempt_token uuid,
  p_expected_phase public.product_draft_image_storage_cutover_scan_phase,
  p_next_phase public.product_draft_image_storage_cutover_scan_phase
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (p_expected_phase, p_next_phase) NOT IN (
    ('reconciliation', 'discovery'),
    ('discovery', 'confirming')
  ) THEN
    RAISE EXCEPTION 'invalid scan phase transition';
  END IF;

  UPDATE public.product_draft_image_storage_cutovers
  SET
    scan_phase = p_next_phase,
    scan_cursor = NULL,
    last_attempt_at = now()
  WHERE version = p_version
    AND status = 'running'
    AND attempt_token = p_attempt_token
    AND scan_phase = p_expected_phase;

  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.fail_product_draft_image_storage_cutover(
  p_version text,
  p_attempt_token uuid,
  p_error_code text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_error_code IS NULL OR length(btrim(p_error_code)) = 0 THEN
    RAISE EXCEPTION 'p_error_code must be nonblank';
  END IF;

  PERFORM public.heartbeat_product_draft_image_storage_cutover(
    p_version,
    p_attempt_token
  );

  UPDATE public.product_draft_image_storage_cutovers
  SET
    status = 'failed',
    attempt_token = NULL,
    claim_started_at = NULL,
    error_code = p_error_code
  WHERE version = p_version
    AND status = 'running'
    AND attempt_token = p_attempt_token;

  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.complete_product_draft_image_storage_cutover(
  p_version text,
  p_attempt_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.heartbeat_product_draft_image_storage_cutover(
    p_version,
    p_attempt_token
  );

  UPDATE public.product_draft_image_storage_cutovers AS cutover
  SET
    status = 'completed',
    attempt_token = NULL,
    claim_started_at = NULL,
    scan_cursor = NULL,
    error_code = NULL,
    completed_at = now()
  WHERE cutover.version = p_version
    AND cutover.status = 'running'
    AND cutover.attempt_token = p_attempt_token
    AND cutover.scan_phase = 'confirming'
    AND cutover.scan_cursor IS NULL
    AND cutover.pending_count = 0
    AND cutover.started_count = 0
    AND cutover.release_blocking_count = 0
    AND NOT EXISTS (
      SELECT 1
      FROM storage.objects AS object
      WHERE object.bucket_id = 'product-images'
        AND object.name LIKE 'product-drafts/%'
    );

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_product_draft_image_storage_cutover(
  text,
  integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.heartbeat_product_draft_image_storage_cutover(
  text,
  uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_next_product_draft_image_storage_reconciliation(
  text,
  uuid,
  integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_product_draft_image_storage_reconciliation_claim(
  text,
  uuid,
  text,
  uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_product_draft_image_storage_reconciliation(
  text,
  uuid,
  text,
  uuid,
  public.product_draft_image_storage_reconciliation_status,
  public.product_draft_image_public_object_state,
  text,
  boolean,
  boolean,
  boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retry_product_draft_image_storage_reconciliation(
  text,
  text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_legacy_product_draft_public_object_keys(
  text,
  integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_product_draft_image_storage_scan_object(
  text,
  uuid,
  text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_product_draft_image_storage_cutover_scan_progress(
  text,
  uuid,
  public.product_draft_image_storage_cutover_scan_phase,
  text,
  text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.begin_product_draft_image_storage_cutover_scan_phase(
  text,
  uuid,
  public.product_draft_image_storage_cutover_scan_phase,
  public.product_draft_image_storage_cutover_scan_phase
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_product_draft_image_storage_cutover(
  text,
  uuid,
  text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_product_draft_image_storage_cutover(
  text,
  uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_product_draft_image_storage_cutover(
  text,
  integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_product_draft_image_storage_cutover(
  text,
  uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_product_draft_image_storage_reconciliation(
  text,
  uuid,
  integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_product_draft_image_storage_reconciliation_claim(
  text,
  uuid,
  text,
  uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_product_draft_image_storage_reconciliation(
  text,
  uuid,
  text,
  uuid,
  public.product_draft_image_storage_reconciliation_status,
  public.product_draft_image_public_object_state,
  text,
  boolean,
  boolean,
  boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_product_draft_image_storage_reconciliation(
  text,
  text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_legacy_product_draft_public_object_keys(
  text,
  integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_product_draft_image_storage_scan_object(
  text,
  uuid,
  text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_product_draft_image_storage_cutover_scan_progress(
  text,
  uuid,
  public.product_draft_image_storage_cutover_scan_phase,
  text,
  text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_product_draft_image_storage_cutover_scan_phase(
  text,
  uuid,
  public.product_draft_image_storage_cutover_scan_phase,
  public.product_draft_image_storage_cutover_scan_phase
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_product_draft_image_storage_cutover(
  text,
  uuid,
  text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_product_draft_image_storage_cutover(
  text,
  uuid
) TO service_role;
