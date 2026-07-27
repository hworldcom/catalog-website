CREATE TABLE public.product_draft_facts (
  product_draft_id uuid PRIMARY KEY
    REFERENCES public.products(id) ON DELETE CASCADE,
  facts_json jsonb NOT NULL DEFAULT
    '{
      "schemaVersion": 1,
      "productType": null,
      "colors": [],
      "pattern": null,
      "fit": null,
      "material": null,
      "visibleFeatures": [],
      "uncertainFields": [],
      "fieldSources": {
        "productType": null,
        "colors": null,
        "pattern": null,
        "fit": null,
        "material": null,
        "visibleFeatures": null
      }
    }'::jsonb,
  facts_revision integer NOT NULL DEFAULT 1
    CHECK (facts_revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.product_draft_facts TO service_role;
REVOKE ALL ON public.product_draft_facts FROM PUBLIC, anon, authenticated;

ALTER TABLE public.product_draft_facts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_product_draft_facts_updated
  BEFORE UPDATE ON public.product_draft_facts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.initialize_product_draft_facts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'draft'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
  THEN
    INSERT INTO public.product_draft_facts (product_draft_id)
    VALUES (NEW.id)
    ON CONFLICT (product_draft_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.initialize_product_draft_facts() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_products_initialize_draft_facts
  AFTER INSERT OR UPDATE OF status ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.initialize_product_draft_facts();

INSERT INTO public.product_draft_facts (product_draft_id)
SELECT product.id
FROM public.products AS product
WHERE product.status = 'draft'
ON CONFLICT (product_draft_id) DO NOTHING;

CREATE FUNCTION public.apply_product_draft_facts_patch(
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
      'productType',
      'colors',
      'pattern',
      'fit',
      'material',
      'visibleFeatures',
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

  SELECT facts.*
  INTO selected_facts
  FROM public.product_draft_facts AS facts
  WHERE facts.product_draft_id = selected_product.id
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

  IF p_normalized_patch ? 'productType' THEN
    next_facts := jsonb_set(
      next_facts,
      '{productType}',
      p_normalized_patch -> 'productType',
      true
    );
    next_facts := jsonb_set(next_facts, '{fieldSources,productType}', '"human"', true);
  END IF;

  IF p_normalized_patch ? 'colors' THEN
    next_facts := jsonb_set(next_facts, '{colors}', p_normalized_patch -> 'colors', true);
    next_facts := jsonb_set(next_facts, '{fieldSources,colors}', '"human"', true);
  END IF;

  IF p_normalized_patch ? 'pattern' THEN
    next_facts := jsonb_set(next_facts, '{pattern}', p_normalized_patch -> 'pattern', true);
    next_facts := jsonb_set(next_facts, '{fieldSources,pattern}', '"human"', true);
  END IF;

  IF p_normalized_patch ? 'fit' THEN
    next_facts := jsonb_set(next_facts, '{fit}', p_normalized_patch -> 'fit', true);
    next_facts := jsonb_set(next_facts, '{fieldSources,fit}', '"human"', true);
  END IF;

  IF p_normalized_patch ? 'material' THEN
    next_facts := jsonb_set(next_facts, '{material}', p_normalized_patch -> 'material', true);
    next_facts := jsonb_set(next_facts, '{fieldSources,material}', '"human"', true);
  END IF;

  IF p_normalized_patch ? 'visibleFeatures' THEN
    next_facts := jsonb_set(
      next_facts,
      '{visibleFeatures}',
      p_normalized_patch -> 'visibleFeatures',
      true
    );
    next_facts := jsonb_set(next_facts, '{fieldSources,visibleFeatures}', '"human"', true);
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

  UPDATE public.product_draft_facts AS facts
  SET
    facts_json = next_facts,
    facts_revision = facts.facts_revision + 1
  WHERE facts.product_draft_id = selected_facts.product_draft_id
  RETURNING facts.*
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
