BEGIN;

CREATE FUNCTION public.enforce_product_archive_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'archived' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'product_archive_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_00_archive_immutable
  BEFORE UPDATE OF status ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_archive_immutability();

CREATE FUNCTION public.archive_seller_product(
  p_product_id uuid,
  p_seller_id uuid
)
RETURNS TABLE (
  result text,
  product_id uuid,
  product_status public.product_status
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_run public.product_image_publication_runs%ROWTYPE;
BEGIN
  IF p_product_id IS NULL OR p_seller_id IS NULL THEN
    RETURN QUERY SELECT
      'product_not_found'::text,
      NULL::uuid,
      NULL::public.product_status;
    RETURN;
  END IF;

  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id
    AND product.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'product_not_found'::text,
      NULL::uuid,
      NULL::public.product_status;
    RETURN;
  END IF;

  SELECT run.*
  INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.product_draft_id = selected_product.id
  FOR UPDATE;

  PERFORM 1
  FROM public.product_image_publication_items AS item
  WHERE item.product_draft_id = selected_product.id
  ORDER BY item.publication_order, item.product_draft_image_id
  FOR UPDATE;

  IF selected_product.status = 'archived' THEN
    RETURN QUERY SELECT
      'archived'::text,
      selected_product.id,
      'archived'::public.product_status;
    RETURN;
  END IF;

  IF selected_run.product_draft_id IS NOT NULL
    AND selected_run.status IN ('pending', 'running', 'cleanup_required')
  THEN
    RETURN QUERY SELECT
      'product_archive_not_allowed'::text,
      selected_product.id,
      selected_product.status;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_image_publication_items AS item
    WHERE item.product_draft_id = selected_product.id
      AND item.status = 'cleanup_required'
  ) THEN
    RETURN QUERY SELECT
      'product_archive_not_allowed'::text,
      selected_product.id,
      selected_product.status;
    RETURN;
  END IF;

  UPDATE public.products AS product
  SET status = 'archived'
  WHERE product.id = selected_product.id;

  RETURN QUERY SELECT
    'archived'::text,
    selected_product.id,
    'archived'::public.product_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_seller_product_with_description(
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
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
BEGIN
  IF p_product_draft_id IS NULL THEN
    RETURN QUERY
    SELECT
      created.result,
      created.product_draft_id,
      created.title,
      created.title_source,
      created.product_status,
      created.english_description
    FROM public.create_seller_product_with_description(
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
    ) AS created;
    RETURN;
  END IF;

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

  IF selected_product.status = 'archived' THEN
    RETURN QUERY SELECT
      'not_editable'::text,
      selected_product.id,
      NULL::text,
      NULL::text,
      selected_product.status,
      NULL::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.save_seller_product_with_description_0028b1_legacy(
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
END;
$$;

REVOKE DELETE ON public.products FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Products: owner can delete own" ON public.products;

REVOKE ALL ON FUNCTION public.enforce_product_archive_immutability()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.archive_seller_product(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_seller_product(uuid, uuid)
  TO service_role;
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
  boolean,
  text,
  boolean,
  public.product_status
) FROM PUBLIC, anon, authenticated;
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
  boolean,
  text,
  boolean,
  public.product_status
) TO service_role;

COMMIT;
