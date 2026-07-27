CREATE TYPE public.product_draft_image_status AS ENUM (
  'pending',
  'available',
  'failed'
);

CREATE TYPE public.product_draft_image_promotion_status AS ENUM (
  'pending',
  'started',
  'promoted',
  'failed'
);

CREATE TABLE public.product_draft_source_memberships (
  product_draft_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  classifier_organization_id uuid NOT NULL,
  classifier_batch_id uuid NOT NULL,
  classifier_group_id uuid NOT NULL,
  classifier_image_id uuid NOT NULL,
  source_position integer NOT NULL,
  is_duplicate boolean NOT NULL,
  duplicate_of_classifier_image_id uuid,
  promotion_required boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_draft_source_memberships_pkey
    PRIMARY KEY (product_draft_id, classifier_image_id),
  CONSTRAINT product_draft_source_memberships_position_nonnegative
    CHECK (source_position >= 0),
  CONSTRAINT product_draft_source_memberships_promotion_required
    CHECK (promotion_required = NOT is_duplicate),
  CONSTRAINT product_draft_source_memberships_duplicate_fields
    CHECK (
      (is_duplicate AND duplicate_of_classifier_image_id IS NOT NULL)
      OR (NOT is_duplicate AND duplicate_of_classifier_image_id IS NULL)
    )
);

CREATE TABLE public.product_draft_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_draft_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  classifier_image_id uuid NOT NULL,
  source_position integer NOT NULL,
  status public.product_draft_image_status NOT NULL DEFAULT 'pending',
  destination_key text NOT NULL,
  content_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_draft_images_source_unique
    UNIQUE (product_draft_id, classifier_image_id),
  CONSTRAINT product_draft_images_destination_key_unique UNIQUE (destination_key),
  CONSTRAINT product_draft_images_draft_id_unique UNIQUE (product_draft_id, id),
  CONSTRAINT product_draft_images_position_nonnegative CHECK (source_position >= 0),
  CONSTRAINT product_draft_images_destination_key_nonblank
    CHECK (length(btrim(destination_key)) > 0),
  CONSTRAINT product_draft_images_size_positive
    CHECK (size_bytes IS NULL OR size_bytes > 0),
  CONSTRAINT product_draft_images_available_fields
    CHECK (
      (status = 'available' AND content_type = 'image/jpeg' AND size_bytes IS NOT NULL)
      OR (status <> 'available')
    )
);

ALTER TABLE public.products
  ADD COLUMN cover_image_id uuid;

ALTER TABLE public.products
  ADD CONSTRAINT products_cover_draft_image_fkey
  FOREIGN KEY (id, cover_image_id)
  REFERENCES public.product_draft_images(product_draft_id, id)
  ON DELETE SET NULL (cover_image_id);

CREATE TABLE public.product_draft_image_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_draft_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_draft_image_id uuid NOT NULL UNIQUE
    REFERENCES public.product_draft_images(id) ON DELETE CASCADE,
  classifier_organization_id uuid NOT NULL,
  classifier_batch_id uuid NOT NULL,
  classifier_group_id uuid NOT NULL,
  classifier_image_id uuid NOT NULL,
  is_source_cover boolean NOT NULL,
  status public.product_draft_image_promotion_status NOT NULL DEFAULT 'pending',
  source_content_length bigint,
  destination_size_bytes bigint,
  attempt_count integer NOT NULL DEFAULT 0,
  attempt_token uuid,
  claim_started_at timestamptz,
  last_attempt_at timestamptz,
  error_code text,
  retryable boolean NOT NULL DEFAULT false,
  promoted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_draft_image_promotions_source_unique
    UNIQUE (product_draft_id, classifier_image_id),
  CONSTRAINT product_draft_image_promotions_source_size_positive
    CHECK (source_content_length IS NULL OR source_content_length > 0),
  CONSTRAINT product_draft_image_promotions_destination_size_positive
    CHECK (destination_size_bytes IS NULL OR destination_size_bytes > 0),
  CONSTRAINT product_draft_image_promotions_attempt_count_nonnegative
    CHECK (attempt_count >= 0),
  CONSTRAINT product_draft_image_promotions_claim_fields
    CHECK (
      (status = 'started' AND attempt_token IS NOT NULL AND claim_started_at IS NOT NULL)
      OR (status <> 'started' AND attempt_token IS NULL AND claim_started_at IS NULL)
    ),
  CONSTRAINT product_draft_image_promotions_pending_fields
    CHECK (
      status <> 'pending'
      OR (
        error_code IS NULL
        AND NOT retryable
        AND destination_size_bytes IS NULL
        AND promoted_at IS NULL
      )
    ),
  CONSTRAINT product_draft_image_promotions_promoted_fields
    CHECK (
      status <> 'promoted'
      OR (
        source_content_length IS NOT NULL
        AND destination_size_bytes IS NOT NULL
        AND error_code IS NULL
        AND NOT retryable
        AND promoted_at IS NOT NULL
      )
    ),
  CONSTRAINT product_draft_image_promotions_failed_fields
    CHECK (
      status <> 'failed'
      OR (error_code IS NOT NULL AND length(btrim(error_code)) > 0)
    )
);

