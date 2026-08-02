BEGIN;

CREATE TABLE public.product_draft_description_generation_attempts (
  product_draft_id uuid PRIMARY KEY
    REFERENCES public.products(id) ON DELETE CASCADE,
  status text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  attempt_token uuid,
  claim_started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_draft_description_generation_attempts_status_check
    CHECK (status IN ('running', 'completed', 'failed')),
  CONSTRAINT product_draft_description_generation_attempts_shape_check
    CHECK (
      (
        status = 'running'
        AND attempt_token IS NOT NULL
        AND claim_started_at IS NOT NULL
        AND finished_at IS NULL
        AND error_code IS NULL
      )
      OR (
        status = 'completed'
        AND attempt_token IS NULL
        AND claim_started_at IS NULL
        AND finished_at IS NOT NULL
        AND error_code IS NULL
      )
      OR (
        status = 'failed'
        AND attempt_token IS NULL
        AND claim_started_at IS NULL
        AND finished_at IS NOT NULL
        AND error_code IS NOT NULL
        AND btrim(error_code) <> ''
      )
    )
);

REVOKE ALL ON public.product_draft_description_generation_attempts
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.product_draft_description_generation_attempts TO service_role;

ALTER TABLE public.product_draft_description_generation_attempts
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_product_draft_description_generation_attempts_updated
  BEFORE UPDATE ON public.product_draft_description_generation_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.is_valid_product_draft_facts_v2(p_facts jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  item jsonb;
  source_value jsonb;
  field_name text;
BEGIN
  IF p_facts IS NULL
    OR jsonb_typeof(p_facts) <> 'object'
    OR ARRAY(
      SELECT key
      FROM jsonb_object_keys(p_facts) AS key
      ORDER BY key
    ) <> ARRAY[
      'colors',
      'fieldSources',
      'materialComposition',
      'schemaVersion',
      'uncertainFields'
    ]::text[]
    OR p_facts -> 'schemaVersion' <> '2'::jsonb
  THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(p_facts -> 'colors') <> 'array'
    OR jsonb_array_length(p_facts -> 'colors') > 10
  THEN
    RETURN false;
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_facts -> 'colors')
  LOOP
    IF jsonb_typeof(item) <> 'string'
      OR char_length(btrim(item #>> '{}')) NOT BETWEEN 1 AND 120
    THEN
      RETURN false;
    END IF;
  END LOOP;

  item := p_facts -> 'materialComposition';
  IF item <> 'null'::jsonb
    AND (
      jsonb_typeof(item) <> 'string'
      OR char_length(btrim(item #>> '{}')) NOT BETWEEN 1 AND 120
    )
  THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(p_facts -> 'uncertainFields') <> 'array'
    OR jsonb_array_length(p_facts -> 'uncertainFields') > 2
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_facts -> 'uncertainFields') AS entry(value)
      WHERE jsonb_typeof(entry.value) <> 'string'
        OR entry.value #>> '{}' NOT IN ('colors', 'materialComposition')
    )
    OR (
      SELECT count(*) <> count(DISTINCT entry.value)
      FROM jsonb_array_elements_text(p_facts -> 'uncertainFields') AS entry(value)
    )
  THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(p_facts -> 'fieldSources') <> 'object'
    OR ARRAY(
      SELECT key
      FROM jsonb_object_keys(p_facts -> 'fieldSources') AS key
      ORDER BY key
    ) <> ARRAY['colors', 'materialComposition']::text[]
  THEN
    RETURN false;
  END IF;

  FOREACH field_name IN ARRAY ARRAY['colors', 'materialComposition']
  LOOP
    source_value := p_facts -> 'fieldSources' -> field_name;
    IF source_value <> 'null'::jsonb
      AND (
        jsonb_typeof(source_value) <> 'string'
        OR source_value #>> '{}' NOT IN ('human', 'model')
      )
    THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

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
  title_blank boolean
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
  next_token uuid;
  current_human_languages text[];
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
    RETURN QUERY SELECT
      'not_found'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
      NULL::integer, NULL::jsonb, NULL::text[], NULL::boolean;
    RETURN;
  END IF;

  IF selected_product.status <> 'draft' THEN
    RETURN QUERY SELECT
      'not_editable'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
      NULL::integer, NULL::jsonb, NULL::text[], NULL::boolean;
    RETURN;
  END IF;

  IF selected_product.category_id IS NULL THEN
    RETURN QUERY SELECT
      'category_missing'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
      NULL::integer, NULL::jsonb, NULL::text[], NULL::boolean;
    RETURN;
  END IF;

  SELECT category.*
  INTO selected_category
  FROM public.categories AS category
  WHERE category.id = selected_product.category_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'category_missing'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
      NULL::integer, NULL::jsonb, NULL::text[], NULL::boolean;
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
    RETURN QUERY SELECT
      'facts_missing'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
      NULL::integer, NULL::jsonb, NULL::text[], NULL::boolean;
    RETURN;
  END IF;

  PERFORM 1
  FROM public.product_draft_descriptions AS description
  WHERE description.product_draft_id = selected_product.id
  ORDER BY description.language
  FOR UPDATE;

  SELECT COALESCE(array_agg(description.language ORDER BY description.language), ARRAY[]::text[])
  INTO current_human_languages
  FROM public.product_draft_descriptions AS description
  WHERE description.product_draft_id = selected_product.id
    AND description.source = 'human';

  IF cardinality(current_human_languages) = 4
    AND btrim(regexp_replace(selected_product.title, '[[:space:]]+', ' ', 'g')) <> ''
  THEN
    RETURN QUERY SELECT
      'no_writable_targets'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
      NULL::integer, NULL::jsonb, NULL::text[], NULL::boolean;
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
    RETURN QUERY SELECT
      'in_progress'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
      NULL::integer, NULL::jsonb, NULL::text[], NULL::boolean;
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

  RETURN QUERY SELECT
    'claimed'::text,
    next_token,
    selected_category.id,
    selected_category.slug,
    selected_category.name,
    selected_facts.facts_revision,
    selected_facts.facts_json,
    current_human_languages,
    btrim(regexp_replace(selected_product.title, '[[:space:]]+', ' ', 'g')) = '';
END;
$$;

CREATE FUNCTION public.finalize_product_draft_description_generation(
  p_product_draft_id uuid,
  p_expected_seller_id uuid,
  p_attempt_token uuid,
  p_expected_category_id uuid,
  p_expected_facts_revision integer,
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

  IF selected_product.category_id IS DISTINCT FROM p_expected_category_id
    OR selected_facts.facts_revision IS DISTINCT FROM p_expected_facts_revision
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

CREATE FUNCTION public.fail_product_draft_description_generation(
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
    'product_description_generation_configuration_invalid'
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

REVOKE ALL ON FUNCTION public.is_valid_product_draft_facts_v2(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_product_draft_description_generation(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_product_draft_description_generation(
  uuid, uuid, uuid, uuid, integer, jsonb, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_product_draft_description_generation(
  uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_product_draft_description_generation(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_product_draft_description_generation(
  uuid, uuid, uuid, uuid, integer, jsonb, text, text, text, text, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_product_draft_description_generation(
  uuid, uuid, uuid, text
) TO service_role;

COMMIT;
