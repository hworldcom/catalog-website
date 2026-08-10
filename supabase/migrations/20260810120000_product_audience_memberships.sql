BEGIN;

CREATE TABLE public.product_audience_memberships (
  product_id uuid NOT NULL
    REFERENCES public.products(id) ON DELETE CASCADE,
  audience text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_audience_memberships_pkey PRIMARY KEY (product_id, audience),
  CONSTRAINT product_audience_memberships_audience_check
    CHECK (audience IN ('women', 'men', 'kids'))
);

ALTER TABLE public.product_audience_memberships ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.product_audience_memberships
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_audience_memberships
  TO service_role;

CREATE FUNCTION public.normalize_product_audience_set(p_audiences text[])
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  normalized text[];
BEGIN
  IF p_audiences IS NULL
    OR array_position(p_audiences, NULL) IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM unnest(p_audiences) AS requested(audience)
      WHERE requested.audience NOT IN ('women', 'men', 'kids')
    )
  THEN
    RAISE EXCEPTION 'product_audience_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(allowed.audience ORDER BY allowed.position), ARRAY[]::text[])
  INTO normalized
  FROM (
    VALUES
      ('women'::text, 1),
      ('men'::text, 2),
      ('kids'::text, 3)
  ) AS allowed(audience, position)
  WHERE allowed.audience = ANY (p_audiences);

  RETURN normalized;
END;
$$;