CREATE INDEX product_draft_source_memberships_source_idx
  ON public.product_draft_source_memberships (
    classifier_organization_id,
    classifier_batch_id,
    classifier_group_id
  );
CREATE INDEX product_draft_images_draft_position_idx
  ON public.product_draft_images (product_draft_id, source_position);
CREATE INDEX product_draft_image_promotions_source_idx
  ON public.product_draft_image_promotions (
    classifier_organization_id,
    classifier_batch_id,
    classifier_group_id
  );
CREATE INDEX product_draft_image_promotions_claim_idx
  ON public.product_draft_image_promotions (status, claim_started_at);

CREATE TRIGGER trg_product_draft_source_memberships_updated
  BEFORE UPDATE ON public.product_draft_source_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_product_draft_images_updated
  BEFORE UPDATE ON public.product_draft_images
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_product_draft_image_promotions_updated
  BEFORE UPDATE ON public.product_draft_image_promotions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON public.product_draft_source_memberships TO service_role;
GRANT ALL ON public.product_draft_images TO service_role;
GRANT ALL ON public.product_draft_image_promotions TO service_role;

ALTER TABLE public.product_draft_source_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_draft_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_draft_image_promotions ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.enforce_classifier_product_publishable()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published'
    AND NEW.classifier_organization_id IS NOT NULL
    AND (
      NEW.cover_image_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.classifier_import_group_outcomes AS outcome
        WHERE outcome.product_draft_id = NEW.id
          AND outcome.status = 'complete'
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.product_draft_image_promotions AS promotion
        WHERE promotion.product_draft_id = NEW.id
      )
      OR EXISTS (
        SELECT 1
        FROM public.product_draft_image_promotions AS promotion
        WHERE promotion.product_draft_id = NEW.id
          AND promotion.status <> 'promoted'
      )
    )
  THEN
    RAISE EXCEPTION 'classifier_product_draft_incomplete'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_classifier_publishable
  BEFORE INSERT OR UPDATE OF status ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_classifier_product_publishable();

