BEGIN;

CREATE FUNCTION pg_temp.is_valid_product_draft_facts_v1(p_facts jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  field_name text;
  item jsonb;
  source_value jsonb;
BEGIN
  IF p_facts IS NULL OR jsonb_typeof(p_facts) <> 'object' THEN
    RETURN false;
  END IF;

  IF ARRAY(
    SELECT key
    FROM jsonb_object_keys(p_facts) AS key
    ORDER BY key
  ) <> ARRAY[
    'colors',
    'fieldSources',
    'fit',
    'material',
    'pattern',
    'productType',
    'schemaVersion',
    'uncertainFields',
    'visibleFeatures'
  ]::text[] THEN
    RETURN false;
  END IF;

  IF p_facts -> 'schemaVersion' <> '1'::jsonb THEN
    RETURN false;
  END IF;

  FOREACH field_name IN ARRAY ARRAY['productType', 'pattern', 'fit', 'material']
  LOOP
    item := p_facts -> field_name;
    IF item <> 'null'::jsonb AND (
      jsonb_typeof(item) <> 'string'
      OR char_length(btrim(item #>> '{}')) NOT BETWEEN 1 AND 120
    ) THEN
      RETURN false;
    END IF;
  END LOOP;

  FOREACH field_name IN ARRAY ARRAY['colors', 'visibleFeatures']
  LOOP
    IF jsonb_typeof(p_facts -> field_name) <> 'array'
      OR jsonb_array_length(p_facts -> field_name) > 10
    THEN
      RETURN false;
    END IF;

    FOR item IN
      SELECT element.value
      FROM jsonb_array_elements(p_facts -> field_name) AS element(value)
    LOOP
      IF jsonb_typeof(item) <> 'string'
        OR char_length(btrim(item #>> '{}')) NOT BETWEEN 1 AND 120
      THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;

  IF jsonb_typeof(p_facts -> 'uncertainFields') <> 'array'
    OR jsonb_array_length(p_facts -> 'uncertainFields') > 6
  THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_facts -> 'uncertainFields') AS entry(value)
    WHERE jsonb_typeof(entry.value) <> 'string'
      OR entry.value #>> '{}' NOT IN (
        'productType',
        'colors',
        'pattern',
        'fit',
        'material',
        'visibleFeatures'
      )
  ) THEN
    RETURN false;
  END IF;

  IF (
    SELECT count(*) <> count(DISTINCT entry.value)
    FROM jsonb_array_elements_text(p_facts -> 'uncertainFields') AS entry(value)
  ) THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(p_facts -> 'fieldSources') <> 'object'
    OR ARRAY(
      SELECT key
      FROM jsonb_object_keys(p_facts -> 'fieldSources') AS key
      ORDER BY key
    ) <> ARRAY[
      'colors',
      'fit',
      'material',
      'pattern',
      'productType',
      'visibleFeatures'
    ]::text[]
  THEN
    RETURN false;
  END IF;

  FOREACH field_name IN ARRAY ARRAY[
    'productType',
    'colors',
    'pattern',
    'fit',
    'material',
    'visibleFeatures'
  ]
  LOOP
    source_value := p_facts -> 'fieldSources' -> field_name;
    IF source_value <> 'null'::jsonb AND (
      jsonb_typeof(source_value) <> 'string'
      OR source_value #>> '{}' NOT IN ('human', 'model')
    ) THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

DO $$
DECLARE
  invalid_product_draft_id uuid;
BEGIN
  SELECT facts.product_draft_id
  INTO invalid_product_draft_id
  FROM public.product_draft_facts AS facts
  WHERE NOT pg_temp.is_valid_product_draft_facts_v1(facts.facts_json)
  ORDER BY facts.product_draft_id
  LIMIT 1;

  IF invalid_product_draft_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot migrate ProductDraft facts: product % has an invalid version 1 facts document',
      invalid_product_draft_id;
  END IF;
END;
$$;

ALTER TABLE public.product_draft_facts
  ALTER COLUMN facts_json SET DEFAULT
    '{
      "schemaVersion": 2,
      "colors": [],
      "materialComposition": null,
      "uncertainFields": [],
      "fieldSources": {
        "colors": null,
        "materialComposition": null
      }
    }'::jsonb;

UPDATE public.product_draft_facts AS facts
SET
  facts_json = jsonb_build_object(
    'schemaVersion',
    2,
    'colors',
    facts.facts_json -> 'colors',
    'materialComposition',
    facts.facts_json -> 'material',
    'uncertainFields',
    (
      SELECT COALESCE(
        jsonb_agg(
          CASE
            WHEN entry.value = 'material' THEN 'materialComposition'
            ELSE entry.value
          END
          ORDER BY entry.position
        ),
        '[]'::jsonb
      )
      FROM jsonb_array_elements_text(
        facts.facts_json -> 'uncertainFields'
      ) WITH ORDINALITY AS entry(value, position)
      WHERE entry.value IN ('colors', 'material')
    ),
    'fieldSources',
    jsonb_build_object(
      'colors',
      facts.facts_json -> 'fieldSources' -> 'colors',
      'materialComposition',
      facts.facts_json -> 'fieldSources' -> 'material'
    )
  ),
  facts_revision = facts.facts_revision + 1,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.apply_product_draft_facts_patch(
  p_product_draft_id uuid,
  p_normalized_patch jsonb,
  p_expected_seller_id uuid DEFAULT NULL
)
RETURNS TABLE (
  result text,
  product_draft_id uuid,
  facts_json jsonb,
  facts_revision integer,
  updated_at timestamptz,
  product_status public.product_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_facts public.product_draft_facts%ROWTYPE;
  next_facts jsonb;
  patch_key text;
BEGIN
  IF p_normalized_patch IS NULL
    OR jsonb_typeof(p_normalized_patch) <> 'object'
    OR p_normalized_patch = '{}'::jsonb
  THEN
    RAISE EXCEPTION 'Normalized ProductDraft facts patch must be a non-empty object';
  END IF;

  FOR patch_key IN
    SELECT jsonb_object_keys(p_normalized_patch)
  LOOP
    IF patch_key NOT IN (
      'colors',
      'materialComposition',
      'uncertainFields'
    )
    THEN
      RAISE EXCEPTION 'Normalized ProductDraft facts patch contains an unsupported field';
    END IF;
  END LOOP;

  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND (
      p_expected_seller_id IS NULL
      OR product.seller_id = p_expected_seller_id
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      'not_found'::text,
      NULL::uuid,
      NULL::jsonb,
      NULL::integer,
      NULL::timestamptz,
      NULL::public.product_status;
    RETURN;
  END IF;

  IF selected_product.status <> 'draft' THEN
    RETURN QUERY
    SELECT
      'not_editable'::text,
      selected_product.id,
      NULL::jsonb,
      NULL::integer,
      NULL::timestamptz,
      selected_product.status;
    RETURN;
  END IF;

  SELECT stored_facts.*
  INTO selected_facts
  FROM public.product_draft_facts AS stored_facts
  WHERE stored_facts.product_draft_id = selected_product.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      'facts_missing'::text,
      selected_product.id,
      NULL::jsonb,
      NULL::integer,
      NULL::timestamptz,
      selected_product.status;
    RETURN;
  END IF;

  next_facts := selected_facts.facts_json;

  IF p_normalized_patch ? 'colors' THEN
    next_facts := jsonb_set(next_facts, '{colors}', p_normalized_patch -> 'colors', true);
    next_facts := jsonb_set(next_facts, '{fieldSources,colors}', '"human"', true);
  END IF;

  IF p_normalized_patch ? 'materialComposition' THEN
    next_facts := jsonb_set(
      next_facts,
      '{materialComposition}',
      p_normalized_patch -> 'materialComposition',
      true
    );
    next_facts := jsonb_set(
      next_facts,
      '{fieldSources,materialComposition}',
      '"human"',
      true
    );
  END IF;

  IF p_normalized_patch ? 'uncertainFields' THEN
    next_facts := jsonb_set(
      next_facts,
      '{uncertainFields}',
      p_normalized_patch -> 'uncertainFields',
      true
    );
  END IF;

  IF next_facts = selected_facts.facts_json THEN
    RETURN QUERY
    SELECT
      'unchanged'::text,
      selected_facts.product_draft_id,
      selected_facts.facts_json,
      selected_facts.facts_revision,
      selected_facts.updated_at,
      selected_product.status;
    RETURN;
  END IF;

  UPDATE public.product_draft_facts AS stored_facts
  SET
    facts_json = next_facts,
    facts_revision = stored_facts.facts_revision + 1
  WHERE stored_facts.product_draft_id = selected_facts.product_draft_id
  RETURNING stored_facts.*
  INTO selected_facts;

  RETURN QUERY
  SELECT
    'updated'::text,
    selected_facts.product_draft_id,
    selected_facts.facts_json,
    selected_facts.facts_revision,
    selected_facts.updated_at,
    selected_product.status;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_product_draft_facts_patch(uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_product_draft_facts_patch(uuid, jsonb, uuid)
  TO service_role;

DROP FUNCTION pg_temp.is_valid_product_draft_facts_v1(jsonb);

COMMIT;
