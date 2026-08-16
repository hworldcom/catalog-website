BEGIN;

CREATE FUNCTION public.ensure_product_moderation_working_copy(
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

  INSERT INTO public.product_moderation_working_copies (
    product_id, seller_id, revision, snapshot_schema_version, snapshot_json
  ) VALUES (
    selected_product.id,
    selected_product.seller_id,
    next_revision,
    approved_submission.snapshot_schema_version,
    approved_submission.snapshot_json
  )
  RETURNING * INTO selected_copy;

  INSERT INTO public.product_moderation_working_copy_images (
    product_id, product_draft_image_id, position, is_cover
  )
  SELECT
    selected_product.id,
    image.product_draft_image_id,
    image.position,
    image.is_cover
  FROM public.product_moderation_submission_images AS image
  WHERE image.submission_id = approved_submission.id
  ORDER BY image.position;

  RETURN NEXT selected_copy;
END;
$$;

CREATE FUNCTION public.read_product_moderation_edit_state(
  p_product_id uuid,
  p_expected_seller_id uuid
)
RETURNS TABLE (
  product_id uuid,
  seller_id uuid,
  product_status public.product_status,
  revision bigint,
  editable boolean,
  working_copy boolean,
  snapshot_json jsonb
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_facts public.product_draft_facts%ROWTYPE;
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  audiences_json jsonb;
  descriptions_json jsonb;
  facts_json jsonb;
  image_ids_json jsonb;
  current_snapshot jsonb;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id
    AND (p_expected_seller_id IS NULL OR product.seller_id = p_expected_seller_id)
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF selected_product.status IN ('published', 'archived') THEN
    SELECT ensured.* INTO selected_copy
    FROM public.ensure_product_moderation_working_copy(
      selected_product.id,
      selected_product.seller_id
    ) AS ensured;
    RETURN QUERY SELECT
      selected_product.id,
      selected_product.seller_id,
      selected_product.status,
      selected_copy.revision,
      selected_product.active_moderation_submission_id IS NULL,
      true,
      selected_copy.snapshot_json;
    RETURN;
  END IF;

  SELECT COALESCE(jsonb_agg(audience.audience ORDER BY audience.audience), '[]'::jsonb)
  INTO audiences_json
  FROM public.product_audience_memberships AS audience
  WHERE audience.product_id = selected_product.id;

  SELECT facts.* INTO selected_facts
  FROM public.product_draft_facts AS facts
  WHERE facts.product_draft_id = selected_product.id;
  facts_json := CASE
    WHEN selected_facts.product_draft_id IS NULL THEN 'null'::jsonb
    ELSE jsonb_build_object(
      'factsRevision', selected_facts.facts_revision,
      'facts', selected_facts.facts_json
    )
  END;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'language', description.language,
        'descriptionText', description.description_text,
        'source', description.source,
        'factsRevision', description.facts_revision,
        'provider', description.provider,
        'model', description.model,
        'pipelineVersion', description.pipeline_version,
        'generatedAt', description.generated_at,
        'updatedAt', description.updated_at
      ) ORDER BY description.language
    ),
    '[]'::jsonb
  ) INTO descriptions_json
  FROM public.product_draft_descriptions AS description
  WHERE description.product_draft_id = selected_product.id;

  SELECT COALESCE(jsonb_agg(to_jsonb(image.id) ORDER BY image.source_position, image.id), '[]'::jsonb)
  INTO image_ids_json
  FROM public.product_draft_images AS image
  WHERE image.product_draft_id = selected_product.id
    AND image.status <> 'deleting';

  current_snapshot := jsonb_build_object(
    'schemaVersion', 1,
    'productId', selected_product.id,
    'sellerId', selected_product.seller_id,
    'productCode', selected_product.product_code,
    'productCodeInput', 'null'::jsonb,
    'title', selected_product.title,
    'titleSource', selected_product.title_source,
    'categoryId', selected_product.category_id,
    'audiences', audiences_json,
    'descriptions', descriptions_json,
    'facts', facts_json,
    'minimumOrder', selected_product.moq,
    'packSize', selected_product.pack_size,
    'price', selected_product.price,
    'currency', selected_product.currency,
    'stock', selected_product.stock,
    'imageIds', image_ids_json,
    'coverImageId', selected_product.cover_image_id
  );

  RETURN QUERY SELECT
    selected_product.id,
    selected_product.seller_id,
    selected_product.status,
    selected_product.moderation_revision,
    selected_product.active_moderation_submission_id IS NULL,
    false,
    current_snapshot;
END;
$$;

CREATE FUNCTION public.assert_product_moderation_working_revision(
  p_product_id uuid,
  p_expected_seller_id uuid,
  p_expected_revision bigint
)
RETURNS public.product_moderation_working_copies
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_copy public.product_moderation_working_copies%ROWTYPE;
BEGIN
  IF p_product_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id
    AND (p_expected_seller_id IS NULL OR product.seller_id = p_expected_seller_id)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF selected_product.status NOT IN ('published', 'archived')
    OR selected_product.approved_moderation_submission_id IS NULL
  THEN
    RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
  END IF;
  IF selected_product.active_moderation_submission_id IS NOT NULL THEN
    RAISE EXCEPTION 'product_moderation_submission_conflict' USING ERRCODE = '55000';
  END IF;

  SELECT working_copy.* INTO selected_copy
  FROM public.product_moderation_working_copies AS working_copy
  WHERE working_copy.product_id = selected_product.id
  FOR UPDATE;
  IF NOT FOUND THEN
    SELECT ensured.* INTO selected_copy
    FROM public.ensure_product_moderation_working_copy(
      selected_product.id,
      selected_product.seller_id
    ) AS ensured;
  END IF;
  IF selected_copy.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'product_moderation_working_revision_conflict' USING ERRCODE = '40001';
  END IF;
  RETURN selected_copy;