CREATE FUNCTION public.prepare_classifier_import_group_images(
  p_import_id uuid,
  p_run_attempt_token uuid,
  p_classifier_group_id uuid,
  p_cover_classifier_image_id uuid,
  p_memberships jsonb
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
  selected_product_draft_id uuid;
  membership_count integer;
BEGIN
  SELECT *
  INTO selected_run
  FROM public.classifier_import_runs
  WHERE id = p_import_id
    AND status = 'running'
    AND attempt_token = p_run_attempt_token
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'claim_lost'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT outcome.product_draft_id
  INTO selected_product_draft_id
  FROM public.classifier_import_group_outcomes AS outcome
  WHERE outcome.classifier_import_run_id = p_import_id
    AND outcome.classifier_group_id = p_classifier_group_id;

  IF selected_product_draft_id IS NULL THEN
    RETURN QUERY SELECT 'group_not_prepared'::text, NULL::uuid;
    RETURN;
  END IF;

  IF jsonb_typeof(p_memberships) <> 'array' THEN
    RETURN QUERY SELECT 'source_membership_conflict'::text, selected_product_draft_id;
    RETURN;
  END IF;

  SELECT count(*)
  INTO membership_count
  FROM jsonb_to_recordset(p_memberships) AS membership(
    image_id uuid,
    source_position integer,
    is_duplicate boolean,
    duplicate_of_image_id uuid
  );

  IF membership_count = 0
    OR (
      SELECT count(*)
      FROM jsonb_to_recordset(p_memberships) AS membership(
        image_id uuid,
        source_position integer,
        is_duplicate boolean,
        duplicate_of_image_id uuid
      )
      WHERE membership.image_id = p_cover_classifier_image_id
        AND NOT membership.is_duplicate
    ) <> 1
    OR (
      SELECT count(DISTINCT membership.image_id)
      FROM jsonb_to_recordset(p_memberships) AS membership(
        image_id uuid,
        source_position integer,
        is_duplicate boolean,
        duplicate_of_image_id uuid
      )
    ) <> membership_count
    OR (
      SELECT count(DISTINCT membership.source_position)
      FROM jsonb_to_recordset(p_memberships) AS membership(
        image_id uuid,
        source_position integer,
        is_duplicate boolean,
        duplicate_of_image_id uuid
      )
    ) <> membership_count
  THEN
    RETURN QUERY SELECT 'source_membership_conflict'::text, selected_product_draft_id;
    RETURN;
  END IF;

  INSERT INTO public.product_draft_source_memberships (
    product_draft_id,
    classifier_organization_id,
    classifier_batch_id,
    classifier_group_id,
    classifier_image_id,
    source_position,
    is_duplicate,
    duplicate_of_classifier_image_id,
    promotion_required
  )
  SELECT
    selected_product_draft_id,
    selected_run.classifier_organization_id,
    selected_run.classifier_batch_id,
    p_classifier_group_id,
    membership.image_id,
    membership.source_position,
    membership.is_duplicate,
    membership.duplicate_of_image_id,
    NOT membership.is_duplicate
  FROM jsonb_to_recordset(p_memberships) AS membership(
    image_id uuid,
    source_position integer,
    is_duplicate boolean,
    duplicate_of_image_id uuid
  )
  ON CONFLICT ON CONSTRAINT product_draft_source_memberships_pkey DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_memberships) AS membership(
      image_id uuid,
      source_position integer,
      is_duplicate boolean,
      duplicate_of_image_id uuid
    )
    JOIN public.product_draft_source_memberships AS stored
      ON stored.product_draft_id = selected_product_draft_id
      AND stored.classifier_image_id = membership.image_id
    WHERE stored.classifier_organization_id <> selected_run.classifier_organization_id
      OR stored.classifier_batch_id <> selected_run.classifier_batch_id
      OR stored.classifier_group_id <> p_classifier_group_id
      OR stored.source_position <> membership.source_position
      OR stored.is_duplicate <> membership.is_duplicate
      OR stored.duplicate_of_classifier_image_id
        IS DISTINCT FROM membership.duplicate_of_image_id
      OR stored.promotion_required <> NOT membership.is_duplicate
  ) THEN
    RETURN QUERY SELECT 'source_membership_conflict'::text, selected_product_draft_id;
    RETURN;
  END IF;

  INSERT INTO public.product_draft_images (
    product_draft_id,
    classifier_image_id,
    source_position,
    destination_key
  )
  SELECT
    selected_product_draft_id,
    membership.image_id,
    membership.source_position,
    'product-drafts/' || selected_product_draft_id::text
      || '/images/' || membership.image_id::text || '.jpg'
  FROM jsonb_to_recordset(p_memberships) AS membership(
    image_id uuid,
    source_position integer,
    is_duplicate boolean,
    duplicate_of_image_id uuid
  )
  WHERE NOT membership.is_duplicate
  ON CONFLICT ON CONSTRAINT product_draft_images_source_unique DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_memberships) AS membership(
      image_id uuid,
      source_position integer,
      is_duplicate boolean,
      duplicate_of_image_id uuid
    )
    JOIN public.product_draft_images AS draft_image
      ON draft_image.product_draft_id = selected_product_draft_id
      AND draft_image.classifier_image_id = membership.image_id
    WHERE NOT membership.is_duplicate
      AND (
        draft_image.source_position <> membership.source_position
        OR draft_image.destination_key <> (
          'product-drafts/' || selected_product_draft_id::text
          || '/images/' || membership.image_id::text || '.jpg'
        )
      )
  ) THEN
    RETURN QUERY SELECT 'source_membership_conflict'::text, selected_product_draft_id;
    RETURN;
  END IF;

  INSERT INTO public.product_draft_image_promotions (
    product_draft_id,
    product_draft_image_id,
    classifier_organization_id,
    classifier_batch_id,
    classifier_group_id,
    classifier_image_id,
    is_source_cover
  )
  SELECT
    selected_product_draft_id,
    draft_image.id,
    selected_run.classifier_organization_id,
    selected_run.classifier_batch_id,
    p_classifier_group_id,
    draft_image.classifier_image_id,
    draft_image.classifier_image_id = p_cover_classifier_image_id
  FROM public.product_draft_images AS draft_image
  JOIN jsonb_to_recordset(p_memberships) AS membership(
    image_id uuid,
    source_position integer,
    is_duplicate boolean,
    duplicate_of_image_id uuid
  )
    ON membership.image_id = draft_image.classifier_image_id
  WHERE draft_image.product_draft_id = selected_product_draft_id
    AND NOT membership.is_duplicate
  ON CONFLICT ON CONSTRAINT product_draft_image_promotions_source_unique DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM public.product_draft_image_promotions AS promotion
    JOIN public.product_draft_images AS draft_image
      ON draft_image.id = promotion.product_draft_image_id
    WHERE promotion.product_draft_id = selected_product_draft_id
      AND (
        promotion.classifier_organization_id <> selected_run.classifier_organization_id
        OR promotion.classifier_batch_id <> selected_run.classifier_batch_id
        OR promotion.classifier_group_id <> p_classifier_group_id
        OR promotion.classifier_image_id <> draft_image.classifier_image_id
        OR promotion.is_source_cover
          <> (promotion.classifier_image_id = p_cover_classifier_image_id)
      )
  ) THEN
    RETURN QUERY SELECT 'source_membership_conflict'::text, selected_product_draft_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'prepared'::text, selected_product_draft_id;