CREATE FUNCTION public.replace_product_audience_memberships(
  p_product_id uuid,
  p_seller_id uuid,
  p_audiences text[]
)
RETURNS TABLE (
  result text,
  audiences text[]
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  normalized text[];
BEGIN
  normalized := public.normalize_product_audience_set(p_audiences);

  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id
    AND product.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'product_audience_product_not_found'::text, NULL::text[];
    RETURN;
  END IF;

  IF selected_product.status = 'published' THEN
    RETURN QUERY SELECT 'product_audience_moderation_required'::text, NULL::text[];
    RETURN;
  END IF;

  DELETE FROM public.product_audience_memberships AS membership
  WHERE membership.product_id = selected_product.id;

  INSERT INTO public.product_audience_memberships (product_id, audience)
  SELECT selected_product.id, requested.audience
  FROM unnest(normalized) AS requested(audience);

  RETURN QUERY SELECT 'updated'::text, normalized;
END;
$$;

ALTER FUNCTION public.save_seller_product_with_description(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean, public.product_status
) RENAME TO save_seller_product_with_description_0039a_legacy;

REVOKE ALL ON FUNCTION public.save_seller_product_with_description_0039a_legacy(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean, public.product_status
) FROM PUBLIC, anon, authenticated, service_role;

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
  p_cover_image_url_patch_present boolean,
  p_cover_image_url text,
  p_trending boolean,
  p_status public.product_status,
  p_audiences text[]
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
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  saved_product public.products%ROWTYPE;
  save_result record;
  audience_result record;
  normalized_audiences text[];
  previous_audiences text[];
  audience_patch_applied boolean := false;
BEGIN
  IF p_audiences IS NOT NULL THEN
    normalized_audiences := public.normalize_product_audience_set(p_audiences);
  END IF;

  IF p_product_draft_id IS NOT NULL THEN
    SELECT product.*
    INTO selected_product
    FROM public.products AS product
    WHERE product.id = p_product_draft_id
      AND product.seller_id = p_seller_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT
        CASE
          WHEN p_audiences IS NULL THEN 'not_found'
          ELSE 'product_audience_product_not_found'
        END::text,
        NULL::uuid,
        NULL::text,
        NULL::text,
        NULL::public.product_status,
        NULL::text;
      RETURN;
    END IF;

    IF p_audiences IS NOT NULL THEN
      SELECT coalesce(
        array_agg(membership.audience ORDER BY
          CASE membership.audience
            WHEN 'women' THEN 1
            WHEN 'men' THEN 2
            WHEN 'kids' THEN 3
          END
        ),
        ARRAY[]::text[]
      )
      INTO previous_audiences
      FROM public.product_audience_memberships AS membership
      WHERE membership.product_id = selected_product.id;

      SELECT * INTO audience_result
      FROM public.replace_product_audience_memberships(
        selected_product.id,
        selected_product.seller_id,
        normalized_audiences
      );

      IF audience_result.result <> 'updated' THEN
        RETURN QUERY SELECT
          audience_result.result::text,
          selected_product.id,
          selected_product.title,
          selected_product.title_source,
          selected_product.status,
          selected_product.description;
        RETURN;
      END IF;
      audience_patch_applied := true;
    END IF;

    IF p_status = 'published' AND NOT EXISTS (
      SELECT 1
      FROM public.product_audience_memberships AS membership
      WHERE membership.product_id = selected_product.id
    ) THEN
      IF audience_patch_applied THEN
        DELETE FROM public.product_audience_memberships AS membership
        WHERE membership.product_id = selected_product.id;
        INSERT INTO public.product_audience_memberships (product_id, audience)
        SELECT selected_product.id, prior.audience
        FROM unnest(previous_audiences) AS prior(audience);
      END IF;
      RETURN QUERY SELECT
        'product_publication_audience_required'::text,
        selected_product.id,
        selected_product.title,
        selected_product.title_source,
        selected_product.status,
        selected_product.description;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO save_result
  FROM public.save_seller_product_with_description_0039a_legacy(
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
    p_status
  );

  IF save_result.result NOT IN ('created', 'updated') THEN
    IF audience_patch_applied THEN
      DELETE FROM public.product_audience_memberships AS membership
      WHERE membership.product_id = selected_product.id;
      INSERT INTO public.product_audience_memberships (product_id, audience)
      SELECT selected_product.id, prior.audience
      FROM unnest(previous_audiences) AS prior(audience);
    END IF;
    RETURN QUERY SELECT
      save_result.result::text,
      save_result.product_draft_id::uuid,
      save_result.title::text,
      save_result.title_source::text,
      save_result.product_status::public.product_status,
      save_result.english_description::text;
    RETURN;
  END IF;

  IF p_product_draft_id IS NULL AND p_audiences IS NOT NULL THEN
    SELECT product.*
    INTO saved_product
    FROM public.products AS product
    WHERE product.id = save_result.product_draft_id
      AND product.seller_id = p_seller_id
    FOR UPDATE;

    IF saved_product.status = 'published' THEN
      RAISE EXCEPTION 'product_publication_audience_required' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO audience_result
    FROM public.replace_product_audience_memberships(
      saved_product.id,
      saved_product.seller_id,
      normalized_audiences
    );
    IF audience_result.result <> 'updated' THEN
      RAISE EXCEPTION '%', audience_result.result USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN QUERY SELECT
    save_result.result::text,
    save_result.product_draft_id::uuid,
    save_result.title::text,
    save_result.title_source::text,
    save_result.product_status::public.product_status,
    save_result.english_description::text;
END;
$$;

-- Existing publication functions call the pre-0039a signature internally. Keep
-- that overload private while browser-facing saves use the audience-aware one.
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
  p_cover_image_url_patch_present boolean,
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
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT *
  FROM public.save_seller_product_with_description_0039a_legacy(
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
    p_status
  );
$$;

ALTER FUNCTION public.authorize_product_publication_with_correlation(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean, uuid, text
) RENAME TO authorize_product_publication_with_correlation_0039a_legacy;

REVOKE ALL ON FUNCTION public.authorize_product_publication_with_correlation_0039a_legacy(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.authorize_product_publication_with_correlation(
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
  p_trending boolean,
  p_audiences text[],
  p_delegated_action_request_id uuid,
  p_delegated_action_request_fingerprint text
)
RETURNS TABLE (
  result text,
  product_draft_id uuid,
  publication_status text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  authorization_result record;
  audience_result record;
  normalized_audiences text[];
  previous_audiences text[];
BEGIN
  normalized_audiences := public.normalize_product_audience_set(p_audiences);

  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND product.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF cardinality(normalized_audiences) = 0 THEN
    RETURN QUERY SELECT
      'product_publication_audience_required'::text,
      selected_product.id,
      NULL::text;
    RETURN;
  END IF;

  SELECT coalesce(
    array_agg(membership.audience ORDER BY
      CASE membership.audience
        WHEN 'women' THEN 1
        WHEN 'men' THEN 2
        WHEN 'kids' THEN 3
      END
    ),
    ARRAY[]::text[]
  )
  INTO previous_audiences
  FROM public.product_audience_memberships AS membership
  WHERE membership.product_id = selected_product.id;

  SELECT * INTO audience_result
  FROM public.replace_product_audience_memberships(
    selected_product.id,
    selected_product.seller_id,
    normalized_audiences
  );

  IF audience_result.result <> 'updated' THEN
    RETURN QUERY SELECT
      CASE audience_result.result
        WHEN 'product_audience_product_not_found' THEN 'not_found'
        ELSE 'not_allowed'
      END::text,
      selected_product.id,
      NULL::text;
    RETURN;
  END IF;

  SELECT * INTO authorization_result
  FROM public.authorize_product_publication_with_correlation_0039a_legacy(
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
    p_delegated_action_request_id,
    p_delegated_action_request_fingerprint
  );

  IF authorization_result.result <> 'pending' THEN
    DELETE FROM public.product_audience_memberships AS membership
    WHERE membership.product_id = selected_product.id;
    INSERT INTO public.product_audience_memberships (product_id, audience)
    SELECT selected_product.id, prior.audience
    FROM unnest(previous_audiences) AS prior(audience);
  END IF;

  RETURN QUERY SELECT
    authorization_result.result::text,
    authorization_result.product_draft_id::uuid,
    authorization_result.publication_status::text;
END;
$$;

ALTER FUNCTION public.retry_product_publication_with_correlation(uuid, uuid, uuid, text)
  RENAME TO retry_product_publication_with_correlation_0039a_legacy;

REVOKE ALL ON FUNCTION public.retry_product_publication_with_correlation_0039a_legacy(
  uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.retry_product_publication_with_correlation(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_delegated_action_request_id uuid,
  p_delegated_action_request_fingerprint text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_audience_memberships AS membership
    JOIN public.products AS product ON product.id = membership.product_id
    WHERE membership.product_id = p_product_draft_id
      AND product.seller_id = p_seller_id
  ) THEN
    RETURN 'audience_required';
  END IF;

  RETURN public.retry_product_publication_with_correlation_0039a_legacy(
    p_product_draft_id,
    p_seller_id,
    p_delegated_action_request_id,
    p_delegated_action_request_fingerprint
  );
END;
$$;

ALTER FUNCTION public.finalize_seller_product_publication(uuid, uuid, uuid)
  RENAME TO finalize_seller_product_publication_0039a_legacy;

REVOKE ALL ON FUNCTION public.finalize_seller_product_publication_0039a_legacy(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.finalize_seller_product_publication(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_attempt_token uuid
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_audience_memberships AS membership
    JOIN public.products AS product ON product.id = membership.product_id
    WHERE membership.product_id = p_product_draft_id
      AND product.seller_id = p_seller_id
  ) THEN
    RETURN 'not_allowed';
  END IF;

  RETURN public.finalize_seller_product_publication_0039a_legacy(
    p_product_draft_id,
    p_seller_id,
    p_attempt_token
  );
END;
$$;

CREATE FUNCTION public.enforce_published_product_audience()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'published'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published')
    AND NOT EXISTS (
      SELECT 1
      FROM public.product_audience_memberships AS membership
      WHERE membership.product_id = NEW.id
    )
  THEN
    RAISE EXCEPTION 'product_publication_audience_required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_07_publication_audience
  BEFORE INSERT OR UPDATE OF status ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_published_product_audience();

CREATE FUNCTION public.enforce_product_image_publication_audience()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('pending', 'running')
    AND NOT EXISTS (
      SELECT 1
      FROM public.product_audience_memberships AS membership
      JOIN public.products AS product ON product.id = membership.product_id
      WHERE membership.product_id = NEW.product_draft_id
        AND product.seller_id = NEW.seller_id
    )
  THEN
    RAISE EXCEPTION 'product_publication_audience_required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_product_image_publication_runs_06_audience
  BEFORE INSERT OR UPDATE OF status ON public.product_image_publication_runs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_image_publication_audience();

CREATE OR REPLACE FUNCTION public.assign_product_code_for_publication(
  p_product_id uuid,
  p_seller_id uuid
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_code text;
BEGIN
  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id
    AND product.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_code_allocation_failed' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_audience_memberships AS membership
    WHERE membership.product_id = selected_product.id
  ) THEN
    RAISE EXCEPTION 'product_publication_audience_required'
      USING ERRCODE = '23514';
  END IF;
  IF selected_product.category_id IS NULL THEN
    RAISE EXCEPTION 'product_publication_category_required'
      USING ERRCODE = '23514';
  END IF;

  IF selected_product.product_code IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.product_code_allocations AS allocation
      WHERE allocation.product_code = selected_product.product_code
        AND allocation.product_id = selected_product.id
        AND allocation.seller_id = selected_product.seller_id
    ) THEN
      RAISE EXCEPTION 'product_code_allocation_failed' USING ERRCODE = '55000';
    END IF;
    RETURN selected_product.product_code;
  END IF;

  selected_code := public.reserve_product_code(
    selected_product.id,
    selected_product.seller_id,
    selected_product.category_id
  );

  UPDATE public.products AS product
  SET product_code = selected_code
  WHERE product.id = selected_product.id
    AND product.product_code IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_code_allocation_failed' USING ERRCODE = '55000';
  END IF;

  RETURN selected_code;
END;
$$;

CREATE FUNCTION public.validate_product_audience_release_preflight()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.products AS product
    WHERE product.status = 'published'
      AND NOT EXISTS (
        SELECT 1
        FROM public.product_audience_memberships AS membership
        WHERE membership.product_id = product.id
      )
  ) THEN
    RAISE EXCEPTION 'product_audience_release_preflight_failed'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- The following data migration records explicit operator-owned assignments
-- for retained UAT products and then runs the release preflight. Keeping that
-- decision separate prevents this schema migration from inferring an audience.

REVOKE ALL ON FUNCTION public.normalize_product_audience_set(text[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.replace_product_audience_memberships(uuid, uuid, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_product_audience_memberships(uuid, uuid, text[])
  TO service_role;
REVOKE ALL ON FUNCTION public.save_seller_product_with_description(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean, public.product_status, text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_seller_product_with_description(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean, public.product_status, text[]
) TO service_role;
REVOKE ALL ON FUNCTION public.save_seller_product_with_description(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean, public.product_status
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.authorize_product_publication_with_correlation(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean, text[], uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_product_publication_with_correlation(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean, text[], uuid, text
) TO service_role;
REVOKE ALL ON FUNCTION public.retry_product_publication_with_correlation(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_product_publication_with_correlation(uuid, uuid, uuid, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.finalize_seller_product_publication(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_seller_product_publication(uuid, uuid, uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.enforce_published_product_audience()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_product_image_publication_audience()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assign_product_code_for_publication(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_product_audience_release_preflight()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_product_audience_release_preflight()
  TO service_role;

COMMIT;
