BEGIN;

CREATE FUNCTION public.normalize_product_draft_description(p_value text)
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

CREATE TABLE public.product_draft_descriptions (
  product_draft_id uuid NOT NULL
    REFERENCES public.products(id) ON DELETE CASCADE,
  language text NOT NULL,
  description_text text NOT NULL,
  source text NOT NULL,
  facts_revision integer,
  provider text,
  model text,
  pipeline_version text,
  generated_at timestamptz,
  backfilled_from_legacy boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_draft_id, language),
  CONSTRAINT product_draft_descriptions_language_check
    CHECK (language IN ('pl', 'en', 'de', 'vi')),
  CONSTRAINT product_draft_descriptions_source_check
    CHECK (source IN ('human', 'model')),
  CONSTRAINT product_draft_descriptions_text_check
    CHECK (
      description_text = public.normalize_product_draft_description(description_text)
      AND description_text <> ''
      AND char_length(description_text) <= 8000
    ),
  CONSTRAINT product_draft_descriptions_facts_revision_check
    CHECK (facts_revision IS NULL OR facts_revision >= 1),
  CONSTRAINT product_draft_descriptions_provenance_check
    CHECK (
      (
        source = 'human'
        AND provider IS NULL
        AND model IS NULL
        AND pipeline_version IS NULL
        AND generated_at IS NULL
      )
      OR (
        source = 'model'
        AND provider IS NOT NULL
        AND btrim(provider) <> ''
        AND model IS NOT NULL
        AND btrim(model) <> ''
        AND pipeline_version IS NOT NULL
        AND btrim(pipeline_version) <> ''
        AND generated_at IS NOT NULL
      )
    ),
  CONSTRAINT product_draft_descriptions_legacy_check
    CHECK (
      (
        backfilled_from_legacy
        AND source = 'human'
        AND facts_revision IS NULL
      )
      OR (
        NOT backfilled_from_legacy
        AND facts_revision IS NOT NULL
      )
    )
);

REVOKE ALL ON public.product_draft_descriptions
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.product_draft_descriptions TO service_role;

ALTER TABLE public.product_draft_descriptions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_product_draft_descriptions_updated
  BEFORE UPDATE ON public.product_draft_descriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
DECLARE
  invalid_product_draft_id uuid;
BEGIN
  SELECT product.id
  INTO invalid_product_draft_id
  FROM public.products AS product
  WHERE product.description IS NOT NULL
    AND char_length(
      public.normalize_product_draft_description(product.description)
    ) > 8000
  ORDER BY product.id
  LIMIT 1;

  IF invalid_product_draft_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot migrate ProductDraft descriptions: product % has an overlong description',
      invalid_product_draft_id;
  END IF;
END;
$$;

CREATE FUNCTION public.project_english_product_draft_description()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_product_draft_id uuid;
  expected_description text;
BEGIN
  target_product_draft_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.product_draft_id
    ELSE NEW.product_draft_id
  END;

  IF TG_OP <> 'DELETE' AND NEW.language <> 'en' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' AND OLD.language <> 'en' THEN
    RETURN OLD;
  END IF;

  expected_description := CASE
    WHEN TG_OP = 'DELETE' THEN NULL
    ELSE NEW.description_text
  END;

  UPDATE public.products
  SET description = expected_description
  WHERE id = target_product_draft_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_product_draft_descriptions_project_english
  AFTER INSERT OR UPDATE OR DELETE ON public.product_draft_descriptions
  FOR EACH ROW EXECUTE FUNCTION public.project_english_product_draft_description();

INSERT INTO public.product_draft_descriptions (
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
SELECT
  product.id,
  'en',
  public.normalize_product_draft_description(product.description),
  'human',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  true
FROM public.products AS product
WHERE product.description IS NOT NULL
  AND public.normalize_product_draft_description(product.description) <> '';

UPDATE public.products AS product
SET description = NULL
WHERE product.description IS NOT NULL
  AND public.normalize_product_draft_description(product.description) = '';

CREATE FUNCTION public.enforce_product_draft_description_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expected_description text;
BEGIN
  SELECT description.description_text
  INTO expected_description
  FROM public.product_draft_descriptions AS description
  WHERE description.product_draft_id = NEW.id
    AND description.language = 'en';

  IF NEW.description IS DISTINCT FROM expected_description THEN
    RAISE EXCEPTION 'product_draft_description_projection_mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_10_description_projection
  BEFORE INSERT OR UPDATE OF description ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_draft_description_projection();

CREATE FUNCTION public.product_draft_description_snapshot(
  p_product_draft_id uuid,
  p_product_status public.product_status,
  p_current_facts_revision integer,
  p_category_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'productDraftId', p_product_draft_id,
    'productStatus', p_product_status,
    'categoryId', p_category_id,
    'currentFactsRevision', p_current_facts_revision,
    'descriptions', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'language', language_order.language,
          'text', description.description_text,
          'source', description.source,
          'factsRevision', description.facts_revision,
          'provider', description.provider,
          'model', description.model,
          'pipelineVersion', description.pipeline_version,
          'generatedAt', description.generated_at,
          'updatedAt', description.updated_at,
          'outdated', CASE
            WHEN description.product_draft_id IS NULL THEN NULL
            WHEN description.facts_revision IS NULL THEN true
            ELSE description.facts_revision < p_current_facts_revision
          END
        )
        ORDER BY language_order.position
      )
      FROM (
        VALUES
          ('pl'::text, 1),
          ('en'::text, 2),
          ('de'::text, 3),
          ('vi'::text, 4)
      ) AS language_order(language, position)
      LEFT JOIN public.product_draft_descriptions AS description
        ON description.product_draft_id = p_product_draft_id
       AND description.language = language_order.language
    )
  );
$$;

CREATE FUNCTION public.apply_product_draft_description_patch(
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
      p_cover_image_url,
      p_trending
    )
    RETURNING * INTO selected_product;
    action_result := 'created';
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
    status = p_status,
    cover_image_url = p_cover_image_url,
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

REVOKE ALL ON FUNCTION public.normalize_product_draft_description(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.project_english_product_draft_description()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_product_draft_description_projection()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.product_draft_description_snapshot(
  uuid,
  public.product_status,
  integer,
  uuid
) FROM PUBLIC, anon, authenticated;
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
  text,
  boolean,
  public.product_status
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
  text,
  boolean,
  public.product_status
) TO service_role;

COMMIT;