END;
$$;

CREATE FUNCTION public.claim_classifier_image_promotion(
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
        OR (promotion.status = 'failed' AND promotion.retryable)
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

CREATE FUNCTION public.verify_classifier_image_promotion_claim(
  p_import_id uuid,
  p_run_attempt_token uuid,
  p_promotion_id uuid,
  p_promotion_attempt_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.classifier_import_runs AS run
  SET last_heartbeat_at = now()
  WHERE run.id = p_import_id
    AND run.status = 'running'
    AND run.attempt_token = p_run_attempt_token
    AND EXISTS (
      SELECT 1
      FROM public.product_draft_image_promotions AS promotion
      JOIN public.classifier_import_group_outcomes AS outcome
        ON outcome.classifier_import_run_id = run.id
        AND outcome.classifier_group_id = promotion.classifier_group_id
        AND outcome.product_draft_id = promotion.product_draft_id
      WHERE promotion.id = p_promotion_id
        AND promotion.status = 'started'
        AND promotion.attempt_token = p_promotion_attempt_token
    );

  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.set_classifier_image_promotion_source_length(
  p_import_id uuid,
  p_run_attempt_token uuid,
  p_promotion_id uuid,
  p_promotion_attempt_token uuid,
  p_source_content_length bigint
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_source_content_length <= 0 THEN
    RAISE EXCEPTION 'p_source_content_length must be positive';
  END IF;

  UPDATE public.product_draft_image_promotions AS promotion
  SET source_content_length = p_source_content_length
  WHERE promotion.id = p_promotion_id
    AND promotion.status = 'started'
    AND promotion.attempt_token = p_promotion_attempt_token
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
    );

  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.finalize_classifier_image_promotion_success(
  p_import_id uuid,
  p_run_attempt_token uuid,
  p_promotion_id uuid,
  p_promotion_attempt_token uuid,
  p_destination_size_bytes bigint
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  promoted_row public.product_draft_image_promotions%ROWTYPE;
BEGIN
  IF p_destination_size_bytes <= 0 THEN
    RAISE EXCEPTION 'p_destination_size_bytes must be positive';
  END IF;

  UPDATE public.product_draft_image_promotions AS promotion
  SET
    status = 'promoted',
    destination_size_bytes = p_destination_size_bytes,
    attempt_token = NULL,
    claim_started_at = NULL,
    error_code = NULL,
    retryable = false,
    promoted_at = now()
  WHERE promotion.id = p_promotion_id
    AND promotion.status = 'started'
    AND promotion.attempt_token = p_promotion_attempt_token
    AND promotion.source_content_length = p_destination_size_bytes
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
    )
  RETURNING promotion.*
  INTO promoted_row;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.product_draft_images
  SET
    status = 'available',
    content_type = 'image/jpeg',
    size_bytes = p_destination_size_bytes
  WHERE id = promoted_row.product_draft_image_id;

  IF promoted_row.is_source_cover THEN
    UPDATE public.products
    SET cover_image_id = promoted_row.product_draft_image_id
    WHERE id = promoted_row.product_draft_id
      AND cover_image_id IS NULL
      AND cover_image_url IS NULL;
  END IF;

  RETURN true;
END;
$$;

CREATE FUNCTION public.finalize_classifier_image_promotion_failure(
  p_import_id uuid,
  p_run_attempt_token uuid,
  p_promotion_id uuid,
  p_promotion_attempt_token uuid,
  p_error_code text,
  p_retryable boolean
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  failed_image_id uuid;
BEGIN
  IF p_error_code IS NULL OR length(btrim(p_error_code)) = 0 THEN
    RAISE EXCEPTION 'p_error_code must be nonblank';
  END IF;

  UPDATE public.product_draft_image_promotions AS promotion
  SET
    status = 'failed',
    destination_size_bytes = NULL,
    attempt_token = NULL,
    claim_started_at = NULL,
    error_code = p_error_code,
    retryable = p_retryable,
    promoted_at = NULL
  WHERE promotion.id = p_promotion_id
    AND promotion.status = 'started'
    AND promotion.attempt_token = p_promotion_attempt_token
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
    )
  RETURNING promotion.product_draft_image_id
  INTO failed_image_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.product_draft_images
  SET
    status = 'failed',
    content_type = NULL,
    size_bytes = NULL
  WHERE id = failed_image_id;

  RETURN true;
END;
$$;

CREATE FUNCTION public.reset_missing_classifier_image_promotion(
  p_import_id uuid,
  p_run_attempt_token uuid,
  p_promotion_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reset_image_id uuid;
BEGIN
  UPDATE public.product_draft_image_promotions AS promotion
  SET
    status = 'pending',
    destination_size_bytes = NULL,
    attempt_token = NULL,
    claim_started_at = NULL,
    error_code = NULL,
    retryable = false,
    promoted_at = NULL
  WHERE promotion.id = p_promotion_id
    AND promotion.status = 'promoted'
    AND EXISTS (
      SELECT 1
      FROM public.classifier_import_runs AS run
      WHERE run.id = p_import_id
        AND run.status = 'running'
        AND run.operation_kind = 'reconcile'
        AND run.attempt_token = p_run_attempt_token
        AND run.classifier_organization_id = promotion.classifier_organization_id
        AND run.classifier_batch_id = promotion.classifier_batch_id
    )
  RETURNING promotion.product_draft_image_id
  INTO reset_image_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.product_draft_images
  SET
    status = 'pending',
    content_type = NULL,
    size_bytes = NULL
  WHERE id = reset_image_id;

  RETURN true;
END;
$$;

CREATE FUNCTION public.mark_classifier_image_promotion_conflict(
  p_import_id uuid,
  p_run_attempt_token uuid,
  p_promotion_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  failed_image_id uuid;
BEGIN
  UPDATE public.product_draft_image_promotions AS promotion
  SET
    status = 'failed',
    destination_size_bytes = NULL,
    attempt_token = NULL,
    claim_started_at = NULL,
    error_code = 'destination_object_conflict',
    retryable = false,
    promoted_at = NULL
  WHERE promotion.id = p_promotion_id
    AND promotion.status = 'promoted'
    AND EXISTS (
      SELECT 1
      FROM public.classifier_import_runs AS run
      WHERE run.id = p_import_id
        AND run.status = 'running'
        AND run.operation_kind = 'reconcile'
        AND run.attempt_token = p_run_attempt_token
        AND run.classifier_organization_id = promotion.classifier_organization_id
        AND run.classifier_batch_id = promotion.classifier_batch_id
    )
  RETURNING promotion.product_draft_image_id
  INTO failed_image_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.product_draft_images
  SET
    status = 'failed',
    content_type = NULL,
    size_bytes = NULL
  WHERE id = failed_image_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.classifier_import_image_action_state(p_import_id uuid)
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
  SELECT
    EXISTS (
      SELECT 1
      FROM public.product_draft_image_promotions AS promotion
      JOIN public.classifier_import_runs AS run
        ON run.id = p_import_id
        AND run.classifier_organization_id = promotion.classifier_organization_id
        AND run.classifier_batch_id = promotion.classifier_batch_id
      WHERE promotion.status = 'failed'
        AND promotion.retryable
    ),
    EXISTS (
      SELECT 1
      FROM public.product_draft_image_promotions AS promotion
      JOIN public.classifier_import_runs AS run
        ON run.id = p_import_id
        AND run.classifier_organization_id = promotion.classifier_organization_id
        AND run.classifier_batch_id = promotion.classifier_batch_id
      WHERE promotion.status = 'failed'
    ),
    EXISTS (
      SELECT 1
      FROM public.product_draft_image_promotions AS promotion
      JOIN public.classifier_import_runs AS run
        ON run.id = p_import_id
        AND run.classifier_organization_id = promotion.classifier_organization_id
        AND run.classifier_batch_id = promotion.classifier_batch_id
      WHERE promotion.status = 'promoted'
    );
$$;

CREATE OR REPLACE FUNCTION public.classifier_import_reset_failed_promotions(
  p_import_id uuid,
  p_include_non_retryable boolean
)
RETURNS uuid[]
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_group_ids uuid[];
BEGIN
  WITH selected AS (
    SELECT promotion.id
    FROM public.product_draft_image_promotions AS promotion
    JOIN public.classifier_import_runs AS run
      ON run.id = p_import_id
      AND run.classifier_organization_id = promotion.classifier_organization_id
      AND run.classifier_batch_id = promotion.classifier_batch_id
    WHERE promotion.status = 'failed'
      AND (promotion.retryable OR p_include_non_retryable)
  ),
  reset_promotions AS (
    UPDATE public.product_draft_image_promotions AS promotion
    SET
      status = 'pending',
      source_content_length = NULL,
      destination_size_bytes = NULL,
      attempt_token = NULL,
      claim_started_at = NULL,
      error_code = NULL,
      retryable = false,
      promoted_at = NULL
    FROM selected
    WHERE promotion.id = selected.id
    RETURNING promotion.product_draft_image_id, promotion.classifier_group_id
  ),
  reset_images AS (
    UPDATE public.product_draft_images AS draft_image
    SET
      status = 'pending',
      content_type = NULL,
      size_bytes = NULL
    FROM reset_promotions
    WHERE draft_image.id = reset_promotions.product_draft_image_id
  )
  SELECT coalesce(array_agg(DISTINCT classifier_group_id), ARRAY[]::uuid[])
  INTO affected_group_ids
  FROM reset_promotions;

  RETURN affected_group_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_classifier_import_group_images(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_classifier_product_publishable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_classifier_image_promotion(
  uuid,
  uuid,
  uuid,
  integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_classifier_image_promotion_claim(
  uuid,
  uuid,
  uuid,
  uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_classifier_image_promotion_source_length(
  uuid,
  uuid,
  uuid,
  uuid,
  bigint
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_classifier_image_promotion_success(
  uuid,
  uuid,
  uuid,
  uuid,
  bigint
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_classifier_image_promotion_failure(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_missing_classifier_image_promotion(
  uuid,
  uuid,
  uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_classifier_image_promotion_conflict(
  uuid,
  uuid,
  uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.prepare_classifier_import_group_images(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_classifier_image_promotion(
  uuid,
  uuid,
  uuid,
  integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_classifier_image_promotion_claim(
  uuid,
  uuid,
  uuid,
  uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_classifier_image_promotion_source_length(
  uuid,
  uuid,
  uuid,
  uuid,
  bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_classifier_image_promotion_success(
  uuid,
  uuid,
  uuid,
  uuid,
  bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_classifier_image_promotion_failure(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_missing_classifier_image_promotion(
  uuid,
  uuid,
  uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_classifier_image_promotion_conflict(
  uuid,
  uuid,
  uuid
) TO service_role;
