BEGIN;

DROP FUNCTION public.claim_product_draft_description_generation(uuid, uuid);
DROP FUNCTION public.finalize_product_draft_description_generation(
  uuid, uuid, uuid, uuid, integer, jsonb, text, text, text, text, timestamptz
);

CREATE FUNCTION public.claim_product_draft_description_generation(
  p_product_draft_id uuid,
  p_expected_seller_id uuid
)
RETURNS TABLE (
  result text,
  attempt_token uuid,
  category_id uuid,
  category_slug text,
  category_name text,
  facts_revision integer,
  facts_json jsonb,
  human_languages text[],
  title_blank boolean,
  cover_source text,
  cover_image_id uuid,
  cover_image_url text,
  cover_storage_bucket text,
  cover_object_key text,
  cover_content_type text,
  cover_size_bytes bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_category public.categories%ROWTYPE;
  selected_facts public.product_draft_facts%ROWTYPE;
  selected_attempt public.product_draft_description_generation_attempts%ROWTYPE;
  selected_cover public.product_draft_images%ROWTYPE;
  imported_product boolean;
  next_token uuid;
BEGIN
  IF p_product_draft_id IS NULL OR p_expected_seller_id IS NULL THEN
    RAISE EXCEPTION 'product_description_generation_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND product.seller_id = p_expected_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    result := 'not_found';
    RETURN NEXT;
    RETURN;
  END IF;

  IF selected_product.status <> 'draft' THEN
    result := 'not_editable';
    RETURN NEXT;
    RETURN;
  END IF;

  IF selected_product.category_id IS NULL THEN
    result := 'category_missing';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT category.*
  INTO selected_category
  FROM public.categories AS category
  WHERE category.id = selected_product.category_id;

  IF NOT FOUND THEN
    result := 'category_missing';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT facts.*
  INTO selected_facts
  FROM public.product_draft_facts AS facts
  WHERE facts.product_draft_id = selected_product.id
  FOR UPDATE;

  IF NOT FOUND
    OR selected_facts.facts_revision < 1
    OR NOT public.is_valid_product_draft_facts_v2(selected_facts.facts_json)
  THEN
    result := 'facts_missing';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.product_draft_source_memberships AS membership
    WHERE membership.product_draft_id = selected_product.id
  )
  INTO imported_product;

  IF selected_product.cover_image_id IS NOT NULL THEN
    SELECT image.*
    INTO selected_cover
    FROM public.product_draft_images AS image
    WHERE image.product_draft_id = selected_product.id
      AND image.id = selected_product.cover_image_id
    FOR UPDATE;

    IF NOT FOUND
      OR selected_cover.status <> 'available'
      OR selected_cover.storage_bucket <> 'product-draft-images'
      OR btrim(selected_cover.destination_key) = ''
      OR selected_cover.content_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
      OR selected_cover.size_bytes IS NULL
      OR selected_cover.size_bytes <= 0
    THEN
      result := 'cover_not_ready';
      RETURN NEXT;
      RETURN;
    END IF;

    cover_source := 'private_draft';
    cover_image_id := selected_cover.id;
    cover_image_url := NULL;
    cover_storage_bucket := selected_cover.storage_bucket;
    cover_object_key := selected_cover.destination_key;
    cover_content_type := selected_cover.content_type;
    cover_size_bytes := selected_cover.size_bytes;
  ELSIF imported_product THEN
    result := 'cover_missing';
    RETURN NEXT;
    RETURN;
  ELSIF selected_product.cover_image_url IS NULL
    OR btrim(selected_product.cover_image_url) = ''
  THEN
    result := 'cover_missing';
    RETURN NEXT;
    RETURN;
  ELSE
    cover_source := 'public_product_upload';
    cover_image_id := NULL;
    cover_image_url := selected_product.cover_image_url;
    cover_storage_bucket := NULL;
    cover_object_key := NULL;
    cover_content_type := NULL;
    cover_size_bytes := NULL;
  END IF;

  PERFORM 1
  FROM public.product_draft_descriptions AS description
  WHERE description.product_draft_id = selected_product.id
  ORDER BY description.language
  FOR UPDATE;

  SELECT COALESCE(
    array_agg(description.language ORDER BY description.language),
    ARRAY[]::text[]
  )
  INTO human_languages
  FROM public.product_draft_descriptions AS description
  WHERE description.product_draft_id = selected_product.id
    AND description.source = 'human';

  title_blank :=
    btrim(regexp_replace(selected_product.title, '[[:space:]]+', ' ', 'g')) = '';

  IF cardinality(human_languages) = 4 AND NOT title_blank THEN
    result := 'no_writable_targets';
    attempt_token := NULL;
    category_id := NULL;
    category_slug := NULL;
    category_name := NULL;
    facts_revision := NULL;
    facts_json := NULL;
    human_languages := NULL;
    title_blank := NULL;
    cover_source := NULL;
    cover_image_id := NULL;
    cover_image_url := NULL;
    cover_storage_bucket := NULL;
    cover_object_key := NULL;
    cover_content_type := NULL;
    cover_size_bytes := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT attempt.*
  INTO selected_attempt
  FROM public.product_draft_description_generation_attempts AS attempt
  WHERE attempt.product_draft_id = selected_product.id
  FOR UPDATE;

  IF FOUND
    AND selected_attempt.status = 'running'
    AND selected_attempt.claim_started_at > now() - interval '180 seconds'
  THEN
    result := 'in_progress';
    attempt_token := NULL;
    category_id := NULL;
    category_slug := NULL;
    category_name := NULL;
    facts_revision := NULL;
    facts_json := NULL;
    human_languages := NULL;
    title_blank := NULL;
    cover_source := NULL;
    cover_image_id := NULL;
    cover_image_url := NULL;
    cover_storage_bucket := NULL;
    cover_object_key := NULL;
    cover_content_type := NULL;
    cover_size_bytes := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  next_token := gen_random_uuid();

  INSERT INTO public.product_draft_description_generation_attempts AS attempt (
    product_draft_id,
    status,
    attempt_count,
    attempt_token,
    claim_started_at,
    finished_at,
    error_code
  )
  VALUES (
    selected_product.id,
    'running',
    1,
    next_token,
    now(),
    NULL,
    NULL
  )
  ON CONFLICT (product_draft_id) DO UPDATE
  SET
    status = 'running',
    attempt_count = attempt.attempt_count + 1,
    attempt_token = EXCLUDED.attempt_token,
    claim_started_at = EXCLUDED.claim_started_at,
    finished_at = NULL,
    error_code = NULL;

  result := 'claimed';
  attempt_token := next_token;
  category_id := selected_category.id;
  category_slug := selected_category.slug;
  category_name := selected_category.name;
  facts_revision := selected_facts.facts_revision;
  facts_json := selected_facts.facts_json;
  RETURN NEXT;
