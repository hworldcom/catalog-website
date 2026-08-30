BEGIN;

DROP FUNCTION public.list_public_featured_sellers(text, integer);

CREATE FUNCTION public.list_public_featured_sellers(
  p_audience text,
  p_limit integer DEFAULT 6
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  city text,
  country text,
  verified boolean,
  cover_image_url text,
  logo_url text,
  primary_category_id uuid,
  primary_category_slug text,
  primary_category_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_audience text;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 6 THEN
    RAISE EXCEPTION 'public_catalog_read_invalid' USING ERRCODE = '22023';
  END IF;

  normalized_audience := public.normalize_public_catalog_audience(p_audience);

  RETURN QUERY
  SELECT
    seller.id,
    seller.slug,
    seller.name,
    seller.city,
    seller.country,
    seller.verified,
    seller.cover_image_url,
    seller.logo_url,
    seller.primary_category_id,
    primary_category.slug,
    primary_category.name
  FROM public.sellers AS seller
  LEFT JOIN public.categories AS primary_category
    ON primary_category.id = seller.primary_category_id
  WHERE seller.published
    AND EXISTS (
      SELECT 1
      FROM public.products AS product
      WHERE product.seller_id = seller.id
        AND product.status = 'published'
        AND EXISTS (
          SELECT 1
          FROM public.product_audience_memberships AS membership
          WHERE membership.product_id = product.id
            AND (
              normalized_audience = 'all'
              OR membership.audience = normalized_audience
            )
        )
    )
  ORDER BY lower(seller.name) ASC, seller.id ASC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.list_public_featured_sellers(text, integer)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_public_featured_sellers(text, integer)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.list_public_featured_sellers(text, integer) IS
  'Lists public featured sellers with their primary category identity.';

COMMIT;
