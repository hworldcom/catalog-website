-- Ticket 0027d: enforce concise product titles and localized descriptions.

CREATE OR REPLACE FUNCTION public.validate_product_publication_title(
  p_title text
)
RETURNS TABLE(result text, normalized_title text)
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
      WHEN char_length(title) > 50 THEN 'title_invalid'
      ELSE 'valid'
    END,
    title
  FROM normalized;
$$;

CREATE OR REPLACE FUNCTION public.enforce_product_draft_title()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_title text;
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.status IN ('published', 'archived')
    AND (
      NEW.title IS DISTINCT FROM OLD.title
      OR NEW.title_source IS DISTINCT FROM OLD.title_source
    )
  THEN
    RAISE EXCEPTION 'product_draft_title_not_editable'
      USING ERRCODE = '23514';
  END IF;

  normalized_title := btrim(
    regexp_replace(COALESCE(NEW.title, ''), '[[:space:]]+', ' ', 'g')
  );

  IF char_length(normalized_title) > 50 THEN
    RAISE EXCEPTION 'product_draft_title_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'published'
    AND (
      TG_OP = 'INSERT'
      OR OLD.status IS DISTINCT FROM 'published'
    )
  THEN
    normalized_title := btrim(
      regexp_replace(COALESCE(NEW.title, ''), '[[:space:]]+', ' ', 'g')
    );

    IF normalized_title = '' THEN
      RAISE EXCEPTION 'product_draft_title_invalid'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.product_draft_descriptions AS description
      WHERE description.product_draft_id = NEW.id
        AND char_length(description.description_text) > 300
    ) THEN
      RAISE EXCEPTION 'product_draft_description_invalid'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER trg_products_00_title ON public.products;
CREATE TRIGGER trg_products_00_title
  BEFORE INSERT OR UPDATE OF title, title_source, status
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_product_draft_title();

CREATE OR REPLACE FUNCTION public.enforce_product_draft_description_length()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF char_length(NEW.description_text) > 300 THEN
    RAISE EXCEPTION 'product_draft_description_invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_draft_descriptions_length_guard
  ON public.product_draft_descriptions;
CREATE TRIGGER product_draft_descriptions_length_guard
  BEFORE INSERT OR UPDATE OF description_text
  ON public.product_draft_descriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_product_draft_description_length();

ALTER TABLE public.product_draft_descriptions
  DROP CONSTRAINT product_draft_descriptions_text_check;
