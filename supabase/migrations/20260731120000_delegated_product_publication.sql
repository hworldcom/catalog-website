BEGIN;

ALTER TABLE public.product_image_publication_runs
  ADD COLUMN delegated_action_request_id uuid,
  ADD COLUMN delegated_action_request_fingerprint text,
  ADD CONSTRAINT product_image_publication_runs_delegated_action_fkey
    FOREIGN KEY (delegated_action_request_id)
    REFERENCES public.delegated_administrator_action_attempts(request_id),
  ADD CONSTRAINT product_image_publication_runs_delegated_action_shape
    CHECK (
      (
        delegated_action_request_id IS NULL
        AND delegated_action_request_fingerprint IS NULL
      )
      OR (
        delegated_action_request_id IS NOT NULL
        AND delegated_action_request_fingerprint ~ '^[0-9a-f]{64}$'
      )
    );

CREATE FUNCTION public.enforce_published_product_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.category_id IS NULL THEN
    RAISE EXCEPTION 'product_publication_category_required'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_05_publication_category
  BEFORE INSERT OR UPDATE OF status, category_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_published_product_category();

CREATE FUNCTION public.enforce_product_image_publication_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('pending', 'running')
    AND NOT EXISTS (
      SELECT 1
      FROM public.products AS product
      WHERE product.id = NEW.product_draft_id
        AND product.seller_id = NEW.seller_id
        AND product.category_id IS NOT NULL
    )
  THEN
    RAISE EXCEPTION 'product_publication_category_required'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_product_image_publication_runs_05_category
  BEFORE INSERT OR UPDATE OF status
  ON public.product_image_publication_runs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_image_publication_category();