END;
$$;

CREATE FUNCTION public.product_moderation_snapshot_apply_description_patch(
  p_snapshot jsonb,
  p_current_facts_revision integer,
  p_pl_patch_present boolean,
  p_pl_description text,
  p_en_patch_present boolean,
  p_en_description text,
  p_de_patch_present boolean,
  p_de_description text,
  p_vi_patch_present boolean,
  p_vi_description text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  next_descriptions jsonb := COALESCE(p_snapshot -> 'descriptions', '[]'::jsonb);
  language_code text;
  patch_present boolean;
  patch_value text;
  normalized_value text;
  next_entry jsonb;
BEGIN
  IF p_current_facts_revision IS NULL OR p_current_facts_revision < 1 THEN
    RAISE EXCEPTION 'product_draft_facts_missing' USING ERRCODE = '55000';
  END IF;
  FOREACH language_code IN ARRAY ARRAY['pl', 'en', 'de', 'vi']
  LOOP
    patch_present := CASE language_code
      WHEN 'pl' THEN COALESCE(p_pl_patch_present, false)
      WHEN 'en' THEN COALESCE(p_en_patch_present, false)
      WHEN 'de' THEN COALESCE(p_de_patch_present, false)
      ELSE COALESCE(p_vi_patch_present, false)
    END;
    IF NOT patch_present THEN CONTINUE; END IF;
    patch_value := CASE language_code
      WHEN 'pl' THEN p_pl_description
      WHEN 'en' THEN p_en_description
      WHEN 'de' THEN p_de_description
      ELSE p_vi_description
    END;
    normalized_value := CASE
      WHEN patch_value IS NULL THEN NULL
      ELSE public.normalize_product_draft_description(patch_value)
    END;
    IF normalized_value IS NOT NULL AND (
      normalized_value = ''
      OR char_length(normalized_value) > 300
    ) THEN
      RAISE EXCEPTION 'product_draft_description_invalid' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(jsonb_agg(entry.value ORDER BY entry.ordinality), '[]'::jsonb)
    INTO next_descriptions
    FROM jsonb_array_elements(next_descriptions) WITH ORDINALITY AS entry(value, ordinality)
    WHERE entry.value ->> 'language' <> language_code;
    IF normalized_value IS NOT NULL AND normalized_value <> '' THEN
      next_entry := jsonb_build_object(
        'language', language_code,
        'descriptionText', normalized_value,
        'source', 'human',
        'factsRevision', p_current_facts_revision,
        'provider', NULL,
        'model', NULL,
        'pipelineVersion', NULL,
        'generatedAt', NULL,
        'updatedAt', now()
      );
      next_descriptions := next_descriptions || jsonb_build_array(next_entry);
    END IF;
  END LOOP;
  RETURN jsonb_set(p_snapshot, '{descriptions}', next_descriptions, true);
END;
$$;

CREATE FUNCTION public.save_product_moderation_working_copy(
  p_product_id uuid,
  p_seller_id uuid,
  p_expected_revision bigint,
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
  p_status public.product_status,
  p_audiences text[]
)
RETURNS TABLE(
  result text,
  product_draft_id uuid,
  title text,
  title_source text,
  product_status public.product_status,
  english_description text,
  moderation_revision bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  next_snapshot jsonb;
  normalized_title text;
  normalized_audiences text[];
  facts_revision integer;
BEGIN
  selected_copy := public.assert_product_moderation_working_revision(
    p_product_id, p_seller_id, p_expected_revision
  );
  SELECT product.* INTO selected_product
  FROM public.products AS product WHERE product.id = p_product_id;
  IF p_status IS DISTINCT FROM selected_product.status
    OR (COALESCE(p_cover_image_url_patch_present, false) AND p_cover_image_url IS NOT NULL)
  THEN
    RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
  END IF;
  IF p_title_patch_present THEN
    normalized_title := btrim(regexp_replace(COALESCE(p_title, ''), '[[:space:]]+', ' ', 'g'));
    IF char_length(normalized_title) > 50 THEN
      RAISE EXCEPTION 'product_draft_title_invalid' USING ERRCODE = '22023';
    END IF;
  ELSE
    normalized_title := selected_copy.snapshot_json ->> 'title';
  END IF;
  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories AS category WHERE category.id = p_category_id
  ) THEN
    RAISE EXCEPTION 'product_category_not_supported' USING ERRCODE = '22023';
  END IF;
  IF p_moq IS NOT NULL AND p_moq < 0
    OR p_price IS NOT NULL AND p_price < 0
    OR p_currency IS NULL OR char_length(btrim(p_currency)) NOT BETWEEN 3 AND 6
    OR p_pack_size IS NOT NULL AND char_length(p_pack_size) > 80
  THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;
  normalized_audiences := public.normalize_product_audience_set(COALESCE(p_audiences, ARRAY[]::text[]));

  next_snapshot := selected_copy.snapshot_json;
  next_snapshot := jsonb_set(next_snapshot, '{title}', to_jsonb(normalized_title), true);
  next_snapshot := jsonb_set(
    next_snapshot,
    '{titleSource}',
    CASE WHEN normalized_title = '' THEN 'null'::jsonb ELSE '"human"'::jsonb END,
    true
  );
  next_snapshot := jsonb_set(next_snapshot, '{categoryId}', COALESCE(to_jsonb(p_category_id), 'null'::jsonb), true);
  next_snapshot := jsonb_set(next_snapshot, '{audiences}', to_jsonb(normalized_audiences), true);
  next_snapshot := jsonb_set(next_snapshot, '{minimumOrder}', COALESCE(to_jsonb(p_moq), 'null'::jsonb), true);
  next_snapshot := jsonb_set(next_snapshot, '{packSize}', COALESCE(to_jsonb(p_pack_size), 'null'::jsonb), true);
  next_snapshot := jsonb_set(next_snapshot, '{price}', COALESCE(to_jsonb(p_price), 'null'::jsonb), true);
  next_snapshot := jsonb_set(next_snapshot, '{currency}', to_jsonb(btrim(p_currency)), true);
  next_snapshot := jsonb_set(next_snapshot, '{stock}', to_jsonb(p_stock::text), true);

  IF COALESCE(p_description_patch_present, false) THEN
    facts_revision := (next_snapshot #>> '{facts,factsRevision}')::integer;
    next_snapshot := public.product_moderation_snapshot_apply_description_patch(
      next_snapshot,
      facts_revision,
      false, NULL,
      true, p_description,
      false, NULL,
      false, NULL
    );
  END IF;

  IF next_snapshot IS DISTINCT FROM selected_copy.snapshot_json THEN
    UPDATE public.product_moderation_working_copies AS working_copy
    SET snapshot_json = next_snapshot, revision = revision + 1, updated_at = now()
    WHERE working_copy.product_id = selected_copy.product_id
    RETURNING * INTO selected_copy;
  END IF;

  RETURN QUERY SELECT
    'updated'::text,
    selected_copy.product_id,
    selected_copy.snapshot_json ->> 'title',
    selected_copy.snapshot_json ->> 'titleSource',
    selected_product.status,
    (
      SELECT entry.value ->> 'descriptionText'
      FROM jsonb_array_elements(selected_copy.snapshot_json -> 'descriptions') AS entry(value)
      WHERE entry.value ->> 'language' = 'en'
    ),
    selected_copy.revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_initial_product_draft_with_description(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_expected_moderation_revision bigint,
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
  p_status public.product_status,
  p_audiences text[]
)
RETURNS TABLE(
  result text,
  product_draft_id uuid,
  title text,
  title_source text,
  product_status public.product_status,
  english_description text,
  moderation_revision bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_status public.product_status;
  save_result record;
BEGIN
  IF p_product_draft_id IS NOT NULL THEN
    SELECT product.status INTO selected_status
    FROM public.products AS product
    WHERE product.id = p_product_draft_id AND product.seller_id = p_seller_id;
  END IF;
  IF selected_status IN ('published', 'archived') THEN
    RETURN QUERY SELECT operation.*
    FROM public.save_product_moderation_working_copy(
      p_product_draft_id,
      p_seller_id,
      p_expected_moderation_revision,
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
      p_cover_image_url_patch_present,
      p_cover_image_url,
      p_status,
      p_audiences
    ) AS operation;
    RETURN;
  END IF;

  IF p_product_draft_id IS NULL THEN
    IF p_expected_moderation_revision IS NOT NULL OR p_status <> 'draft' THEN
      RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
    END IF;
  ELSE
    PERFORM public.assert_initial_product_moderation_revision(
      p_product_draft_id, p_seller_id, p_expected_moderation_revision
    );
    IF p_status <> 'draft' THEN
      RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
    END IF;
  END IF;

  SELECT operation.* INTO save_result
  FROM public.save_seller_product_with_description(
    p_product_draft_id,
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
    p_cover_image_url_patch_present,
    p_cover_image_url,
    p_trending,
    p_status,
    p_audiences
  ) AS operation;

  RETURN QUERY SELECT
    save_result.result::text,
    save_result.product_draft_id::uuid,
    save_result.title::text,
    save_result.title_source::text,
    save_result.product_status::public.product_status,
    save_result.english_description::text,
    product.moderation_revision
  FROM public.products AS product
  WHERE product.id = save_result.product_draft_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_initial_product_draft_title(
  p_product_draft_id uuid,
  p_expected_seller_id uuid,
  p_expected_moderation_revision bigint,
  p_title text,
  p_title_source text
)
RETURNS TABLE(
  product_draft_id uuid,
  title text,
  title_source text,
  product_status public.product_status,
  moderation_revision bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  normalized_title text;
  next_snapshot jsonb;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND (p_expected_seller_id IS NULL OR product.seller_id = p_expected_seller_id);
  IF NOT FOUND THEN RETURN; END IF;
  IF selected_product.status = 'draft' THEN
    PERFORM public.assert_initial_product_moderation_revision(
      p_product_draft_id, p_expected_seller_id, p_expected_moderation_revision
    );
    RETURN QUERY
    UPDATE public.products AS product
    SET title = p_title, title_source = p_title_source
    WHERE product.id = p_product_draft_id
    RETURNING product.id, product.title, product.title_source, product.status,
      product.moderation_revision;
    RETURN;
  END IF;

  selected_copy := public.assert_product_moderation_working_revision(
    p_product_draft_id, p_expected_seller_id, p_expected_moderation_revision
  );
  normalized_title := btrim(regexp_replace(COALESCE(p_title, ''), '[[:space:]]+', ' ', 'g'));
  IF char_length(normalized_title) > 50 OR p_title_source NOT IN ('human', 'model') THEN
    RAISE EXCEPTION 'product_draft_title_invalid' USING ERRCODE = '22023';
  END IF;
  next_snapshot := jsonb_set(selected_copy.snapshot_json, '{title}', to_jsonb(normalized_title), true);
  next_snapshot := jsonb_set(next_snapshot, '{titleSource}', to_jsonb(p_title_source), true);
  IF next_snapshot IS DISTINCT FROM selected_copy.snapshot_json THEN
    UPDATE public.product_moderation_working_copies AS working_copy
    SET snapshot_json = next_snapshot, revision = revision + 1, updated_at = now()
    WHERE working_copy.product_id = selected_copy.product_id
    RETURNING * INTO selected_copy;
  END IF;
  RETURN QUERY SELECT selected_copy.product_id,
    selected_copy.snapshot_json ->> 'title',
    selected_copy.snapshot_json ->> 'titleSource',
    selected_product.status,
    selected_copy.revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_initial_product_draft_facts_patch(
  p_product_draft_id uuid,
  p_normalized_patch jsonb,
  p_expected_seller_id uuid,
  p_expected_moderation_revision bigint
)
RETURNS TABLE(
  result text,
  product_draft_id uuid,
  facts_json jsonb,
  facts_revision integer,
  updated_at timestamptz,
  product_status public.product_status,
  moderation_revision bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  current_facts jsonb;
  next_facts jsonb;
  current_facts_revision integer;
  next_snapshot jsonb;
  patch_key text;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND (p_expected_seller_id IS NULL OR product.seller_id = p_expected_seller_id);
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::jsonb, NULL::integer,
      NULL::timestamptz, NULL::public.product_status, NULL::bigint;
    RETURN;
  END IF;
  IF selected_product.status = 'draft' THEN
    PERFORM public.assert_initial_product_moderation_revision(
      p_product_draft_id, p_expected_seller_id, p_expected_moderation_revision
    );
    RETURN QUERY
    WITH applied AS MATERIALIZED (
      SELECT operation.* FROM public.apply_product_draft_facts_patch(
        p_product_draft_id, p_normalized_patch, p_expected_seller_id
      ) AS operation
    )
    SELECT applied.result, applied.product_draft_id, applied.facts_json,
      applied.facts_revision, applied.updated_at, applied.product_status,
      product.moderation_revision
    FROM applied LEFT JOIN public.products AS product ON product.id = applied.product_draft_id;
    RETURN;
  END IF;

  IF p_normalized_patch IS NULL OR jsonb_typeof(p_normalized_patch) <> 'object'
    OR p_normalized_patch = '{}'::jsonb
  THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;
  FOR patch_key IN SELECT jsonb_object_keys(p_normalized_patch)
  LOOP
    IF patch_key NOT IN ('colors', 'materialComposition', 'uncertainFields') THEN
      RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  selected_copy := public.assert_product_moderation_working_revision(
    p_product_draft_id, p_expected_seller_id, p_expected_moderation_revision
  );
  current_facts := selected_copy.snapshot_json #> '{facts,facts}';
  current_facts_revision := (selected_copy.snapshot_json #>> '{facts,factsRevision}')::integer;
  IF current_facts IS NULL OR current_facts_revision IS NULL THEN
    RETURN QUERY SELECT 'facts_missing'::text, selected_product.id, NULL::jsonb,
      NULL::integer, NULL::timestamptz, selected_product.status, NULL::bigint;
    RETURN;
  END IF;
  next_facts := current_facts;
  IF p_normalized_patch ? 'colors' THEN
    next_facts := jsonb_set(next_facts, '{colors}', p_normalized_patch -> 'colors', true);
    next_facts := jsonb_set(next_facts, '{fieldSources,colors}', '"human"'::jsonb, true);
  END IF;
  IF p_normalized_patch ? 'materialComposition' THEN
    next_facts := jsonb_set(next_facts, '{materialComposition}', p_normalized_patch -> 'materialComposition', true);
    next_facts := jsonb_set(next_facts, '{fieldSources,materialComposition}', '"human"'::jsonb, true);
  END IF;
  IF p_normalized_patch ? 'uncertainFields' THEN
    next_facts := jsonb_set(next_facts, '{uncertainFields}', p_normalized_patch -> 'uncertainFields', true);
  END IF;
  IF next_facts IS DISTINCT FROM current_facts THEN
    current_facts_revision := current_facts_revision + 1;
    next_snapshot := jsonb_set(
      selected_copy.snapshot_json,
      '{facts}',
      jsonb_build_object('factsRevision', current_facts_revision, 'facts', next_facts),
      true
    );
    UPDATE public.product_moderation_working_copies AS working_copy
    SET snapshot_json = next_snapshot, revision = revision + 1, updated_at = now()
    WHERE working_copy.product_id = selected_copy.product_id
    RETURNING * INTO selected_copy;
    result := 'updated';
  ELSE
    result := 'unchanged';
  END IF;
  RETURN QUERY SELECT result, selected_product.id, next_facts, current_facts_revision,
    selected_copy.updated_at, selected_product.status, selected_copy.revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_initial_product_draft_description_patch(
  p_product_draft_id uuid,
  p_expected_seller_id uuid,
  p_expected_moderation_revision bigint,
  p_pl_patch_present boolean,
  p_pl_description text,
  p_en_patch_present boolean,
  p_en_description text,
  p_de_patch_present boolean,
  p_de_description text,
  p_vi_patch_present boolean,
  p_vi_description text
)
RETURNS TABLE(result text, snapshot jsonb, moderation_revision bigint)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  next_snapshot jsonb;
  current_facts_revision integer;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND (p_expected_seller_id IS NULL OR product.seller_id = p_expected_seller_id);
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::jsonb, NULL::bigint;
    RETURN;
  END IF;
  IF selected_product.status = 'draft' THEN
    PERFORM public.assert_initial_product_moderation_revision(
      p_product_draft_id, p_expected_seller_id, p_expected_moderation_revision
    );
    RETURN QUERY
    WITH applied AS MATERIALIZED (
      SELECT operation.* FROM public.apply_scoped_product_draft_description_patch(
        p_product_draft_id, p_expected_seller_id,
        p_pl_patch_present, p_pl_description,
        p_en_patch_present, p_en_description,
        p_de_patch_present, p_de_description,
        p_vi_patch_present, p_vi_description
      ) AS operation
    )
    SELECT applied.result, applied.snapshot, product.moderation_revision
    FROM applied LEFT JOIN public.products AS product ON product.id = p_product_draft_id;
    RETURN;
  END IF;

  selected_copy := public.assert_product_moderation_working_revision(
    p_product_draft_id, p_expected_seller_id, p_expected_moderation_revision
  );
  current_facts_revision := (selected_copy.snapshot_json #>> '{facts,factsRevision}')::integer;
  next_snapshot := public.product_moderation_snapshot_apply_description_patch(
    selected_copy.snapshot_json,
    current_facts_revision,
    p_pl_patch_present, p_pl_description,
    p_en_patch_present, p_en_description,
    p_de_patch_present, p_de_description,
    p_vi_patch_present, p_vi_description
  );
  IF next_snapshot IS DISTINCT FROM selected_copy.snapshot_json THEN
    UPDATE public.product_moderation_working_copies AS working_copy
    SET snapshot_json = next_snapshot, revision = revision + 1, updated_at = now()
    WHERE working_copy.product_id = selected_copy.product_id
    RETURNING * INTO selected_copy;
  END IF;
  RETURN QUERY SELECT
    'applied'::text,
    public.product_moderation_working_description_snapshot(
      selected_copy.product_id,
      selected_product.status,
      selected_copy.snapshot_json
    ),
    selected_copy.revision;
END;
$$;

CREATE FUNCTION public.product_moderation_working_description_snapshot(
  p_product_id uuid,
  p_product_status public.product_status,
  p_snapshot jsonb
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'productDraftId', p_product_id,
    'productStatus', p_product_status,
    'categoryId', (p_snapshot ->> 'categoryId')::uuid,
    'currentFactsRevision', (p_snapshot #>> '{facts,factsRevision}')::integer,
    'descriptions', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'language', language_order.language,
          'text', description.value ->> 'descriptionText',
          'source', description.value ->> 'source',
          'factsRevision', (description.value ->> 'factsRevision')::integer,
          'provider', description.value ->> 'provider',
          'model', description.value ->> 'model',
          'pipelineVersion', description.value ->> 'pipelineVersion',
          'generatedAt', description.value ->> 'generatedAt',
          'updatedAt', description.value ->> 'updatedAt',
          'outdated', CASE
            WHEN description.value IS NULL THEN NULL
            WHEN (description.value ->> 'factsRevision')::integer IS NULL THEN true
            ELSE (description.value ->> 'factsRevision')::integer
              < (p_snapshot #>> '{facts,factsRevision}')::integer
          END
        ) ORDER BY language_order.position
      )
      FROM (VALUES ('pl'::text, 1), ('en'::text, 2), ('de'::text, 3), ('vi'::text, 4))
        AS language_order(language, position)
      LEFT JOIN LATERAL (
        SELECT entry.value
        FROM jsonb_array_elements(COALESCE(p_snapshot -> 'descriptions', '[]'::jsonb)) AS entry(value)
        WHERE entry.value ->> 'language' = language_order.language
        LIMIT 1
      ) AS description ON true
    )
  );
$$;

CREATE FUNCTION public.submit_product_moderation_working_copy(
  p_product_id uuid,
  p_seller_id uuid,
  p_expected_revision bigint,
  p_seller_request_id uuid,
  p_submitted_by_user_id uuid
)
RETURNS SETOF public.product_moderation_submissions
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_seller public.sellers%ROWTYPE;
  selected_category public.categories%ROWTYPE;
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  replay_submission public.product_moderation_submissions%ROWTYPE;
  created_submission public.product_moderation_submissions%ROWTYPE;
  description_entry jsonb;
  facts_revision integer;
  image_ids_json jsonb;
  cover_image_id uuid;
  image_count integer;
  cover_count integer;
BEGIN
  IF p_product_id IS NULL OR p_seller_id IS NULL OR p_expected_revision IS NULL
    OR p_expected_revision < 1 OR p_seller_request_id IS NULL
    OR p_submitted_by_user_id IS NULL
  THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id AND product.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT submission.* INTO replay_submission
  FROM public.product_moderation_submissions AS submission
  WHERE submission.seller_id = p_seller_id
    AND submission.seller_request_id = p_seller_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF replay_submission.product_id <> p_product_id
      OR replay_submission.revision <> p_expected_revision
      OR replay_submission.submission_kind <> 'update'
      OR replay_submission.submitted_by_user_id <> p_submitted_by_user_id
    THEN
      RAISE EXCEPTION 'product_moderation_submission_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN NEXT replay_submission;
    RETURN;
  END IF;

  selected_copy := public.assert_product_moderation_working_revision(
    p_product_id, p_seller_id, p_expected_revision
  );
  SELECT seller.* INTO selected_seller
  FROM public.sellers AS seller WHERE seller.id = p_seller_id FOR SHARE;
  IF NOT FOUND OR selected_seller.approved_profile_submission_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.seller_profile_submissions AS submission
      WHERE submission.id = selected_seller.approved_profile_submission_id
        AND submission.seller_id = selected_seller.id
        AND submission.status = 'approved'
    )
  THEN
    RAISE EXCEPTION 'product_moderation_seller_approval_required' USING ERRCODE = '55000';
  END IF;

  IF COALESCE(btrim(selected_copy.snapshot_json ->> 'title'), '') = ''
    OR char_length(selected_copy.snapshot_json ->> 'title') > 50
    OR selected_copy.snapshot_json ->> 'titleSource' NOT IN ('human', 'model')
  THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;
  IF selected_copy.snapshot_json ->> 'productId' IS DISTINCT FROM selected_product.id::text
    OR selected_copy.snapshot_json ->> 'sellerId' IS DISTINCT FROM selected_product.seller_id::text
    OR selected_copy.snapshot_json ->> 'productCode' IS DISTINCT FROM selected_product.product_code
    OR (selected_copy.snapshot_json ->> 'schemaVersion')::integer <> 1
  THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT category.* INTO selected_category
  FROM public.categories AS category
  WHERE category.id = (selected_copy.snapshot_json ->> 'categoryId')::uuid
  FOR SHARE;
  IF NOT FOUND OR selected_category.product_code_prefix IS NULL OR EXISTS (
    SELECT 1 FROM public.categories AS child WHERE child.parent_id = selected_category.id
  ) THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(selected_copy.snapshot_json -> 'audiences') <> 'array'
    OR jsonb_array_length(selected_copy.snapshot_json -> 'audiences') < 1
  THEN
    RAISE EXCEPTION 'product_moderation_audience_required' USING ERRCODE = '55000';
  END IF;

  facts_revision := (selected_copy.snapshot_json #>> '{facts,factsRevision}')::integer;
  FOR description_entry IN
    SELECT entry.value
    FROM jsonb_array_elements(COALESCE(selected_copy.snapshot_json -> 'descriptions', '[]'::jsonb))
      AS entry(value)
  LOOP
    IF (description_entry ->> 'factsRevision')::integer IS DISTINCT FROM facts_revision THEN
      RAISE EXCEPTION 'product_moderation_description_outdated' USING ERRCODE = '55000';
    END IF;
  END LOOP;

  PERFORM 1 FROM public.product_moderation_working_copy_images AS membership
  JOIN public.product_draft_images AS image
    ON image.product_draft_id = membership.product_id
   AND image.id = membership.product_draft_image_id
  WHERE membership.product_id = selected_product.id
  ORDER BY membership.position
  FOR UPDATE OF image;
  IF EXISTS (
    SELECT 1
    FROM public.product_moderation_working_copy_images AS membership
    JOIN public.product_draft_images AS image
      ON image.product_draft_id = membership.product_id
     AND image.id = membership.product_draft_image_id
    WHERE membership.product_id = selected_product.id
      AND image.status <> 'available'
  ) THEN
    RAISE EXCEPTION 'product_moderation_images_not_ready' USING ERRCODE = '55000';
  END IF;
  SELECT
    COALESCE(jsonb_agg(to_jsonb(membership.product_draft_image_id) ORDER BY membership.position), '[]'::jsonb),
    (min(membership.product_draft_image_id::text) FILTER (WHERE membership.is_cover))::uuid,
    count(*)::integer,
    count(*) FILTER (WHERE membership.is_cover)::integer
  INTO image_ids_json, cover_image_id, image_count, cover_count
  FROM public.product_moderation_working_copy_images AS membership
  WHERE membership.product_id = selected_product.id;
  IF image_count < 1 OR cover_count <> 1
    OR image_ids_json IS DISTINCT FROM selected_copy.snapshot_json -> 'imageIds'
    OR to_jsonb(cover_image_id) IS DISTINCT FROM selected_copy.snapshot_json -> 'coverImageId'
    OR EXISTS (
      SELECT 1 FROM public.product_moderation_working_copy_images AS membership
      WHERE membership.product_id = selected_product.id
        AND membership.position <> (
          SELECT count(*)
          FROM public.product_moderation_working_copy_images AS earlier
          WHERE earlier.product_id = membership.product_id
            AND earlier.position < membership.position
        )
    )
  THEN
    RAISE EXCEPTION 'product_moderation_images_not_ready' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.product_moderation_submissions (
    product_id, seller_id, submission_kind, revision, snapshot_schema_version,
    snapshot_json, review_status, seller_request_id, submitted_by_user_id
  ) VALUES (
    selected_product.id,
    selected_product.seller_id,
    'update',
    selected_copy.revision,
    selected_copy.snapshot_schema_version,
    selected_copy.snapshot_json,
    'pending',
    p_seller_request_id,
    p_submitted_by_user_id
  ) RETURNING * INTO created_submission;

  INSERT INTO public.product_moderation_submission_images (
    submission_id, product_id, product_draft_image_id, position, is_cover
  )
  SELECT created_submission.id, membership.product_id,
    membership.product_draft_image_id, membership.position, membership.is_cover
  FROM public.product_moderation_working_copy_images AS membership
  WHERE membership.product_id = selected_product.id
  ORDER BY membership.position;

  INSERT INTO public.product_moderation_events (
    product_id, seller_id, submission_id, event_type, actor_user_id,
    expected_revision, request_id
  ) VALUES (
    selected_product.id, selected_product.seller_id, created_submission.id,
    'submitted', p_submitted_by_user_id, p_expected_revision, p_seller_request_id
  );
  UPDATE public.products AS product
  SET active_moderation_submission_id = created_submission.id
  WHERE product.id = selected_product.id;

  RETURN NEXT created_submission;
END;
$$;

CREATE FUNCTION public.read_product_moderation_state(
  p_product_id uuid,
  p_seller_id uuid
)
RETURNS TABLE (
  product_id uuid,
  seller_id uuid,
  moderation_revision bigint,
  product_status public.product_status,
  seller_approved boolean,
  active_submission_id uuid,
  active_submission_status text,
  active_submission_revision bigint,
  active_submission_submitted_at timestamptz,
  active_submission_snapshot jsonb
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  edit_state record;
BEGIN
  SELECT state.* INTO edit_state
  FROM public.read_product_moderation_edit_state(p_product_id, p_seller_id) AS state;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY
  SELECT
    product.id,
    product.seller_id,
    edit_state.revision,
    product.status,
    seller.approved_profile_submission_id IS NOT NULL,
    submission.id,
    submission.review_status,
    submission.revision,
    submission.submitted_at,
    submission.snapshot_json
  FROM public.products AS product
  JOIN public.sellers AS seller ON seller.id = product.seller_id
  LEFT JOIN public.product_moderation_submissions AS submission
    ON submission.id = product.active_moderation_submission_id
   AND submission.product_id = product.id
   AND submission.seller_id = product.seller_id
  WHERE product.id = p_product_id AND product.seller_id = p_seller_id;
END;
$$;

CREATE FUNCTION public.submit_product_moderation(
  p_product_id uuid,
  p_seller_id uuid,
  p_expected_revision bigint,
  p_seller_request_id uuid,
  p_submitted_by_user_id uuid
)
RETURNS SETOF public.product_moderation_submissions
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE selected_status public.product_status;
BEGIN
  SELECT product.status INTO selected_status
  FROM public.products AS product
  WHERE product.id = p_product_id AND product.seller_id = p_seller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF selected_status = 'draft' THEN
    RETURN QUERY SELECT submission.* FROM public.submit_initial_product_moderation(
      p_product_id, p_seller_id, p_expected_revision,
      p_seller_request_id, p_submitted_by_user_id
    ) AS submission;
  ELSE
    RETURN QUERY SELECT submission.* FROM public.submit_product_moderation_working_copy(
      p_product_id, p_seller_id, p_expected_revision,
      p_seller_request_id, p_submitted_by_user_id
    ) AS submission;
  END IF;
END;
$$;

CREATE FUNCTION public.withdraw_product_moderation(
  p_product_id uuid,
  p_seller_id uuid,
  p_submission_id uuid,
  p_expected_revision bigint,
  p_request_id uuid,
  p_actor_user_id uuid
)
RETURNS SETOF public.product_moderation_submissions
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_submission public.product_moderation_submissions%ROWTYPE;
  replay_event public.product_moderation_events%ROWTYPE;
  selected_copy public.product_moderation_working_copies%ROWTYPE;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id AND product.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF selected_product.status = 'draft' THEN
    RETURN QUERY SELECT submission.* FROM public.withdraw_initial_product_moderation(
      p_product_id, p_seller_id, p_submission_id, p_expected_revision,
      p_request_id, p_actor_user_id
    ) AS submission;
    RETURN;
  END IF;

  SELECT event.* INTO replay_event
  FROM public.product_moderation_events AS event
  WHERE event.product_id = p_product_id AND event.request_id = p_request_id;
  IF FOUND THEN
    IF replay_event.event_type <> 'withdrawn'
      OR replay_event.submission_id <> p_submission_id
      OR replay_event.actor_user_id <> p_actor_user_id
      OR replay_event.expected_revision <> p_expected_revision
    THEN
      RAISE EXCEPTION 'product_moderation_submission_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT submission.*
    FROM public.product_moderation_submissions AS submission
    WHERE submission.id = p_submission_id AND submission.product_id = p_product_id
      AND submission.seller_id = p_seller_id;
    RETURN;
  END IF;

  SELECT working_copy.* INTO selected_copy
  FROM public.product_moderation_working_copies AS working_copy
  WHERE working_copy.product_id = selected_product.id
  FOR UPDATE;
  IF NOT FOUND OR selected_copy.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'product_moderation_working_revision_conflict' USING ERRCODE = '40001';
  END IF;
  IF selected_product.active_moderation_submission_id IS DISTINCT FROM p_submission_id THEN
    RAISE EXCEPTION 'product_moderation_submission_stale' USING ERRCODE = '55000';
  END IF;
  SELECT submission.* INTO selected_submission
  FROM public.product_moderation_submissions AS submission
  WHERE submission.id = p_submission_id AND submission.product_id = p_product_id
    AND submission.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF selected_submission.submission_kind <> 'update'
    OR selected_submission.review_status <> 'pending'
  THEN
    RAISE EXCEPTION 'product_moderation_submission_stale' USING ERRCODE = '55000';
  END IF;

  UPDATE public.product_moderation_submissions AS submission
  SET review_status = 'withdrawn'
  WHERE submission.id = selected_submission.id
  RETURNING * INTO selected_submission;
  UPDATE public.products AS product
  SET active_moderation_submission_id = NULL
  WHERE product.id = selected_product.id;
  UPDATE public.product_moderation_working_copies AS working_copy
  SET revision = revision + 1, updated_at = now()
  WHERE working_copy.product_id = selected_product.id;
  INSERT INTO public.product_moderation_events (
    product_id, seller_id, submission_id, event_type, actor_user_id,
    expected_revision, request_id
  ) VALUES (
    selected_product.id, selected_product.seller_id, selected_submission.id,
    'withdrawn', p_actor_user_id, p_expected_revision, p_request_id
  );
  RETURN NEXT selected_submission;
END;
$$;

CREATE FUNCTION public.enforce_approved_product_projection_mutation()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE selected_product_id uuid;
DECLARE selected_product public.products%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    selected_product_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSIF TG_TABLE_NAME IN ('product_draft_descriptions', 'product_draft_facts') THEN
    selected_product_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.product_draft_id ELSE NEW.product_draft_id END;
  ELSE
    selected_product_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END;
  END IF;
  SELECT product.* INTO selected_product
  FROM public.products AS product WHERE product.id = selected_product_id;
  IF NOT FOUND OR selected_product.approved_moderation_submission_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF NOT public.product_moderation_registry_contains(
    'bazoria.product_moderation_activation_ids', selected_product_id
  ) THEN
    RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_01_approved_projection
  BEFORE UPDATE OF title, title_source, category_id, description, moq, pack_size,
    price, currency, stock, cover_image_url, cover_image_id, product_code, status
  ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_approved_product_projection_mutation();
CREATE TRIGGER trg_product_draft_descriptions_01_approved_projection
  BEFORE INSERT OR UPDATE OR DELETE ON public.product_draft_descriptions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_approved_product_projection_mutation();
CREATE TRIGGER trg_product_draft_facts_01_approved_projection
  BEFORE INSERT OR UPDATE OR DELETE ON public.product_draft_facts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_approved_product_projection_mutation();
CREATE TRIGGER trg_product_audience_memberships_01_approved_projection
  BEFORE INSERT OR UPDATE OR DELETE ON public.product_audience_memberships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_approved_product_projection_mutation();

REVOKE ALL ON FUNCTION public.ensure_product_moderation_working_copy(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_product_moderation_edit_state(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_product_moderation_working_revision(uuid, uuid, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.product_moderation_snapshot_apply_description_patch(
  jsonb, integer, boolean, text, boolean, text, boolean, text, boolean, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_product_moderation_working_copy(
  uuid, uuid, bigint, boolean, text, boolean, text, uuid, integer, text,
  numeric, text, public.stock_status, boolean, text, public.product_status, text[]
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.product_moderation_working_description_snapshot(
  uuid, public.product_status, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_product_moderation_working_copy(
  uuid, uuid, bigint, uuid, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_product_moderation_state(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_product_moderation(uuid, uuid, bigint, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.withdraw_product_moderation(
  uuid, uuid, uuid, bigint, uuid, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_approved_product_projection_mutation()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ensure_product_moderation_working_copy(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.read_product_moderation_edit_state(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.save_product_moderation_working_copy(
  uuid, uuid, bigint, boolean, text, boolean, text, uuid, integer, text,
  numeric, text, public.stock_status, boolean, text, public.product_status, text[]
) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_product_moderation_state(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_product_moderation(uuid, uuid, bigint, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_product_moderation(
  uuid, uuid, uuid, bigint, uuid, uuid
) TO service_role;

COMMIT;
