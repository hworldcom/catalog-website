BEGIN;

DROP FUNCTION public.list_public_trending_products(text, integer);

CREATE FUNCTION public.list_public_trending_products(
  p_audience text,
  p_limit integer DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  title text,
  cover_image_url text,
  price numeric,
  currency text,
  moq integer,
  pack_size text,
  stock public.stock_status,
  seller_id uuid,
  created_at timestamptz,
  seller_name text,
  seller_slug text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_audience text;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 8 THEN
    RAISE EXCEPTION 'public_catalog_read_invalid' USING ERRCODE = '22023';
  END IF;

  normalized_audience := public.normalize_public_catalog_audience(p_audience);

  RETURN QUERY
  SELECT
    product.id,
    product.title,
    product.cover_image_url,
    product.price,
    product.currency,
    product.moq,
    product.pack_size,
    product.stock,
    product.seller_id,
    product.created_at,
    seller.name,
    seller.slug
  FROM public.products AS product
  JOIN public.sellers AS seller
    ON seller.id = product.seller_id
   AND seller.published
  WHERE product.status = 'published'
    AND product.trending
    AND EXISTS (
      SELECT 1
      FROM public.product_audience_memberships AS membership
      WHERE membership.product_id = product.id
        AND (
          normalized_audience = 'all'
          OR membership.audience = normalized_audience
        )
    )
  ORDER BY product.created_at DESC, product.id DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.list_public_trending_products(text, integer)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_public_trending_products(text, integer)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.list_public_trending_products(text, integer) IS
  'Lists public trending products with their published seller identity.';

COMMIT;