CREATE FUNCTION public.apply_scoped_product_draft_description_patch(
  p_product_draft_id uuid,
  p_expected_seller_id uuid,
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
  selected_product_id uuid;
BEGIN
  SELECT product.id
  INTO selected_product_id
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND (
      p_expected_seller_id IS NULL
      OR product.seller_id = p_expected_seller_id
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::jsonb;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT patch.result, patch.snapshot
  FROM public.apply_product_draft_description_patch(
    selected_product_id,
    p_pl_patch_present,
    p_pl_description,
    p_en_patch_present,
    p_en_description,
    p_de_patch_present,
    p_de_description,
    p_vi_patch_present,
    p_vi_description
  ) AS patch;
END;
$$;

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
  p_delegated_action_request_id uuid,
  p_delegated_action_request_fingerprint text
)
RETURNS TABLE (
  result text,
  product_draft_id uuid,
  publication_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  authorization_result record;
BEGIN
  IF (
    p_delegated_action_request_id IS NULL
    AND p_delegated_action_request_fingerprint IS NOT NULL
  )
    OR (
      p_delegated_action_request_id IS NOT NULL
      AND (
        p_delegated_action_request_fingerprint IS NULL
        OR p_delegated_action_request_fingerprint !~ '^[0-9a-f]{64}$'
      )
    )
  THEN
    RAISE EXCEPTION 'delegated_product_publication_correlation_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF p_delegated_action_request_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.delegated_administrator_action_attempts AS attempt
      WHERE attempt.request_id = p_delegated_action_request_id
        AND attempt.seller_id = p_seller_id
        AND attempt.action_type = 'publish_product_draft'
        AND attempt.target_id = p_product_draft_id
        AND attempt.request_fingerprint = p_delegated_action_request_fingerprint
        AND attempt.status = 'running'
    )
  THEN
    RAISE EXCEPTION 'delegated_product_publication_correlation_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO authorization_result
  FROM public.authorize_seller_product_publication(
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

  IF authorization_result.result = 'in_progress'
    AND p_delegated_action_request_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.product_image_publication_runs AS run
      WHERE run.product_draft_id = p_product_draft_id
        AND run.seller_id = p_seller_id
        AND run.status IN ('pending', 'running')
        AND run.delegated_action_request_id = p_delegated_action_request_id
        AND run.delegated_action_request_fingerprint =
          p_delegated_action_request_fingerprint
    )
  THEN
    RETURN QUERY SELECT
      'pending'::text,
      authorization_result.product_draft_id::uuid,
      authorization_result.publication_status::text;
    RETURN;
  END IF;

  IF authorization_result.result = 'pending' THEN
    UPDATE public.product_image_publication_runs AS run
    SET
      delegated_action_request_id = p_delegated_action_request_id,
      delegated_action_request_fingerprint = p_delegated_action_request_fingerprint
    WHERE run.product_draft_id = authorization_result.product_draft_id
      AND run.seller_id = p_seller_id
      AND run.status = 'pending';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_publication_unavailable'
        USING ERRCODE = '40001';
    END IF;
  END IF;

  RETURN QUERY SELECT
    authorization_result.result::text,
    authorization_result.product_draft_id::uuid,
    authorization_result.publication_status::text;
END;
$$;

CREATE FUNCTION public.retry_product_publication_with_correlation(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_delegated_action_request_id uuid,
  p_delegated_action_request_fingerprint text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.product_image_publication_runs%ROWTYPE;
  retry_result text;
BEGIN
  IF (
    p_delegated_action_request_id IS NULL
    AND p_delegated_action_request_fingerprint IS NOT NULL
  )
    OR (
      p_delegated_action_request_id IS NOT NULL
      AND (
        p_delegated_action_request_fingerprint IS NULL
        OR p_delegated_action_request_fingerprint !~ '^[0-9a-f]{64}$'
      )
    )
  THEN
    RAISE EXCEPTION 'delegated_product_publication_correlation_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF p_delegated_action_request_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.delegated_administrator_action_attempts AS attempt
      WHERE attempt.request_id = p_delegated_action_request_id
        AND attempt.seller_id = p_seller_id
        AND attempt.action_type = 'retry_product_publication'
        AND attempt.target_id = p_product_draft_id
        AND attempt.request_fingerprint = p_delegated_action_request_fingerprint
        AND attempt.status = 'running'
    )
  THEN
    RAISE EXCEPTION 'delegated_product_publication_correlation_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF p_delegated_action_request_id IS NOT NULL THEN
    SELECT run.*
    INTO selected_run
    FROM public.product_image_publication_runs AS run
    WHERE run.product_draft_id = p_product_draft_id
      AND run.seller_id = p_seller_id
    FOR UPDATE;

    IF FOUND AND selected_run.status IN ('pending', 'running', 'completed') THEN
      IF selected_run.delegated_action_request_id = p_delegated_action_request_id
        AND selected_run.delegated_action_request_fingerprint =
          p_delegated_action_request_fingerprint
      THEN
        RETURN 'noop';
      END IF;

      IF selected_run.status IN ('pending', 'running') THEN
        RETURN 'in_progress';
      END IF;
      RETURN 'not_allowed';
    END IF;
  END IF;

  retry_result := public.retry_product_image_publication(
    p_product_draft_id,
    p_seller_id
  );

  IF retry_result = 'requeued' THEN
    UPDATE public.product_image_publication_runs AS run
    SET
      delegated_action_request_id = p_delegated_action_request_id,
      delegated_action_request_fingerprint = p_delegated_action_request_fingerprint
    WHERE run.product_draft_id = p_product_draft_id
      AND run.seller_id = p_seller_id
      AND run.status = 'pending';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_publication_unavailable'
        USING ERRCODE = '40001';
    END IF;
  END IF;

  RETURN retry_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_product_draft_description_patch(
  uuid,
  boolean,
  text,
  boolean,
  text,
  boolean,
  text,
  boolean,
  text
) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.authorize_seller_product_publication(
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
) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.retry_product_image_publication(uuid, uuid)
  FROM service_role;

REVOKE ALL ON FUNCTION public.enforce_published_product_category()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_product_image_publication_category()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_scoped_product_draft_description_patch(
  uuid,
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
REVOKE ALL ON FUNCTION public.authorize_product_publication_with_correlation(
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
  boolean,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_product_publication_with_correlation(
  uuid,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_scoped_product_draft_description_patch(
  uuid,
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
GRANT EXECUTE ON FUNCTION public.authorize_product_publication_with_correlation(
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
  boolean,
  uuid,
  text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_product_publication_with_correlation(
  uuid,
  uuid,
  uuid,
  text
) TO service_role;

COMMIT;
