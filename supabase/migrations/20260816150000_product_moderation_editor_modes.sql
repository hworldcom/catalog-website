BEGIN;

ALTER FUNCTION public.ensure_product_moderation_working_copy(uuid, uuid)
  RENAME TO ensure_product_moderation_working_copy_0040d3b_legacy;

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
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_moderation_working_copies AS working_copy
    WHERE working_copy.product_id = p_product_id
  ) AND NOT (
    public.product_moderation_registry_contains(
      'bazoria.product_moderation_begin_edit_ids', p_product_id
    )
    OR public.product_moderation_registry_contains(
      'bazoria.product_moderation_restore_ids', p_product_id
    )
  ) THEN
    RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
  END IF;

  RETURN QUERY
  SELECT working_copy.*
  FROM public.ensure_product_moderation_working_copy_0040d3b_legacy(
    p_product_id,
    p_seller_id
  ) AS working_copy;
END;
$$;

ALTER FUNCTION public.begin_product_moderation_editing(uuid, uuid)
  RENAME TO begin_product_moderation_editing_0040d3b_legacy;

CREATE FUNCTION public.begin_product_moderation_editing(
  p_product_id uuid,
  p_seller_id uuid
)
RETURNS TABLE (
  product_id uuid,
  moderation_revision bigint,
  edit_source text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_product_id IS NOT NULL THEN
    PERFORM public.product_moderation_registry_add(
      'bazoria.product_moderation_begin_edit_ids',
      p_product_id
    );
  END IF;

  RETURN QUERY
  SELECT result.*
  FROM public.begin_product_moderation_editing_0040d3b_legacy(
    p_product_id,
    p_seller_id
  ) AS result;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_product_moderation_working_revision(
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
    RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
  END IF;
  IF selected_copy.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'product_moderation_working_revision_conflict' USING ERRCODE = '40001';
  END IF;
  RETURN selected_copy;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_product_moderation_edit_state(
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
STABLE
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
    AND (p_expected_seller_id IS NULL OR product.seller_id = p_expected_seller_id);
  IF NOT FOUND THEN RETURN; END IF;

  IF selected_product.status IN ('published', 'archived') THEN
    SELECT working_copy.* INTO selected_copy
    FROM public.product_moderation_working_copies AS working_copy
    WHERE working_copy.product_id = selected_product.id;
    IF NOT FOUND THEN RETURN; END IF;

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

  IF selected_product.status <> 'draft'
    OR selected_product.approved_moderation_submission_id IS NOT NULL
  THEN
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

  SELECT COALESCE(
    jsonb_agg(to_jsonb(image.id) ORDER BY image.source_position, image.id),
    '[]'::jsonb
  ) INTO image_ids_json
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

REVOKE ALL ON FUNCTION public.ensure_product_moderation_working_copy_0040d3b_legacy(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.begin_product_moderation_editing_0040d3b_legacy(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ensure_product_moderation_working_copy(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_product_moderation_editing(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_product_moderation_working_revision(uuid, uuid, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_product_moderation_edit_state(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ensure_product_moderation_working_copy(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_product_moderation_editing(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_product_moderation_working_revision(uuid, uuid, bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.read_product_moderation_edit_state(uuid, uuid)
  TO service_role;

COMMIT;