ALTER TABLE public.product_draft_descriptions
  ADD CONSTRAINT product_draft_descriptions_text_check
  CHECK (
    description_text = public.normalize_product_draft_description(description_text)
    AND description_text <> ''
    AND char_length(description_text) <= 300
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.validate_product_publication_descriptions(
  p_product_draft_id uuid,
  p_english_patch_present boolean,
  p_english_description text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_english text;
BEGIN
  IF COALESCE(p_english_patch_present, false) THEN
    normalized_english := public.normalize_product_draft_description(
      p_english_description
    );
    IF normalized_english IS NOT NULL
      AND char_length(normalized_english) > 300
    THEN
      RETURN 'description_invalid';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_draft_descriptions AS description
    WHERE description.product_draft_id = p_product_draft_id
      AND (
        description.language <> 'en'
        OR NOT COALESCE(p_english_patch_present, false)
      )
      AND char_length(description.description_text) > 300
  ) THEN
    RETURN 'description_invalid';
  END IF;

  RETURN 'valid';
END;
$$;

ALTER FUNCTION public.create_seller_product_with_description(
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
  boolean,
  text,
  boolean,
  public.product_status
) RENAME TO create_seller_product_with_description_0027d_legacy;

CREATE FUNCTION public.create_seller_product_with_description(
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
RETURNS TABLE(
  result text,
  product_draft_id uuid,
  product_code text,
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
  normalized_title text;
  normalized_description text;
BEGIN
  normalized_title := btrim(
    regexp_replace(COALESCE(p_title, ''), '[[:space:]]+', ' ', 'g')
  );
  IF COALESCE(p_title_patch_present, false)
    AND char_length(normalized_title) > 50
  THEN
    RETURN QUERY SELECT
      'title_invalid'::text,
      NULL::uuid,
      NULL::text,
      normalized_title,
      NULL::text,
      NULL::public.product_status,
      NULL::text;
    RETURN;
  END IF;

  IF COALESCE(p_description_patch_present, false) THEN
    normalized_description := public.normalize_product_draft_description(
      p_description
    );
    IF normalized_description IS NOT NULL
      AND char_length(normalized_description) > 300
    THEN
      RETURN QUERY SELECT
        'description_invalid'::text,
        NULL::uuid,
        NULL::text,
        normalized_title,
        NULL::text,
        NULL::public.product_status,
        NULL::text;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.create_seller_product_with_description_0027d_legacy(
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
    p_status
  );
END;
$$;

ALTER FUNCTION public.authorize_seller_product_publication(
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
  boolean,
  text,
  boolean
) RENAME TO authorize_seller_product_publication_0027d_legacy;

CREATE FUNCTION public.authorize_seller_product_publication(
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
RETURNS TABLE(result text, product_draft_id uuid, publication_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  description_validation_result text;
BEGIN
  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND product.seller_id = p_seller_id
  FOR UPDATE;

  IF FOUND
    AND selected_product.status = 'draft'
    AND EXISTS (
      SELECT 1
      FROM public.product_draft_source_memberships AS membership
      WHERE membership.product_draft_id = selected_product.id
    )
  THEN
    description_validation_result := public.validate_product_publication_descriptions(
      selected_product.id,
      p_description_patch_present,
      p_description
    );

    IF description_validation_result <> 'valid' THEN
      RETURN QUERY SELECT
        description_validation_result,
        selected_product.id,
        NULL::text;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.authorize_seller_product_publication_0027d_legacy(
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
    p_trending
  );
END;
$$;

ALTER FUNCTION public.finalize_product_draft_description_generation(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  text,
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  jsonb,
  text,
  text,
  text,
  text,
  timestamptz
) RENAME TO finalize_product_draft_description_generation_0027d_legacy;

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
RETURNS TABLE(result text, description_snapshot jsonb, title_snapshot jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  language_code text;
BEGIN
  IF p_descriptions IS NOT NULL
    AND jsonb_typeof(p_descriptions) = 'object'
  THEN
    FOREACH language_code IN ARRAY ARRAY['pl', 'en', 'de', 'vi']
    LOOP
      IF jsonb_typeof(p_descriptions -> language_code) = 'string'
        AND char_length(p_descriptions ->> language_code) > 300
      THEN
        RAISE EXCEPTION 'product_description_generation_output_invalid'
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  IF p_title_proposal IS NOT NULL
    AND char_length(p_title_proposal) > 50
  THEN
    RAISE EXCEPTION 'product_description_generation_output_invalid'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.finalize_product_draft_description_generation_0027d_legacy(
    p_product_draft_id,
    p_expected_seller_id,
    p_attempt_token,
    p_expected_category_id,
    p_expected_facts_revision,
    p_expected_cover_source,
    p_expected_cover_image_id,
    p_expected_cover_image_url,
    p_expected_cover_storage_bucket,
    p_expected_cover_object_key,
    p_expected_cover_content_type,
    p_expected_cover_size_bytes,
    p_descriptions,
    p_title_proposal,
    p_provider,
    p_model,
    p_pipeline_version,
    p_generated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_product_publication_descriptions(
  uuid,
  boolean,
  text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_seller_product_with_description_0027d_legacy(
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
  boolean,
  text,
  boolean,
  public.product_status
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_seller_product_with_description(
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
  boolean,
  text,
  boolean,
  public.product_status
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_seller_product_with_description(
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
  boolean,
  text,
  boolean,
  public.product_status
) TO service_role;
REVOKE ALL ON FUNCTION public.authorize_seller_product_publication_0027d_legacy(
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
  boolean,
  text,
  boolean
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.authorize_seller_product_publication(
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
  boolean,
  text,
  boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_seller_product_publication(
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
  boolean,
  text,
  boolean
) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_product_draft_description_generation_0027d_legacy(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  text,
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  jsonb,
  text,
  text,
  text,
  text,
  timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_product_draft_description_generation(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  text,
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  jsonb,
  text,
  text,
  text,
  text,
  timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_product_draft_description_generation(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  text,
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  jsonb,
  text,
  text,
  text,
  text,
  timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.enforce_product_draft_description_length()
  FROM PUBLIC, anon, authenticated, service_role;
