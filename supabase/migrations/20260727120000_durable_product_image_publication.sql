BEGIN;

CREATE TABLE public.product_image_publication_runs (
  product_draft_id uuid PRIMARY KEY
    REFERENCES public.products(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  attempt_token uuid,
  claim_started_at timestamptz,
  error_code text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_image_publication_runs_status
    CHECK (status IN ('pending', 'running', 'failed', 'cleanup_required', 'completed')),
  CONSTRAINT product_image_publication_runs_attempt_count
    CHECK (attempt_count >= 0),
  CONSTRAINT product_image_publication_runs_state
    CHECK (
      (
        status = 'pending'
        AND attempt_token IS NULL
        AND claim_started_at IS NULL
        AND error_code IS NULL
        AND completed_at IS NULL
      )
      OR (
        status = 'running'
        AND attempt_token IS NOT NULL
        AND claim_started_at IS NOT NULL
        AND error_code IS NULL
        AND completed_at IS NULL
      )
      OR (
        status IN ('failed', 'cleanup_required')
        AND attempt_token IS NULL
        AND claim_started_at IS NULL
        AND length(btrim(error_code)) > 0
        AND completed_at IS NULL
      )
      OR (
        status = 'completed'
        AND attempt_token IS NULL
        AND claim_started_at IS NULL
        AND error_code IS NULL
        AND completed_at IS NOT NULL
      )
    )
);

CREATE TABLE public.product_image_publication_items (
  product_draft_id uuid NOT NULL,
  product_draft_image_id uuid NOT NULL,
  source_bucket text NOT NULL,
  source_object_key text NOT NULL,
  destination_key text NOT NULL,
  source_position integer NOT NULL,
  publication_order integer NOT NULL,
  is_cover boolean NOT NULL,
  expected_source_size_bytes bigint NOT NULL,
  expected_content_type text NOT NULL,
  source_sha256 text,
  status text NOT NULL DEFAULT 'pending',
  attempt_token uuid,
  public_size_bytes bigint,
  public_sha256 text,
  public_etag text,
  public_url text,
  object_created_by_attempt_token uuid,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_image_publication_items_pkey
    PRIMARY KEY (product_draft_id, product_draft_image_id),
  CONSTRAINT product_image_publication_items_run_fkey
    FOREIGN KEY (product_draft_id)
    REFERENCES public.product_image_publication_runs(product_draft_id)
    ON DELETE CASCADE,
  CONSTRAINT product_image_publication_items_source_fkey
    FOREIGN KEY (product_draft_id, product_draft_image_id)
    REFERENCES public.product_draft_images(product_draft_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT product_image_publication_items_source_unique
    UNIQUE (product_draft_image_id),
  CONSTRAINT product_image_publication_items_destination_unique
    UNIQUE (destination_key),
  CONSTRAINT product_image_publication_items_order_unique
    UNIQUE (product_draft_id, publication_order),
  CONSTRAINT product_image_publication_items_status
    CHECK (status IN ('pending', 'copying', 'verified', 'failed', 'cleanup_required', 'completed')),
  CONSTRAINT product_image_publication_items_source_fields
    CHECK (
      source_bucket = 'product-draft-images'
      AND length(btrim(source_object_key)) > 0
      AND length(btrim(destination_key)) > 0
      AND source_position >= 0
      AND publication_order >= 0
      AND expected_source_size_bytes > 0
      AND expected_content_type = 'image/jpeg'
    ),
  CONSTRAINT product_image_publication_items_digest_fields
    CHECK (
      (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$')
      AND (public_sha256 IS NULL OR public_sha256 ~ '^[0-9a-f]{64}$')
    ),
  CONSTRAINT product_image_publication_items_claim_fields
    CHECK (
      (status IN ('copying', 'verified') AND attempt_token IS NOT NULL)
      OR (status NOT IN ('copying', 'verified') AND attempt_token IS NULL)
    ),
  CONSTRAINT product_image_publication_items_verified_fields
    CHECK (
      status NOT IN ('verified', 'completed')
      OR (
        source_sha256 IS NOT NULL
        AND public_size_bytes = expected_source_size_bytes
        AND public_sha256 = source_sha256
        AND public_url IS NOT NULL
        AND length(btrim(public_url)) > 0
        AND error_code IS NULL
      )
    ),
  CONSTRAINT product_image_publication_items_failure_fields
    CHECK (
      status NOT IN ('failed', 'cleanup_required')
      OR (error_code IS NOT NULL AND length(btrim(error_code)) > 0)
    )
);

CREATE INDEX product_image_publication_runs_claim_idx
  ON public.product_image_publication_runs(status, claim_started_at);
CREATE INDEX product_image_publication_items_attempt_idx
  ON public.product_image_publication_items(product_draft_id, attempt_token, status);
CREATE UNIQUE INDEX product_image_publication_items_one_cover_idx
  ON public.product_image_publication_items(product_draft_id)
  WHERE is_cover;

CREATE FUNCTION public.enforce_product_image_publication_run_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.product_draft_id IS DISTINCT FROM OLD.product_draft_id
    OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'product_publication_invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.enforce_product_image_publication_item_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.product_draft_id IS DISTINCT FROM OLD.product_draft_id
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
    RAISE EXCEPTION 'product_publication_invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_product_image_publication_runs_00_immutable
  BEFORE UPDATE ON public.product_image_publication_runs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_image_publication_run_immutability();
CREATE TRIGGER trg_product_image_publication_runs_updated
  BEFORE UPDATE ON public.product_image_publication_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_product_image_publication_items_00_immutable
  BEFORE UPDATE ON public.product_image_publication_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_image_publication_item_immutability();
CREATE TRIGGER trg_product_image_publication_items_updated
  BEFORE UPDATE ON public.product_image_publication_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON public.product_image_publication_runs TO service_role;
GRANT ALL ON public.product_image_publication_items TO service_role;
ALTER TABLE public.product_image_publication_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_image_publication_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_images
  ADD COLUMN source_product_draft_image_id uuid
    REFERENCES public.product_draft_images(id) ON DELETE RESTRICT;

ALTER TABLE public.product_images
  ADD CONSTRAINT product_images_source_product_draft_image_unique
  UNIQUE (source_product_draft_image_id);

WITH normalized AS (
  SELECT
    image.id,
    row_number() OVER (
      PARTITION BY image.product_id
      ORDER BY image.sort_order, image.id
    ) - 1 AS normalized_sort_order
  FROM public.product_images AS image
)
UPDATE public.product_images AS image
SET sort_order = normalized.normalized_sort_order
FROM normalized
WHERE image.id = normalized.id
  AND image.sort_order IS DISTINCT FROM normalized.normalized_sort_order;

ALTER TABLE public.product_images
  ADD CONSTRAINT product_images_product_sort_order_unique
  UNIQUE (product_id, sort_order);

CREATE TABLE public.product_image_publication_cutover_changes (
  product_draft_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  previous_status public.product_status NOT NULL,
  previous_cover_image_url text,
  status_changed boolean NOT NULL,
  cover_changed boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.product_image_publication_cutover_changes TO service_role;
ALTER TABLE public.product_image_publication_cutover_changes ENABLE ROW LEVEL SECURITY;

INSERT INTO public.product_image_publication_cutover_changes (
  product_draft_id,
  previous_status,
  previous_cover_image_url,
  status_changed,
  cover_changed
)
SELECT
  product.id,
  product.status,
  product.cover_image_url,
  product.status = 'published',
  product.cover_image_url IS NOT NULL
FROM public.products AS product
WHERE EXISTS (
    SELECT 1
    FROM public.product_draft_source_memberships AS membership
    WHERE membership.product_draft_id = product.id
  )
  AND (
    product.status = 'published'
    OR (product.status = 'draft' AND product.cover_image_url IS NOT NULL)
  );

UPDATE public.products AS product
SET
  status = CASE
    WHEN product.status = 'published' THEN 'draft'::public.product_status
    ELSE product.status
  END,
  cover_image_url = NULL
WHERE EXISTS (
    SELECT 1
    FROM public.product_draft_source_memberships AS membership
    WHERE membership.product_draft_id = product.id
  )
  AND product.status IN ('draft', 'published')
  AND (product.status = 'published' OR product.cover_image_url IS NOT NULL);

REVOKE UPDATE ON public.products FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.product_images FROM authenticated;

DROP TRIGGER IF EXISTS trg_products_classifier_publishable ON public.products;
DROP FUNCTION IF EXISTS public.enforce_classifier_product_publishable();

DROP FUNCTION public.save_seller_product_with_description(
  uuid,
  uuid,
  boolean,
  text,
  boolean,
  text,
  uuid,
  integer,
  text,
  numeric,
  text,
  public.stock_status,
  text,
  boolean,
  public.product_status
);

CREATE FUNCTION public.save_seller_product_with_description(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_title_patch_present boolean,
  p_title text,
  p_description_patch_present boolean,
  p_description text,
  p_category_id uuid,
  p_moq integer,
  p_pack_size text,
  p_price numeric,
  p_currency text,
  p_stock public.stock_status,
  p_cover_image_url_patch_present boolean,
  p_cover_image_url text,
  p_trending boolean,
  p_status public.product_status
)
RETURNS TABLE (
  result text,
  product_draft_id uuid,
  title text,
  title_source text,
  product_status public.product_status,
  english_description text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_facts public.product_draft_facts%ROWTYPE;
  normalized_title text;
  normalized_description text;
  saved_product public.products%ROWTYPE;
  action_result text;
  imported_product boolean := false;
  effective_status public.product_status;
BEGIN
  IF p_product_draft_id IS NULL AND NOT COALESCE(p_title_patch_present, false) THEN
    RAISE EXCEPTION 'product_draft_title_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF p_product_draft_id IS NULL
    AND p_status NOT IN ('draft', 'published')
  THEN
    RAISE EXCEPTION 'product_draft_title_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF COALESCE(p_title_patch_present, false) THEN
    normalized_title := btrim(regexp_replace(COALESCE(p_title, ''), '[[:space:]]+', ' ', 'g'));
  END IF;

  IF p_product_draft_id IS NULL THEN
    IF p_status = 'published'
      AND (
        NOT COALESCE(p_cover_image_url_patch_present, false)
        OR NULLIF(btrim(COALESCE(p_cover_image_url, '')), '') IS NULL
      )
    THEN
      RAISE EXCEPTION 'product_publication_not_allowed'
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.products (
      seller_id,
      category_id,
      title,
      title_source,
      description,
      moq,
      pack_size,
      price,
      currency,
      stock,
      status,
      cover_image_url,
      trending
    )
    VALUES (
      p_seller_id,
      p_category_id,
      normalized_title,
      CASE WHEN normalized_title = '' THEN NULL ELSE 'human' END,
      NULL,
      p_moq,
      p_pack_size,
      p_price,
      p_currency,
      p_stock,
      'draft',
      CASE
        WHEN COALESCE(p_cover_image_url_patch_present, false) THEN p_cover_image_url
        ELSE NULL
      END,
      p_trending
    )
    RETURNING * INTO selected_product;
    action_result := 'created';
    effective_status := p_status;
  ELSE
    SELECT product.*
    INTO selected_product
    FROM public.products AS product
    WHERE product.id = p_product_draft_id
      AND product.seller_id = p_seller_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT
        'not_found'::text,
        NULL::uuid,
        NULL::text,
        NULL::text,
        NULL::public.product_status,
        NULL::text;
      RETURN;
    END IF;

    imported_product := EXISTS (
      SELECT 1
      FROM public.product_draft_source_memberships AS membership
      WHERE membership.product_draft_id = selected_product.id
    );

    IF imported_product AND COALESCE(p_cover_image_url_patch_present, false) THEN
      RAISE EXCEPTION 'product_publication_not_allowed'
        USING ERRCODE = '23514';
    END IF;

    IF imported_product
      AND selected_product.status = 'draft'
      AND p_status = 'published'
    THEN
      RAISE EXCEPTION 'product_publication_not_allowed'
        USING ERRCODE = '23514';
    END IF;

    IF COALESCE(p_description_patch_present, false)
      AND selected_product.status <> 'draft'
    THEN
      RETURN QUERY SELECT
        'not_editable'::text,
        selected_product.id,
        NULL::text,
        NULL::text,
        selected_product.status,
        NULL::text;
      RETURN;
    END IF;

    effective_status := CASE
      WHEN selected_product.status IN ('published', 'archived') THEN selected_product.status
      ELSE p_status
    END;
    action_result := 'updated';
  END IF;

  SELECT facts.*
  INTO selected_facts
  FROM public.product_draft_facts AS facts
  WHERE facts.product_draft_id = selected_product.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'facts_missing'::text,
      selected_product.id,
      NULL::text,
      NULL::text,
      selected_product.status,
      NULL::text;
    RETURN;
  END IF;

  UPDATE public.products AS product
  SET
    category_id = p_category_id,
    title = CASE WHEN COALESCE(p_title_patch_present, false) THEN normalized_title ELSE product.title END,
    title_source = CASE
      WHEN NOT COALESCE(p_title_patch_present, false) THEN product.title_source
      WHEN normalized_title = '' THEN NULL
      ELSE 'human'
    END,
    moq = p_moq,
    pack_size = p_pack_size,
    price = p_price,
    currency = p_currency,
    stock = p_stock,
    status = effective_status,
    cover_image_url = CASE
      WHEN imported_product THEN product.cover_image_url
      WHEN COALESCE(p_cover_image_url_patch_present, false) THEN p_cover_image_url
      ELSE product.cover_image_url
    END,
    trending = p_trending
  WHERE product.id = selected_product.id
  RETURNING * INTO saved_product;

  IF COALESCE(p_description_patch_present, false) THEN
    normalized_description := public.normalize_product_draft_description(p_description);

    IF normalized_description IS NOT NULL
      AND char_length(normalized_description) > 8000
    THEN
      RAISE EXCEPTION 'product_draft_description_invalid'
        USING ERRCODE = '23514';
    END IF;

    IF normalized_description IS NULL OR normalized_description = '' THEN
      DELETE FROM public.product_draft_descriptions AS description
      WHERE description.product_draft_id = saved_product.id
        AND description.language = 'en';
    ELSE
      INSERT INTO public.product_draft_descriptions AS description (
        product_draft_id,
        language,
        description_text,
        source,
        facts_revision,
        provider,
        model,
        pipeline_version,
        generated_at,
        backfilled_from_legacy
      )
      VALUES (
        saved_product.id,
        'en',
        normalized_description,
        'human',
        selected_facts.facts_revision,
        NULL,
        NULL,
        NULL,
        NULL,
        false
      )
      ON CONFLICT ON CONSTRAINT product_draft_descriptions_pkey DO UPDATE
      SET
        description_text = EXCLUDED.description_text,
        source = EXCLUDED.source,
        facts_revision = EXCLUDED.facts_revision,
        provider = NULL,
        model = NULL,
        pipeline_version = NULL,
        generated_at = NULL,
        backfilled_from_legacy = false
      WHERE description.description_text IS DISTINCT FROM EXCLUDED.description_text
        OR description.source IS DISTINCT FROM EXCLUDED.source
        OR description.facts_revision IS DISTINCT FROM EXCLUDED.facts_revision
        OR description.provider IS NOT NULL
        OR description.model IS NOT NULL
        OR description.pipeline_version IS NOT NULL
        OR description.generated_at IS NOT NULL
        OR description.backfilled_from_legacy IS DISTINCT FROM false;
    END IF;
  END IF;

  SELECT product.*
  INTO saved_product
  FROM public.products AS product
  WHERE product.id = selected_product.id;

  RETURN QUERY SELECT
    action_result,
    saved_product.id,
    saved_product.title,
    saved_product.title_source,
    saved_product.status,
    saved_product.description;
END;
$$;

CREATE FUNCTION public.authorize_seller_product_publication(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_title_patch_present boolean,
  p_title text,
  p_description_patch_present boolean,
  p_description text,
  p_category_id uuid,
  p_moq integer,
  p_pack_size text,
  p_price numeric,
  p_currency text,
  p_stock public.stock_status,
  p_cover_image_url_patch_present boolean,
  p_cover_image_url text,
  p_trending boolean
)
RETURNS TABLE (
  result text,
  product_draft_id uuid,
  publication_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_run public.product_image_publication_runs%ROWTYPE;
  save_result record;
  image_count integer;
  cover_count integer;
BEGIN
  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND product.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF selected_product.status <> 'draft' THEN
    RETURN QUERY SELECT
      'not_allowed'::text,
      selected_product.id,
      NULL::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_draft_source_memberships AS membership
    WHERE membership.product_draft_id = selected_product.id
  ) THEN
    RETURN QUERY SELECT
      'direct_product'::text,
      selected_product.id,
      NULL::text;
    RETURN;
  END IF;

  IF COALESCE(p_cover_image_url_patch_present, false) THEN
    RETURN QUERY SELECT
      'cover_not_allowed'::text,
      selected_product.id,
      NULL::text;
    RETURN;
  END IF;

  SELECT run.*
  INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.product_draft_id = selected_product.id
  FOR UPDATE;

  IF FOUND AND selected_run.status IN ('pending', 'running') THEN
    RETURN QUERY SELECT
      'in_progress'::text,
      selected_product.id,
      selected_run.status;
    RETURN;
  END IF;

  IF FOUND AND (
    selected_run.status = 'cleanup_required'
    OR EXISTS (
      SELECT 1
      FROM public.product_image_publication_items AS item
      WHERE item.product_draft_id = selected_product.id
        AND item.object_created_by_attempt_token IS NOT NULL
    )
  ) THEN
    RETURN QUERY SELECT
      'not_allowed'::text,
      selected_product.id,
      selected_run.status;
    RETURN;
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE image.id = selected_product.cover_image_id)::integer
  INTO image_count, cover_count
  FROM public.product_draft_images AS image
  WHERE image.product_draft_id = selected_product.id;

  IF image_count = 0 THEN
    RETURN QUERY SELECT
      'image_required'::text,
      selected_product.id,
      NULL::text;
    RETURN;
  END IF;

  IF image_count > 20 OR selected_product.cover_image_id IS NULL OR cover_count <> 1 THEN
    RETURN QUERY SELECT
      'not_allowed'::text,
      selected_product.id,
      NULL::text;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_draft_images AS image
    WHERE image.product_draft_id = selected_product.id
      AND (
        image.status <> 'available'
        OR image.storage_bucket <> 'product-draft-images'
        OR image.content_type <> 'image/jpeg'
        OR image.size_bytes IS NULL
        OR image.size_bytes <= 0
      )
  ) THEN
    RETURN QUERY SELECT
      'images_not_ready'::text,
      selected_product.id,
      NULL::text;
    RETURN;
  END IF;

  SELECT *
  INTO save_result
  FROM public.save_seller_product_with_description(
    selected_product.id,
    p_seller_id,
    p_title_patch_present,
    p_title,
    p_description_patch_present,
    p_description,
    p_category_id,
    p_moq,
    p_pack_size,
    p_price,
    p_currency,
    p_stock,
    false,
    NULL,
    p_trending,
    'draft'
  );

  IF save_result.result <> 'updated' THEN
    RETURN QUERY SELECT
      save_result.result::text,
      selected_product.id,
      NULL::text;
    RETURN;
  END IF;

  DELETE FROM public.product_image_publication_items AS item
  WHERE item.product_draft_id = selected_product.id;

  INSERT INTO public.product_image_publication_runs AS run (
    product_draft_id,
    seller_id,
    status,
    attempt_count,
    attempt_token,
    claim_started_at,
    error_code,
    completed_at
  )
  VALUES (
    selected_product.id,
    p_seller_id,
    'pending',
    COALESCE(selected_run.attempt_count, 0),
    NULL,
    NULL,
    NULL,
    NULL
  )
  ON CONFLICT ON CONSTRAINT product_image_publication_runs_pkey DO UPDATE
  SET
    seller_id = EXCLUDED.seller_id,
    status = 'pending',
    attempt_token = NULL,
    claim_started_at = NULL,
    error_code = NULL,
    completed_at = NULL;

  INSERT INTO public.product_image_publication_items (
    product_draft_id,
    product_draft_image_id,
    source_bucket,
    source_object_key,
    destination_key,
    source_position,
    publication_order,
    is_cover,
    expected_source_size_bytes,
    expected_content_type
  )
  SELECT
    selected_product.id,
    image.id,
    image.storage_bucket,
    image.destination_key,
    'published-products/' || selected_product.id::text || '/' || image.id::text || '.jpg',
    image.source_position,
    row_number() OVER (ORDER BY image.source_position, image.id) - 1,
    image.id = selected_product.cover_image_id,
    image.size_bytes,
    image.content_type
  FROM public.product_draft_images AS image
  WHERE image.product_draft_id = selected_product.id
  ORDER BY image.source_position, image.id;

  RETURN QUERY SELECT
    'pending'::text,
    selected_product.id,
    'pending'::text;
END;
$$;

CREATE FUNCTION public.claim_product_image_publication(
  p_product_draft_id uuid,
  p_claim_timeout_seconds integer
)
RETURNS SETOF public.product_image_publication_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed_run public.product_image_publication_runs%ROWTYPE;
BEGIN
  IF p_claim_timeout_seconds <= 0 THEN
    RAISE EXCEPTION 'product_publication_invalid'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.product_image_publication_runs AS run
  SET
    status = 'running',
    attempt_count = run.attempt_count + 1,
    attempt_token = gen_random_uuid(),
    claim_started_at = now(),
    error_code = NULL,
    completed_at = NULL
  WHERE run.product_draft_id = p_product_draft_id
    AND (
      run.status = 'pending'
      OR (
        run.status = 'running'
        AND run.claim_started_at
          < now() - make_interval(secs => p_claim_timeout_seconds)
      )
    )
  RETURNING run.* INTO claimed_run;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.product_image_publication_items AS item
  SET
    status = 'copying',
    attempt_token = claimed_run.attempt_token,
    error_code = NULL
  WHERE item.product_draft_id = claimed_run.product_draft_id
    AND item.status <> 'completed';

  RETURN NEXT claimed_run;
END;
$$;

CREATE FUNCTION public.record_product_image_publication_object_created(
  p_product_draft_id uuid,
  p_product_draft_image_id uuid,
  p_attempt_token uuid,
  p_source_sha256 text,
  p_public_url text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_source_sha256 !~ '^[0-9a-f]{64}$'
    OR NULLIF(btrim(p_public_url), '') IS NULL
  THEN
    RAISE EXCEPTION 'product_publication_invalid'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.product_image_publication_items AS item
  SET
    source_sha256 = p_source_sha256,
    public_size_bytes = item.expected_source_size_bytes,
    public_sha256 = p_source_sha256,
    public_url = p_public_url,
    object_created_by_attempt_token = p_attempt_token
  WHERE item.product_draft_id = p_product_draft_id
    AND item.product_draft_image_id = p_product_draft_image_id
    AND item.status = 'copying'
    AND item.attempt_token = p_attempt_token
    AND EXISTS (
      SELECT 1
      FROM public.product_image_publication_runs AS run
      WHERE run.product_draft_id = item.product_draft_id
        AND run.status = 'running'
        AND run.attempt_token = p_attempt_token
    );
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.verify_product_image_publication_item(
  p_product_draft_id uuid,
  p_product_draft_image_id uuid,
  p_attempt_token uuid,
  p_source_sha256 text,
  p_public_size_bytes bigint,
  p_public_sha256 text,
  p_public_etag text,
  p_public_url text,
  p_created_by_current_attempt boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_source_sha256 !~ '^[0-9a-f]{64}$'
    OR p_public_sha256 !~ '^[0-9a-f]{64}$'
    OR NULLIF(btrim(p_public_url), '') IS NULL
  THEN
    RAISE EXCEPTION 'product_publication_invalid'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.product_image_publication_items AS item
  SET
    status = 'verified',
    source_sha256 = p_source_sha256,
    public_size_bytes = p_public_size_bytes,
    public_sha256 = p_public_sha256,
    public_etag = p_public_etag,
    public_url = p_public_url,
    object_created_by_attempt_token = CASE
      WHEN p_created_by_current_attempt THEN p_attempt_token
      ELSE NULL
    END,
    error_code = NULL
  WHERE item.product_draft_id = p_product_draft_id
    AND item.product_draft_image_id = p_product_draft_image_id
    AND item.status = 'copying'
    AND item.attempt_token = p_attempt_token
    AND p_public_size_bytes = item.expected_source_size_bytes
    AND p_public_sha256 = p_source_sha256
    AND EXISTS (
      SELECT 1
      FROM public.product_image_publication_runs AS run
      WHERE run.product_draft_id = item.product_draft_id
        AND run.status = 'running'
        AND run.attempt_token = p_attempt_token
    );
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.clear_product_image_publication_object_ownership(
  p_product_draft_id uuid,
  p_product_draft_image_id uuid,
  p_attempt_token uuid,
  p_created_attempt_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.product_image_publication_items AS item
  SET object_created_by_attempt_token = NULL
  WHERE item.product_draft_id = p_product_draft_id
    AND item.product_draft_image_id = p_product_draft_image_id
    AND item.status = 'copying'
    AND item.attempt_token = p_attempt_token
    AND item.object_created_by_attempt_token = p_created_attempt_token
    AND EXISTS (
      SELECT 1
      FROM public.product_image_publication_runs AS run
      WHERE run.product_draft_id = item.product_draft_id
        AND run.status = 'running'
        AND run.attempt_token = p_attempt_token
    );
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.fail_product_image_publication_attempt(
  p_product_draft_id uuid,
  p_attempt_token uuid,
  p_product_draft_image_id uuid,
  p_error_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cleanup_needed boolean;
BEGIN
  IF NULLIF(btrim(p_error_code), '') IS NULL THEN
    RAISE EXCEPTION 'product_publication_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.product_image_publication_items AS item
    WHERE item.product_draft_id = p_product_draft_id
      AND item.object_created_by_attempt_token IS NOT NULL
  )
  INTO cleanup_needed;

  UPDATE public.product_image_publication_runs AS run
  SET
    status = CASE WHEN cleanup_needed THEN 'cleanup_required' ELSE 'failed' END,
    attempt_token = NULL,
    claim_started_at = NULL,
    error_code = CASE
      WHEN cleanup_needed THEN 'product_publication_cleanup_required'
      ELSE p_error_code
    END
  WHERE run.product_draft_id = p_product_draft_id
    AND run.status = 'running'
    AND run.attempt_token = p_attempt_token;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.product_image_publication_items AS item
  SET
    status = CASE
      WHEN item.object_created_by_attempt_token IS NOT NULL
        THEN 'cleanup_required'
      ELSE 'failed'
    END,
    attempt_token = NULL,
    error_code = CASE
      WHEN item.product_draft_image_id = p_product_draft_image_id
        THEN p_error_code
      ELSE 'product_publication_attempt_failed'
    END
  WHERE item.product_draft_id = p_product_draft_id
    AND item.attempt_token = p_attempt_token;

  RETURN true;
END;
$$;

CREATE FUNCTION public.complete_product_image_publication_cleanup(
  p_product_draft_id uuid,
  p_product_draft_image_id uuid,
  p_created_attempt_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.product_image_publication_items AS item
  SET
    status = 'failed',
    object_created_by_attempt_token = NULL
  WHERE item.product_draft_id = p_product_draft_id
    AND item.product_draft_image_id = p_product_draft_image_id
    AND item.status = 'cleanup_required'
    AND item.object_created_by_attempt_token = p_created_attempt_token;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.finalize_product_image_publication_cleanup(
  p_product_draft_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  terminal_error_code text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.product_image_publication_items AS item
    WHERE item.product_draft_id = p_product_draft_id
      AND (
        item.status = 'cleanup_required'
        OR item.object_created_by_attempt_token IS NOT NULL
      )
  ) THEN
    RETURN false;
  END IF;

  SELECT item.error_code
  INTO terminal_error_code
  FROM public.product_image_publication_items AS item
  WHERE item.product_draft_id = p_product_draft_id
    AND item.error_code IS NOT NULL
    AND item.error_code <> 'product_publication_attempt_failed'
  ORDER BY item.publication_order
  LIMIT 1;

  UPDATE public.product_image_publication_runs AS run
  SET
    status = 'failed',
    error_code = COALESCE(terminal_error_code, 'product_publication_transfer_failed')
  WHERE run.product_draft_id = p_product_draft_id
    AND run.status = 'cleanup_required';
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.mark_product_image_publication_dispatch_failed(
  p_product_draft_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.product_image_publication_runs AS run
  SET
    status = 'failed',
    error_code = 'product_publication_dispatch_failed'
  WHERE run.product_draft_id = p_product_draft_id
    AND run.status = 'pending';

  IF FOUND THEN
    UPDATE public.product_image_publication_items AS item
    SET
      status = 'failed',
      error_code = 'product_publication_dispatch_failed'
    WHERE item.product_draft_id = p_product_draft_id
      AND item.status = 'pending';
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE FUNCTION public.retry_product_image_publication(
  p_product_draft_id uuid,
  p_seller_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.product_image_publication_runs%ROWTYPE;
BEGIN
  SELECT run.*
  INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.product_draft_id = p_product_draft_id
    AND run.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF selected_run.status IN ('pending', 'running', 'completed') THEN
    RETURN 'noop';
  END IF;

  IF selected_run.status = 'cleanup_required'
    OR EXISTS (
      SELECT 1
      FROM public.product_image_publication_items AS item
      WHERE item.product_draft_id = p_product_draft_id
        AND item.status = 'cleanup_required'
    )
  THEN
    RETURN 'cleanup_required';
  END IF;

  IF selected_run.error_code NOT IN (
    'product_publication_dispatch_failed',
    'product_publication_source_unavailable',
    'product_publication_transfer_failed',
    'product_publication_verification_failed',
    'product_publication_finalization_failed'
  ) THEN
    RETURN 'not_allowed';
  END IF;

  IF NOT EXISTS (
      SELECT 1
      FROM public.products AS product
      WHERE product.id = p_product_draft_id
        AND product.seller_id = p_seller_id
        AND product.status = 'draft'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.product_image_publication_items AS item
      WHERE item.product_draft_id = p_product_draft_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.product_image_publication_items AS item
      LEFT JOIN public.product_draft_images AS image
        ON image.product_draft_id = item.product_draft_id
        AND image.id = item.product_draft_image_id
      LEFT JOIN public.products AS product
        ON product.id = item.product_draft_id
      WHERE item.product_draft_id = p_product_draft_id
        AND (
          image.id IS NULL
          OR image.status <> 'available'
          OR image.storage_bucket <> item.source_bucket
          OR image.destination_key <> item.source_object_key
          OR image.source_position <> item.source_position
          OR image.size_bytes <> item.expected_source_size_bytes
          OR image.content_type <> item.expected_content_type
          OR item.is_cover <> (image.id = product.cover_image_id)
        )
    )
    OR (
      SELECT count(*)
      FROM public.product_draft_images AS image
      WHERE image.product_draft_id = p_product_draft_id
    ) <> (
      SELECT count(*)
      FROM public.product_image_publication_items AS item
      WHERE item.product_draft_id = p_product_draft_id
    )
  THEN
    RETURN 'not_allowed';
  END IF;

  UPDATE public.product_image_publication_runs AS run
  SET
    status = 'pending',
    error_code = NULL
  WHERE run.product_draft_id = p_product_draft_id;

  UPDATE public.product_image_publication_items AS item
  SET
    status = 'pending',
    attempt_token = NULL,
    error_code = NULL
  WHERE item.product_draft_id = p_product_draft_id;

  RETURN 'requeued';
END;
$$;

CREATE FUNCTION public.enforce_product_image_publication()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  manifest_count integer;
  linked_count integer;
  completed_count integer;
  cover_url text;
BEGIN
  IF NEW.status = 'published'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published')
    AND EXISTS (
      SELECT 1
      FROM public.product_draft_source_memberships AS membership
      WHERE membership.product_draft_id = NEW.id
    )
  THEN
    SELECT
      count(*)::integer,
      count(*) FILTER (WHERE item.status = 'completed')::integer,
      max(item.public_url) FILTER (WHERE item.is_cover)
    INTO manifest_count, completed_count, cover_url
    FROM public.product_image_publication_items AS item
    WHERE item.product_draft_id = NEW.id;

    SELECT count(*)::integer
    INTO linked_count
    FROM public.product_images AS image
    JOIN public.product_image_publication_items AS item
      ON item.product_draft_id = NEW.id
      AND item.product_draft_image_id = image.source_product_draft_image_id
    WHERE image.product_id = NEW.id
      AND image.sort_order = item.publication_order
      AND image.url = item.public_url;

    IF manifest_count = 0
      OR completed_count <> manifest_count
      OR linked_count <> manifest_count
      OR cover_url IS NULL
      OR NEW.cover_image_url IS DISTINCT FROM cover_url
      OR NOT EXISTS (
        SELECT 1
        FROM public.product_image_publication_runs AS run
        WHERE run.product_draft_id = NEW.id
          AND run.seller_id = NEW.seller_id
          AND run.status = 'completed'
          AND run.completed_at IS NOT NULL
      )
      OR EXISTS (
        SELECT 1
        FROM public.product_images AS image
        WHERE image.product_id = NEW.id
          AND image.source_product_draft_image_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.product_image_publication_items AS item
            WHERE item.product_draft_id = NEW.id
              AND item.product_draft_image_id = image.source_product_draft_image_id
          )
      )
    THEN
      RAISE EXCEPTION 'product_publication_not_allowed'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.status = 'published'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published')
    AND NULLIF(btrim(COALESCE(NEW.cover_image_url, '')), '') IS NULL
  THEN
    RAISE EXCEPTION 'product_publication_not_allowed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_10_image_publication
  BEFORE INSERT OR UPDATE OF status, cover_image_url ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_image_publication();

CREATE FUNCTION public.finalize_seller_product_publication(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_attempt_token uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_run public.product_image_publication_runs%ROWTYPE;
  manifest_count integer;
  current_count integer;
  manual_ids uuid[];
  all_ids uuid[];
  maximum_sort integer;
  temporary_base bigint;
  manual_index integer;
  cover_url text;
BEGIN
  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND product.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  SELECT run.*
  INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.product_draft_id = p_product_draft_id
  FOR UPDATE;

  IF NOT FOUND
    OR selected_run.status <> 'running'
    OR selected_run.attempt_token IS DISTINCT FROM p_attempt_token
  THEN
    RETURN 'stale_attempt';
  END IF;

  IF selected_product.status <> 'draft' THEN
    RETURN 'not_allowed';
  END IF;

  PERFORM 1
  FROM public.product_image_publication_items AS item
  WHERE item.product_draft_id = p_product_draft_id
  ORDER BY item.publication_order
  FOR UPDATE;

  SELECT count(*)::integer
  INTO manifest_count
  FROM public.product_image_publication_items AS item
  WHERE item.product_draft_id = p_product_draft_id;

  IF manifest_count = 0
    OR EXISTS (
      SELECT 1
      FROM public.product_image_publication_items AS item
      WHERE item.product_draft_id = p_product_draft_id
        AND (
          item.status <> 'verified'
          OR item.attempt_token IS DISTINCT FROM p_attempt_token
          OR item.public_url IS NULL
        )
    )
  THEN
    RETURN 'not_allowed';
  END IF;

  SELECT count(*)::integer
  INTO current_count
  FROM public.product_draft_images AS image
  JOIN public.product_image_publication_items AS item
    ON item.product_draft_id = image.product_draft_id
    AND item.product_draft_image_id = image.id
    AND item.source_bucket = image.storage_bucket
    AND item.source_object_key = image.destination_key
    AND item.source_position = image.source_position
    AND item.expected_source_size_bytes = image.size_bytes
    AND item.expected_content_type = image.content_type
    AND item.is_cover = (image.id = selected_product.cover_image_id)
  WHERE image.product_draft_id = p_product_draft_id
    AND image.status = 'available';

  IF current_count <> manifest_count
    OR (
      SELECT count(*)
      FROM public.product_draft_images AS image
      WHERE image.product_draft_id = p_product_draft_id
    ) <> manifest_count
  THEN
    RETURN 'not_allowed';
  END IF;

  PERFORM 1
  FROM public.product_images AS image
  WHERE image.product_id = p_product_draft_id
  ORDER BY image.sort_order, image.id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.product_images AS image
    WHERE image.product_id = p_product_draft_id
      AND image.source_product_draft_image_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.product_image_publication_items AS item
        WHERE item.product_draft_id = p_product_draft_id
          AND item.product_draft_image_id = image.source_product_draft_image_id
      )
  ) THEN
    RETURN 'not_allowed';
  END IF;

  SELECT
    COALESCE(array_agg(image.id ORDER BY image.sort_order, image.id)
      FILTER (WHERE image.source_product_draft_image_id IS NULL), ARRAY[]::uuid[]),
    COALESCE(array_agg(image.id ORDER BY image.sort_order, image.id), ARRAY[]::uuid[]),
    COALESCE(max(image.sort_order), -1)
  INTO manual_ids, all_ids, maximum_sort
  FROM public.product_images AS image
  WHERE image.product_id = p_product_draft_id;

  temporary_base := greatest(
    maximum_sort::bigint + 1,
    manifest_count::bigint + cardinality(manual_ids)::bigint
  );

  IF temporary_base + cardinality(all_ids)::bigint > 2147483647 THEN
    RAISE EXCEPTION 'product_publication_finalization_failed'
      USING ERRCODE = '22003';
  END IF;

  UPDATE public.product_images AS image
  SET sort_order = (temporary_base + array_position(all_ids, image.id) - 1)::integer
  WHERE image.product_id = p_product_draft_id;

  INSERT INTO public.product_images AS image (
    product_id,
    url,
    sort_order,
    source_product_draft_image_id
  )
  SELECT
    item.product_draft_id,
    item.public_url,
    item.publication_order,
    item.product_draft_image_id
  FROM public.product_image_publication_items AS item
  WHERE item.product_draft_id = p_product_draft_id
  ORDER BY item.publication_order
  ON CONFLICT ON CONSTRAINT product_images_source_product_draft_image_unique DO UPDATE
  SET
    product_id = EXCLUDED.product_id,
    url = EXCLUDED.url,
    sort_order = EXCLUDED.sort_order;

  IF cardinality(manual_ids) > 0 THEN
    FOR manual_index IN 1..cardinality(manual_ids) LOOP
      UPDATE public.product_images AS image
      SET sort_order = manifest_count + manual_index - 1
      WHERE image.id = manual_ids[manual_index];
    END LOOP;
  END IF;

  SELECT item.public_url
  INTO cover_url
  FROM public.product_image_publication_items AS item
  WHERE item.product_draft_id = p_product_draft_id
    AND item.is_cover;

  UPDATE public.product_image_publication_items AS item
  SET
    status = 'completed',
    attempt_token = NULL,
    object_created_by_attempt_token = NULL,
    error_code = NULL
  WHERE item.product_draft_id = p_product_draft_id
    AND item.status = 'verified'
    AND item.attempt_token = p_attempt_token;

  IF FOUND THEN
    UPDATE public.product_image_publication_runs AS run
    SET
      status = 'completed',
      attempt_token = NULL,
      claim_started_at = NULL,
      error_code = NULL,
      completed_at = now()
    WHERE run.product_draft_id = p_product_draft_id
      AND run.status = 'running'
      AND run.attempt_token = p_attempt_token;
  END IF;

  IF NOT FOUND THEN
    RETURN 'stale_attempt';
  END IF;

  UPDATE public.products AS product
  SET
    cover_image_url = cover_url,
    status = 'published'
  WHERE product.id = p_product_draft_id
    AND product.status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_publication_finalization_failed'
      USING ERRCODE = '23514';
  END IF;

  RETURN 'completed';
END;
$$;

REVOKE ALL ON FUNCTION public.save_seller_product_with_description(
  uuid,
  uuid,
  boolean,
  text,
  boolean,
  text,
  uuid,
  integer,
  text,
  numeric,
  text,
  public.stock_status,
  boolean,
  text,
  boolean,
  public.product_status
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_product_image_publication_run_immutability()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_product_image_publication_item_immutability()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.authorize_seller_product_publication(
  uuid,
  uuid,
  boolean,
  text,
  boolean,
  text,
  uuid,
  integer,
  text,
  numeric,
  text,
  public.stock_status,
  boolean,
  text,
  boolean
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_product_image_publication(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_product_image_publication_object_created(
  uuid, uuid, uuid, text, text
)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_product_image_publication_item(
  uuid, uuid, uuid, text, bigint, text, text, text, boolean
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_product_image_publication_object_ownership(
  uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_product_image_publication_attempt(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_product_image_publication_cleanup(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_product_image_publication_cleanup(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_product_image_publication_dispatch_failed(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_product_image_publication(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_product_image_publication()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_seller_product_publication(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_seller_product_with_description(
  uuid,
  uuid,
  boolean,
  text,
  boolean,
  text,
  uuid,
  integer,
  text,
  numeric,
  text,
  public.stock_status,
  boolean,
  text,
  boolean,
  public.product_status
) TO service_role;
GRANT EXECUTE ON FUNCTION public.authorize_seller_product_publication(
  uuid,
  uuid,
  boolean,
  text,
  boolean,
  text,
  uuid,
  integer,
  text,
  numeric,
  text,
  public.stock_status,
  boolean,
  text,
  boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_product_image_publication(uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_product_image_publication_object_created(
  uuid, uuid, uuid, text, text
)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_product_image_publication_item(
  uuid, uuid, uuid, text, bigint, text, text, text, boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_product_image_publication_object_ownership(
  uuid, uuid, uuid, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_product_image_publication_attempt(uuid, uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_product_image_publication_cleanup(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_product_image_publication_cleanup(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_product_image_publication_dispatch_failed(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_product_image_publication(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_seller_product_publication(uuid, uuid, uuid)
  TO service_role;

COMMIT;
