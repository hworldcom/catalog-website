BEGIN;

CREATE FUNCTION public.claim_product_moderation_working_description_generation(
  p_product_id uuid,
  p_seller_id uuid,
  p_expected_revision bigint
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
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  selected_category public.categories%ROWTYPE;
  selected_cover public.product_draft_images%ROWTYPE;
  selected_attempt public.product_draft_description_generation_attempts%ROWTYPE;
  next_token uuid;
BEGIN
  selected_copy := public.assert_product_moderation_working_revision(
    p_product_id, p_seller_id, p_expected_revision
  );
  facts_revision := (selected_copy.snapshot_json #>> '{facts,factsRevision}')::integer;
  facts_json := selected_copy.snapshot_json #> '{facts,facts}';
  IF facts_revision IS NULL OR facts_revision < 1
    OR NOT public.is_valid_product_draft_facts_v2(facts_json)
  THEN
    result := 'facts_missing';
    RETURN NEXT;
    RETURN;
  END IF;

  category_id := (selected_copy.snapshot_json ->> 'categoryId')::uuid;
  IF category_id IS NOT NULL THEN
    SELECT category.* INTO selected_category
    FROM public.categories AS category WHERE category.id = category_id;
    IF NOT FOUND THEN
      result := 'category_missing';
      RETURN NEXT;
      RETURN;
    END IF;
    category_slug := selected_category.slug;
    category_name := selected_category.name;
  END IF;

  cover_image_id := (selected_copy.snapshot_json ->> 'coverImageId')::uuid;
  IF cover_image_id IS NULL THEN
    result := 'cover_missing';
    RETURN NEXT;
    RETURN;
  END IF;
  SELECT image.* INTO selected_cover
  FROM public.product_draft_images AS image
  JOIN public.product_moderation_working_copy_images AS membership
    ON membership.product_id = image.product_draft_id
   AND membership.product_draft_image_id = image.id
   AND membership.is_cover
  WHERE image.product_draft_id = p_product_id
    AND image.id = cover_image_id;
  IF NOT FOUND OR selected_cover.status <> 'available'
    OR selected_cover.storage_bucket <> 'product-draft-images'
    OR selected_cover.content_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
    OR selected_cover.size_bytes IS NULL OR selected_cover.size_bytes <= 0
  THEN
    result := 'cover_not_ready';
    RETURN NEXT;
    RETURN;
  END IF;
  cover_source := 'private_draft';
  cover_image_url := NULL;
  cover_storage_bucket := selected_cover.storage_bucket;
  cover_object_key := selected_cover.destination_key;
  cover_content_type := selected_cover.content_type;
  cover_size_bytes := selected_cover.size_bytes;

  SELECT COALESCE(array_agg(entry.value ->> 'language' ORDER BY entry.value ->> 'language'), ARRAY[]::text[])
  INTO human_languages
  FROM jsonb_array_elements(
    COALESCE(selected_copy.snapshot_json -> 'descriptions', '[]'::jsonb)
  ) AS entry(value)
  WHERE entry.value ->> 'source' = 'human';
  title_blank := btrim(regexp_replace(
    COALESCE(selected_copy.snapshot_json ->> 'title', ''), '[[:space:]]+', ' ', 'g'
  )) = '';
  IF cardinality(human_languages) = 4 AND NOT title_blank THEN
    result := 'no_writable_targets';
    attempt_token := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT attempt.* INTO selected_attempt
  FROM public.product_draft_description_generation_attempts AS attempt
  WHERE attempt.product_draft_id = p_product_id
  FOR UPDATE;
  IF FOUND AND selected_attempt.status = 'running'
    AND selected_attempt.claim_started_at > now() - interval '180 seconds'
  THEN
    result := 'in_progress';
    attempt_token := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  next_token := gen_random_uuid();
  INSERT INTO public.product_draft_description_generation_attempts AS attempt (
    product_draft_id, status, attempt_count, attempt_token, claim_started_at,
    finished_at, error_code, claimed_moderation_revision
  ) VALUES (
    p_product_id, 'running', 1, next_token, now(), NULL, NULL, selected_copy.revision
  )
  ON CONFLICT (product_draft_id) DO UPDATE SET
    status = 'running',
    attempt_count = attempt.attempt_count + 1,
    attempt_token = EXCLUDED.attempt_token,
    claim_started_at = EXCLUDED.claim_started_at,
    finished_at = NULL,
    error_code = NULL,
    claimed_moderation_revision = EXCLUDED.claimed_moderation_revision;
  result := 'claimed';
  attempt_token := next_token;
  RETURN NEXT;
END;
$$;

CREATE FUNCTION public.finalize_product_moderation_working_description_generation(
  p_product_id uuid,
  p_seller_id uuid,
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
RETURNS TABLE(result text, description_snapshot jsonb, title_snapshot jsonb)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  selected_attempt public.product_draft_description_generation_attempts%ROWTYPE;
  selected_cover public.product_draft_images%ROWTYPE;
  next_snapshot jsonb;
  next_descriptions jsonb := '[]'::jsonb;
  current_description jsonb;
  description_entry jsonb;
  language_code text;
  generated_description text;
  normalized_title text;
BEGIN
  IF p_attempt_token IS NULL OR p_expected_facts_revision IS NULL
    OR p_expected_facts_revision < 1
    OR p_expected_cover_source <> 'private_draft'
    OR p_expected_cover_image_id IS NULL
    OR p_expected_cover_image_url IS NOT NULL
    OR p_expected_cover_storage_bucket <> 'product-draft-images'
    OR p_expected_cover_object_key IS NULL OR btrim(p_expected_cover_object_key) = ''
    OR p_expected_cover_content_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
    OR p_expected_cover_size_bytes IS NULL OR p_expected_cover_size_bytes <= 0
    OR p_descriptions IS NULL OR jsonb_typeof(p_descriptions) <> 'object'
    OR ARRAY(SELECT key FROM jsonb_object_keys(p_descriptions) AS key ORDER BY key)
      <> ARRAY['de', 'en', 'pl', 'vi']::text[]
    OR p_provider IS NULL OR btrim(p_provider) = ''
    OR p_model IS NULL OR btrim(p_model) = ''
    OR p_pipeline_version IS NULL OR btrim(p_pipeline_version) = ''
    OR p_generated_at IS NULL
  THEN
    RAISE EXCEPTION 'product_description_generation_output_invalid' USING ERRCODE = '22023';
  END IF;
  FOREACH language_code IN ARRAY ARRAY['pl', 'en', 'de', 'vi'] LOOP
    generated_description := p_descriptions ->> language_code;
    IF jsonb_typeof(p_descriptions -> language_code) <> 'string'
      OR generated_description IS DISTINCT FROM
        public.normalize_product_draft_description(generated_description)
      OR generated_description = '' OR char_length(generated_description) > 300
      OR position(E'\n' IN generated_description) > 0
      OR position(E'\r' IN generated_description) > 0
    THEN
      RAISE EXCEPTION 'product_description_generation_output_invalid' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_title_proposal IS NOT NULL THEN
    normalized_title := btrim(regexp_replace(p_title_proposal, '[[:space:]]+', ' ', 'g'));
    IF normalized_title = '' OR normalized_title IS DISTINCT FROM p_title_proposal
      OR char_length(normalized_title) > 50
    THEN
      RAISE EXCEPTION 'product_description_generation_output_invalid' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id AND product.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;
  SELECT attempt.* INTO selected_attempt
  FROM public.product_draft_description_generation_attempts AS attempt
  WHERE attempt.product_draft_id = p_product_id
  FOR UPDATE;
  IF NOT FOUND OR selected_attempt.status <> 'running'
    OR selected_attempt.attempt_token IS DISTINCT FROM p_attempt_token
    OR selected_attempt.claim_started_at <= now() - interval '180 seconds'
  THEN
    RETURN QUERY SELECT 'superseded'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;
  SELECT working_copy.* INTO selected_copy
  FROM public.product_moderation_working_copies AS working_copy
  WHERE working_copy.product_id = p_product_id
  FOR UPDATE;
  IF NOT FOUND OR selected_product.status NOT IN ('published', 'archived')
    OR selected_product.active_moderation_submission_id IS NOT NULL
    OR selected_attempt.claimed_moderation_revision IS DISTINCT FROM selected_copy.revision
  THEN
    UPDATE public.product_draft_description_generation_attempts AS attempt
    SET status = 'failed', attempt_token = NULL, claim_started_at = NULL,
      finished_at = now(), error_code = 'product_description_generation_input_changed'
    WHERE attempt.product_draft_id = p_product_id;
    RETURN QUERY SELECT 'input_changed'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  SELECT image.* INTO selected_cover
  FROM public.product_draft_images AS image
  JOIN public.product_moderation_working_copy_images AS membership
    ON membership.product_id = image.product_draft_id
   AND membership.product_draft_image_id = image.id
   AND membership.is_cover
  WHERE image.product_draft_id = p_product_id
    AND image.id = p_expected_cover_image_id;
  IF (selected_copy.snapshot_json ->> 'categoryId')::uuid
      IS DISTINCT FROM p_expected_category_id
    OR (selected_copy.snapshot_json #>> '{facts,factsRevision}')::integer
      IS DISTINCT FROM p_expected_facts_revision
    OR (selected_copy.snapshot_json ->> 'coverImageId')::uuid
      IS DISTINCT FROM p_expected_cover_image_id
    OR NOT FOUND OR selected_cover.status <> 'available'
    OR selected_cover.storage_bucket IS DISTINCT FROM p_expected_cover_storage_bucket
    OR selected_cover.destination_key IS DISTINCT FROM p_expected_cover_object_key
    OR selected_cover.content_type IS DISTINCT FROM p_expected_cover_content_type
    OR selected_cover.size_bytes IS DISTINCT FROM p_expected_cover_size_bytes
  THEN
    UPDATE public.product_draft_description_generation_attempts AS attempt
    SET status = 'failed', attempt_token = NULL, claim_started_at = NULL,
      finished_at = now(), error_code = 'product_description_generation_input_changed'
    WHERE attempt.product_draft_id = p_product_id;
    RETURN QUERY SELECT 'input_changed'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  FOREACH language_code IN ARRAY ARRAY['pl', 'en', 'de', 'vi'] LOOP
    SELECT entry.value INTO current_description
    FROM jsonb_array_elements(
      COALESCE(selected_copy.snapshot_json -> 'descriptions', '[]'::jsonb)
    ) AS entry(value)
    WHERE entry.value ->> 'language' = language_code
    LIMIT 1;
    IF current_description ->> 'source' = 'human' THEN
      description_entry := current_description;
    ELSE
      description_entry := jsonb_build_object(
        'language', language_code,
        'descriptionText', p_descriptions ->> language_code,
        'source', 'model',
        'factsRevision', p_expected_facts_revision,
        'provider', btrim(p_provider),
        'model', btrim(p_model),
        'pipelineVersion', btrim(p_pipeline_version),
        'generatedAt', p_generated_at,
        'updatedAt', now()
      );
    END IF;
    next_descriptions := next_descriptions || jsonb_build_array(description_entry);
  END LOOP;
  next_snapshot := jsonb_set(
    selected_copy.snapshot_json, '{descriptions}', next_descriptions, true
  );
  IF p_title_proposal IS NOT NULL
    AND btrim(regexp_replace(COALESCE(next_snapshot ->> 'title', ''), '[[:space:]]+', ' ', 'g')) = ''
  THEN
    next_snapshot := jsonb_set(next_snapshot, '{title}', to_jsonb(normalized_title), true);
    next_snapshot := jsonb_set(next_snapshot, '{titleSource}', '"model"'::jsonb, true);
  END IF;
  UPDATE public.product_moderation_working_copies AS working_copy
  SET snapshot_json = next_snapshot, revision = revision + 1, updated_at = now()
  WHERE working_copy.product_id = p_product_id
  RETURNING * INTO selected_copy;
  UPDATE public.product_draft_description_generation_attempts AS attempt
  SET status = 'completed', attempt_token = NULL, claim_started_at = NULL,
    finished_at = now(), error_code = NULL
  WHERE attempt.product_draft_id = p_product_id;

  RETURN QUERY SELECT
    'completed'::text,
    public.product_moderation_working_description_snapshot(
      p_product_id, selected_product.status, selected_copy.snapshot_json
    ) || jsonb_build_object('moderationRevision', selected_copy.revision),
    jsonb_build_object(
      'productDraftId', p_product_id,
      'moderationRevision', selected_copy.revision,
      'title', selected_copy.snapshot_json ->> 'title',
      'titleSource', selected_copy.snapshot_json ->> 'titleSource',
      'productStatus', selected_product.status,
      'editable', true
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_product_moderation_working_description_generation(
  uuid, uuid, bigint
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_product_moderation_working_description_generation(
  uuid, uuid, uuid, uuid, integer, text, uuid, text, text, text, text, bigint,
  jsonb, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_product_moderation_working_description_generation(
  uuid, uuid, bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_product_moderation_working_description_generation(
  uuid, uuid, uuid, uuid, integer, text, uuid, text, text, text, text, bigint,
  jsonb, text, text, text, text, timestamptz
) TO service_role;

COMMIT;