END;
$$;

CREATE FUNCTION public.finalize_product_draft_description_generation(
  p_product_draft_id uuid,
  p_expected_seller_id uuid,
  p_attempt_token uuid,
  p_expected_category_id uuid,
  p_expected_facts_revision integer,
  p_expected_cover_source text,
  p_expected_cover_image_id uuid,
  p_expected_cover_image_url text,
  p_expected_cover_storage_bucket text,
  p_expected_cover_object_key text,
  p_expected_cover_content_type text,
  p_expected_cover_size_bytes bigint,
  p_descriptions jsonb,
  p_title_proposal text,
  p_provider text,
  p_model text,
  p_pipeline_version text,
  p_generated_at timestamptz
)
RETURNS TABLE (
  result text,
  description_snapshot jsonb,
  title_snapshot jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_facts public.product_draft_facts%ROWTYPE;
  selected_attempt public.product_draft_description_generation_attempts%ROWTYPE;
  selected_cover public.product_draft_images%ROWTYPE;
  imported_product boolean;
  cover_changed boolean := false;
  language_code text;
  generated_description text;
  normalized_title_proposal text;
BEGIN
  IF p_product_draft_id IS NULL
    OR p_expected_seller_id IS NULL
    OR p_attempt_token IS NULL
    OR p_expected_category_id IS NULL
    OR p_expected_facts_revision IS NULL
    OR p_expected_facts_revision < 1
    OR p_expected_cover_source NOT IN ('private_draft', 'public_product_upload')
    OR (
      p_expected_cover_source = 'private_draft'
      AND (
        p_expected_cover_image_id IS NULL
        OR p_expected_cover_image_url IS NOT NULL
        OR p_expected_cover_storage_bucket <> 'product-draft-images'
        OR p_expected_cover_object_key IS NULL
        OR btrim(p_expected_cover_object_key) = ''
        OR p_expected_cover_content_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
        OR p_expected_cover_size_bytes IS NULL
        OR p_expected_cover_size_bytes <= 0
      )
    )
    OR (
      p_expected_cover_source = 'public_product_upload'
      AND (
        p_expected_cover_image_id IS NOT NULL
        OR p_expected_cover_image_url IS NULL
        OR btrim(p_expected_cover_image_url) = ''
        OR p_expected_cover_storage_bucket IS NOT NULL
        OR p_expected_cover_object_key IS NOT NULL
        OR p_expected_cover_content_type IS NOT NULL
        OR p_expected_cover_size_bytes IS NOT NULL
      )
    )
  THEN
    RAISE EXCEPTION 'product_description_generation_output_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND product.seller_id = p_expected_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  SELECT facts.*
  INTO selected_facts
  FROM public.product_draft_facts AS facts
  WHERE facts.product_draft_id = selected_product.id
  FOR UPDATE;

  PERFORM 1
  FROM public.product_draft_descriptions AS description
  WHERE description.product_draft_id = selected_product.id
  ORDER BY description.language
  FOR UPDATE;

  SELECT attempt.*
  INTO selected_attempt
  FROM public.product_draft_description_generation_attempts AS attempt
  WHERE attempt.product_draft_id = selected_product.id
  FOR UPDATE;

  IF NOT FOUND
    OR selected_attempt.status <> 'running'
    OR selected_attempt.attempt_token IS DISTINCT FROM p_attempt_token
    OR selected_attempt.claim_started_at <= now() - interval '180 seconds'
  THEN
    RETURN QUERY SELECT 'superseded'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF p_descriptions IS NULL
    OR jsonb_typeof(p_descriptions) <> 'object'
    OR ARRAY(
      SELECT key FROM jsonb_object_keys(p_descriptions) AS key ORDER BY key
    ) <> ARRAY['de', 'en', 'pl', 'vi']::text[]
    OR p_provider IS NULL OR btrim(p_provider) = ''
    OR p_model IS NULL OR btrim(p_model) = ''
    OR p_pipeline_version IS NULL OR btrim(p_pipeline_version) = ''
    OR p_generated_at IS NULL
  THEN
    RAISE EXCEPTION 'product_description_generation_output_invalid'
      USING ERRCODE = '22023';
  END IF;

  FOREACH language_code IN ARRAY ARRAY['pl', 'en', 'de', 'vi']
  LOOP
    IF jsonb_typeof(p_descriptions -> language_code) <> 'string' THEN
      RAISE EXCEPTION 'product_description_generation_output_invalid'
        USING ERRCODE = '22023';
    END IF;

    generated_description := p_descriptions ->> language_code;
    IF generated_description IS DISTINCT FROM
        public.normalize_product_draft_description(generated_description)
      OR generated_description = ''
      OR char_length(generated_description) > 2000
      OR position(E'\n' IN generated_description) > 0
      OR position(E'\r' IN generated_description) > 0
    THEN
      RAISE EXCEPTION 'product_description_generation_output_invalid'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF p_title_proposal IS NOT NULL THEN
    normalized_title_proposal := btrim(
      regexp_replace(p_title_proposal, '[[:space:]]+', ' ', 'g')
    );
    IF normalized_title_proposal = ''
      OR normalized_title_proposal IS DISTINCT FROM p_title_proposal
      OR char_length(normalized_title_proposal) > 120
    THEN
      RAISE EXCEPTION 'product_description_generation_output_invalid'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF selected_product.status <> 'draft' THEN
    UPDATE public.product_draft_description_generation_attempts AS attempt
    SET
      status = 'failed',
      attempt_token = NULL,
      claim_started_at = NULL,
      finished_at = now(),
      error_code = 'product_description_generation_not_editable'
    WHERE attempt.product_draft_id = selected_product.id;

    RETURN QUERY SELECT 'not_editable'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF selected_facts.product_draft_id IS NULL
    OR selected_facts.facts_revision < 1
    OR NOT public.is_valid_product_draft_facts_v2(selected_facts.facts_json)
  THEN
    UPDATE public.product_draft_description_generation_attempts AS attempt
    SET
      status = 'failed',
      attempt_token = NULL,
      claim_started_at = NULL,
      finished_at = now(),
      error_code = 'product_draft_facts_missing'
    WHERE attempt.product_draft_id = selected_product.id;

    RETURN QUERY SELECT 'facts_missing'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.product_draft_source_memberships AS membership
    WHERE membership.product_draft_id = selected_product.id
  )
  INTO imported_product;

  IF p_expected_cover_source = 'private_draft' THEN
    SELECT image.*
    INTO selected_cover
    FROM public.product_draft_images AS image
    WHERE image.product_draft_id = selected_product.id
      AND image.id = p_expected_cover_image_id
    FOR UPDATE;

    cover_changed :=
      NOT FOUND
      OR selected_product.cover_image_id IS DISTINCT FROM p_expected_cover_image_id
      OR selected_cover.status IS DISTINCT FROM 'available'::public.product_draft_image_status
      OR selected_cover.storage_bucket IS DISTINCT FROM p_expected_cover_storage_bucket
      OR selected_cover.destination_key IS DISTINCT FROM p_expected_cover_object_key
      OR selected_cover.content_type IS DISTINCT FROM p_expected_cover_content_type
      OR selected_cover.size_bytes IS DISTINCT FROM p_expected_cover_size_bytes;
  ELSE
    cover_changed :=
      imported_product
      OR selected_product.cover_image_id IS NOT NULL
      OR selected_product.cover_image_url IS DISTINCT FROM p_expected_cover_image_url;
  END IF;

  IF selected_product.category_id IS DISTINCT FROM p_expected_category_id
    OR selected_facts.facts_revision IS DISTINCT FROM p_expected_facts_revision
    OR cover_changed
  THEN
    UPDATE public.product_draft_description_generation_attempts AS attempt
    SET
      status = 'failed',
      attempt_token = NULL,
      claim_started_at = NULL,
      finished_at = now(),
      error_code = 'product_description_generation_input_changed'
    WHERE attempt.product_draft_id = selected_product.id;

    RETURN QUERY SELECT 'input_changed'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  IF p_title_proposal IS NOT NULL
    AND btrim(regexp_replace(selected_product.title, '[[:space:]]+', ' ', 'g')) = ''
  THEN
    UPDATE public.products AS product
    SET title = normalized_title_proposal, title_source = 'model'
    WHERE product.id = selected_product.id
    RETURNING product.* INTO selected_product;
  END IF;

  FOREACH language_code IN ARRAY ARRAY['pl', 'en', 'de', 'vi']
  LOOP
    generated_description := p_descriptions ->> language_code;

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
      selected_product.id,
      language_code,
      generated_description,
      'model',
      selected_facts.facts_revision,
      btrim(p_provider),
      btrim(p_model),
      btrim(p_pipeline_version),
      p_generated_at,
      false
    )
    ON CONFLICT ON CONSTRAINT product_draft_descriptions_pkey DO UPDATE
    SET
      description_text = EXCLUDED.description_text,
      source = EXCLUDED.source,
      facts_revision = EXCLUDED.facts_revision,
      provider = EXCLUDED.provider,
      model = EXCLUDED.model,
      pipeline_version = EXCLUDED.pipeline_version,
      generated_at = EXCLUDED.generated_at,
      backfilled_from_legacy = false
    WHERE description.source = 'model';
  END LOOP;

  UPDATE public.product_draft_description_generation_attempts AS attempt
  SET
    status = 'completed',
    attempt_token = NULL,
    claim_started_at = NULL,
    finished_at = now(),
    error_code = NULL
  WHERE attempt.product_draft_id = selected_product.id;

  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = selected_product.id;

  RETURN QUERY SELECT
    'completed'::text,
    public.product_draft_description_snapshot(
      selected_product.id,
      selected_product.status,
      selected_facts.facts_revision,
      selected_product.category_id
    ),
    jsonb_build_object(
      'productDraftId', selected_product.id,
      'title', selected_product.title,
      'titleSource', selected_product.title_source,
      'productStatus', selected_product.status,
      'editable', selected_product.status = 'draft'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_product_draft_description_generation(
  p_product_draft_id uuid,
  p_expected_seller_id uuid,
  p_attempt_token uuid,
  p_error_code text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product_id uuid;
  selected_attempt public.product_draft_description_generation_attempts%ROWTYPE;
BEGIN
  IF p_product_draft_id IS NULL
    OR p_expected_seller_id IS NULL
    OR p_attempt_token IS NULL
  THEN
    RAISE EXCEPTION 'product_description_generation_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT product.id
  INTO selected_product_id
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND product.seller_id = p_expected_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  SELECT attempt.*
  INTO selected_attempt
  FROM public.product_draft_description_generation_attempts AS attempt
  WHERE attempt.product_draft_id = selected_product_id
  FOR UPDATE;

  IF NOT FOUND
    OR selected_attempt.status <> 'running'
    OR selected_attempt.attempt_token IS DISTINCT FROM p_attempt_token
    OR selected_attempt.claim_started_at <= now() - interval '180 seconds'
  THEN
    RETURN 'superseded';
  END IF;

  IF p_error_code NOT IN (
    'product_description_generation_provider_failed',
    'product_description_generation_provider_timeout',
    'product_description_generation_output_invalid',
    'product_description_generation_configuration_invalid',
    'product_description_generation_cover_unsupported',
    'product_description_generation_cover_unavailable',
    'product_description_generation_image_not_usable'
  )
  THEN
    RAISE EXCEPTION 'product_description_generation_invalid'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.product_draft_description_generation_attempts AS attempt
  SET
    status = 'failed',
    attempt_token = NULL,
    claim_started_at = NULL,
    finished_at = now(),
    error_code = p_error_code
  WHERE attempt.product_draft_id = selected_product_id;

  RETURN 'failed';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_product_draft_description_generation(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_product_draft_description_generation(
  uuid, uuid, uuid, uuid, integer, text, uuid, text, text, text, text, bigint,
  jsonb, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_product_draft_description_generation(
  uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_product_draft_description_generation(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_product_draft_description_generation(
  uuid, uuid, uuid, uuid, integer, text, uuid, text, text, text, text, bigint,
  jsonb, text, text, text, text, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_product_draft_description_generation(
  uuid, uuid, uuid, text
) TO service_role;

COMMIT;
