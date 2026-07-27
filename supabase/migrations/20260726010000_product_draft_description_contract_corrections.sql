BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_product_draft_description(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT regexp_replace(
    regexp_replace(p_value, E'\r\n?', E'\n', 'g'),
    U&'(^[[:space:]\FEFF]+)|([[:space:]\FEFF]+$)',
    '',
    'g'
  );
$$;

REVOKE ALL ON public.product_draft_descriptions
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.product_draft_descriptions TO service_role;

CREATE OR REPLACE FUNCTION public.apply_product_draft_description_patch(
  p_product_draft_id uuid,
  p_pl_patch_present boolean,
  p_pl_description text,
  p_en_patch_present boolean,
  p_en_description text,
  p_de_patch_present boolean,
  p_de_description text,
  p_vi_patch_present boolean,
  p_vi_description text
)
RETURNS TABLE (
  result text,
  snapshot jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_facts public.product_draft_facts%ROWTYPE;
  patch jsonb;
  normalized_description text;
BEGIN
  IF NOT COALESCE(p_pl_patch_present, false)
    AND NOT COALESCE(p_en_patch_present, false)
    AND NOT COALESCE(p_de_patch_present, false)
    AND NOT COALESCE(p_vi_patch_present, false)
  THEN
    RAISE EXCEPTION 'product_draft_description_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::jsonb;
    RETURN;
  END IF;

  IF selected_product.status <> 'draft' THEN
    RETURN QUERY SELECT 'not_editable'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT facts.*
  INTO selected_facts
  FROM public.product_draft_facts AS facts
  WHERE facts.product_draft_id = selected_product.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'facts_missing'::text, NULL::jsonb;
    RETURN;
  END IF;

  FOR patch IN
    SELECT value
    FROM jsonb_array_elements(
      jsonb_build_array(
        jsonb_build_object('language', 'pl', 'present', p_pl_patch_present, 'description', p_pl_description),
        jsonb_build_object('language', 'en', 'present', p_en_patch_present, 'description', p_en_description),
        jsonb_build_object('language', 'de', 'present', p_de_patch_present, 'description', p_de_description),
        jsonb_build_object('language', 'vi', 'present', p_vi_patch_present, 'description', p_vi_description)
      )
    )
  LOOP
    IF NOT COALESCE((patch ->> 'present')::boolean, false) THEN
      CONTINUE;
    END IF;

    normalized_description := public.normalize_product_draft_description(
      patch ->> 'description'
    );

    IF normalized_description IS NOT NULL
      AND char_length(normalized_description) > 8000
    THEN
      RAISE EXCEPTION 'product_draft_description_invalid'
        USING ERRCODE = '23514';
    END IF;

    IF normalized_description IS NULL OR normalized_description = '' THEN
      DELETE FROM public.product_draft_descriptions AS description
      WHERE description.product_draft_id = selected_product.id
        AND description.language = patch ->> 'language';
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
        selected_product.id,
        patch ->> 'language',
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
  END LOOP;

  RETURN QUERY
  SELECT
    'applied'::text,
    public.product_draft_description_snapshot(
      selected_product.id,
      selected_product.status,
      selected_facts.facts_revision,
      selected_product.category_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_product_draft_description(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_product_draft_description_patch(
  uuid,
  boolean,
  text,
  boolean,
  text,
  boolean,
  text,
  boolean,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_product_draft_description_patch(
  uuid,
  boolean,
  text,
  boolean,
  text,
  boolean,
  text,
  boolean,
  text
) TO service_role;

COMMIT;
