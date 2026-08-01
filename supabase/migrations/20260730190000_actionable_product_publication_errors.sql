BEGIN;

CREATE FUNCTION public.validate_product_publication_title(
  p_title text
)
RETURNS TABLE (
  result text,
  normalized_title text
)
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH normalized AS (
    SELECT btrim(
      regexp_replace(COALESCE(p_title, ''), '[[:space:]]+', ' ', 'g')
    ) AS title
  )
  SELECT
    CASE
      WHEN title = '' THEN 'title_required'
      WHEN char_length(title) > 120 THEN 'title_invalid'
      ELSE 'valid'
    END,
    title
  FROM normalized;
$$;

CREATE OR REPLACE FUNCTION public.save_seller_product_with_description(
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
  title_validation_result text;
BEGIN
  IF p_product_draft_id IS NULL AND NOT COALESCE(p_title_patch_present, false) THEN
    IF p_status = 'published' THEN
      RETURN QUERY SELECT
        'title_required'::text,
        NULL::uuid,
        NULL::text,
        NULL::text,
        NULL::public.product_status,
        NULL::text;
      RETURN;
    END IF;

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
    IF p_status = 'published' THEN
      SELECT validation.result, validation.normalized_title
      INTO title_validation_result, normalized_title
      FROM public.validate_product_publication_title(p_title) AS validation;

      IF title_validation_result <> 'valid' THEN
        RETURN QUERY SELECT
          title_validation_result,
          NULL::uuid,
          normalized_title,
          NULL::text,
          NULL::public.product_status,
          NULL::text;
        RETURN;
      END IF;
    END IF;

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

    IF p_status = 'published'
      AND selected_product.status = 'draft'
      AND NOT imported_product
    THEN
      SELECT validation.result, validation.normalized_title
      INTO title_validation_result, normalized_title
      FROM public.validate_product_publication_title(
        CASE
          WHEN COALESCE(p_title_patch_present, false) THEN p_title
          ELSE selected_product.title
        END
      ) AS validation;

      IF title_validation_result <> 'valid' THEN
        RETURN QUERY SELECT
          title_validation_result,
          selected_product.id,
          normalized_title,
          selected_product.title_source,
          selected_product.status,
          selected_product.description;
        RETURN;
      END IF;
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

CREATE OR REPLACE FUNCTION public.authorize_seller_product_publication(
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
  title_validation_result text;
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

  SELECT validation.result
  INTO title_validation_result
  FROM public.validate_product_publication_title(
    CASE
      WHEN COALESCE(p_title_patch_present, false) THEN p_title
      ELSE selected_product.title
    END
  ) AS validation;

  IF title_validation_result <> 'valid' THEN
    RETURN QUERY SELECT
      title_validation_result,
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

CREATE OR REPLACE FUNCTION public.retry_product_image_publication(
  p_product_draft_id uuid,
  p_seller_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_run public.product_image_publication_runs%ROWTYPE;
  title_validation_result text;
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

  SELECT validation.result
  INTO title_validation_result
  FROM public.validate_product_publication_title(selected_product.title) AS validation;

  IF title_validation_result <> 'valid' THEN
    RETURN title_validation_result;
  END IF;

  IF selected_product.status <> 'draft'
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
      WHERE item.product_draft_id = p_product_draft_id
        AND (
          image.id IS NULL
          OR image.status <> 'available'
          OR image.storage_bucket <> item.source_bucket
          OR image.destination_key <> item.source_object_key
          OR image.source_position <> item.source_position
          OR image.size_bytes <> item.expected_source_size_bytes
          OR image.content_type <> item.expected_content_type
          OR item.is_cover <> (image.id = selected_product.cover_image_id)
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

REVOKE ALL ON FUNCTION public.validate_product_publication_title(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_product_publication_title(text)
  TO service_role;

COMMIT;
