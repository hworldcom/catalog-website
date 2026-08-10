BEGIN;

CREATE INDEX product_audience_memberships_audience_product_idx
  ON public.product_audience_memberships (audience, product_id);

CREATE INDEX products_public_category_order_idx
  ON public.products (category_id, created_at DESC, id DESC)
  WHERE status = 'published';

CREATE INDEX products_public_seller_order_idx
  ON public.products (seller_id, created_at DESC, id DESC)
  WHERE status = 'published';

CREATE FUNCTION public.normalize_public_catalog_audience(p_audience text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE lower(trim(coalesce(p_audience, '')))
    WHEN 'women' THEN 'women'
    WHEN 'men' THEN 'men'
    WHEN 'kids' THEN 'kids'
    ELSE 'women'
  END;
$$;

CREATE FUNCTION public.list_public_clothing_categories(
  p_audience text,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  sort_order integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_audience text;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'public_catalog_read_invalid' USING ERRCODE = '22023';
  END IF;

  normalized_audience := public.normalize_public_catalog_audience(p_audience);

  RETURN QUERY
  SELECT
    category.id,
    category.slug,
    category.name,
    category.sort_order
  FROM public.categories AS category
  JOIN public.categories AS fashion
    ON fashion.id = category.parent_id
   AND fashion.slug = 'fashion'
   AND fashion.parent_id IS NULL
  WHERE category.product_code_prefix IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.products AS product
      JOIN public.sellers AS seller
        ON seller.id = product.seller_id
       AND seller.published
      JOIN public.product_audience_memberships AS membership
        ON membership.product_id = product.id
       AND membership.audience = normalized_audience
      WHERE product.category_id = category.id
        AND product.status = 'published'
    )
  ORDER BY category.sort_order ASC, category.id ASC
  LIMIT p_limit;
END;
$$;

CREATE FUNCTION public.list_public_audience_sellers(
  p_audience text,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  logo_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_audience text;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'public_catalog_read_invalid' USING ERRCODE = '22023';
  END IF;

  normalized_audience := public.normalize_public_catalog_audience(p_audience);

  RETURN QUERY
  SELECT
    seller.id,
    seller.slug,
    seller.name,
    seller.logo_url
  FROM public.sellers AS seller
  WHERE seller.published
    AND EXISTS (
      SELECT 1
      FROM public.products AS product
      JOIN public.product_audience_memberships AS membership
        ON membership.product_id = product.id
       AND membership.audience = normalized_audience
      WHERE product.seller_id = seller.id
        AND product.status = 'published'
    )
  ORDER BY lower(seller.name) ASC, seller.id ASC
  LIMIT p_limit;
END;
$$;

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
  created_at timestamptz
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
    product.created_at
  FROM public.products AS product
  JOIN public.sellers AS seller
    ON seller.id = product.seller_id
   AND seller.published
  JOIN public.product_audience_memberships AS membership
    ON membership.product_id = product.id
   AND membership.audience = normalized_audience
  WHERE product.status = 'published'
    AND product.trending
  ORDER BY product.created_at DESC, product.id DESC
  LIMIT p_limit;
END;
$$;

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
  primary_category_id uuid
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
    seller.primary_category_id
  FROM public.sellers AS seller
  WHERE seller.published
    AND EXISTS (
      SELECT 1
      FROM public.products AS product
      JOIN public.product_audience_memberships AS membership
        ON membership.product_id = product.id
       AND membership.audience = normalized_audience
      WHERE product.seller_id = seller.id
        AND product.status = 'published'
    )
  ORDER BY lower(seller.name) ASC, seller.id ASC
  LIMIT p_limit;
END;
$$;

CREATE FUNCTION public.list_public_category_products(
  p_category_slug text,
  p_audience text,
  p_limit integer DEFAULT 48
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
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_audience text;
BEGIN
  IF p_category_slug IS NULL
    OR length(p_category_slug) < 1
    OR length(p_category_slug) > 80
    OR p_limit IS NULL
    OR p_limit < 1
    OR p_limit > 48
  THEN
    RAISE EXCEPTION 'public_catalog_read_invalid' USING ERRCODE = '22023';
  END IF;

  normalized_audience := public.normalize_public_catalog_audience(p_audience);

  RETURN QUERY
  WITH target AS (
    SELECT category.id, category.slug, category.parent_id, category.product_code_prefix
    FROM public.categories AS category
    WHERE category.slug = p_category_slug
  ), fashion AS (
    SELECT category.id
    FROM public.categories AS category
    WHERE category.slug = 'fashion'
      AND category.parent_id IS NULL
  )
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
    product.created_at
  FROM public.products AS product
  JOIN public.sellers AS seller
    ON seller.id = product.seller_id
   AND seller.published
  JOIN public.product_audience_memberships AS membership
    ON membership.product_id = product.id
   AND membership.audience = normalized_audience
  JOIN public.categories AS product_category
    ON product_category.id = product.category_id
  CROSS JOIN target
  CROSS JOIN fashion
  WHERE product.status = 'published'
    AND product_category.product_code_prefix IS NOT NULL
    AND (
      (
        target.id = fashion.id
        AND product_category.parent_id = fashion.id
      )
      OR (
        target.parent_id = fashion.id
        AND target.product_code_prefix IS NOT NULL
        AND product.category_id = target.id
      )
    )
  ORDER BY product.created_at DESC, product.id DESC
  LIMIT p_limit;
END;
$$;

CREATE FUNCTION public.list_public_category_sellers(
  p_category_slug text,
  p_audience text,
  p_limit integer DEFAULT 12
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  city text,
  country text,
  verified boolean,
  cover_image_url text,
  logo_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_audience text;
BEGIN
  IF p_category_slug IS NULL
    OR length(p_category_slug) < 1
    OR length(p_category_slug) > 80
    OR p_limit IS NULL
    OR p_limit < 1
    OR p_limit > 12
  THEN
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
    seller.logo_url
  FROM public.sellers AS seller
  WHERE seller.published
    AND EXISTS (
      WITH target AS (
        SELECT category.id, category.parent_id, category.product_code_prefix
        FROM public.categories AS category
        WHERE category.slug = p_category_slug
      ), fashion AS (
        SELECT category.id
        FROM public.categories AS category
        WHERE category.slug = 'fashion'
          AND category.parent_id IS NULL
      )
      SELECT 1
      FROM public.products AS product
      JOIN public.product_audience_memberships AS membership
        ON membership.product_id = product.id
       AND membership.audience = normalized_audience
      JOIN public.categories AS product_category
        ON product_category.id = product.category_id
      CROSS JOIN target
      CROSS JOIN fashion
      WHERE product.seller_id = seller.id
        AND product.status = 'published'
        AND product_category.product_code_prefix IS NOT NULL
        AND (
          (
            target.id = fashion.id
            AND product_category.parent_id = fashion.id
          )
          OR (
            target.parent_id = fashion.id
            AND target.product_code_prefix IS NOT NULL
            AND product.category_id = target.id
          )
        )
    )
  ORDER BY lower(seller.name) ASC, seller.id ASC
  LIMIT p_limit;
END;
$$;

CREATE FUNCTION public.list_public_seller_products(
  p_seller_slug text,
  p_audience text,
  p_limit integer DEFAULT 100
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
  category_id uuid,
  category_slug text,
  category_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_audience text;
BEGIN
  IF p_seller_slug IS NULL
    OR length(p_seller_slug) < 1
    OR length(p_seller_slug) > 80
    OR p_limit IS NULL
    OR p_limit < 1
    OR p_limit > 100
  THEN
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
    product.category_id,
    category.slug,
    category.name,
    product.created_at
  FROM public.sellers AS seller
  JOIN public.products AS product
    ON product.seller_id = seller.id
   AND product.status = 'published'
  JOIN public.product_audience_memberships AS membership
    ON membership.product_id = product.id
   AND membership.audience = normalized_audience
  LEFT JOIN public.categories AS category
    ON category.id = product.category_id
  WHERE seller.slug = p_seller_slug
    AND seller.published
  ORDER BY product.created_at DESC, product.id DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_public_catalog_audience(text)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_public_clothing_categories(text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_public_audience_sellers(text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_public_trending_products(text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_public_featured_sellers(text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_public_category_products(text, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_public_category_sellers(text, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_public_seller_products(text, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_public_clothing_categories(text, integer)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_audience_sellers(text, integer)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_trending_products(text, integer)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_featured_sellers(text, integer)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_category_products(text, text, integer)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_category_sellers(text, text, integer)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_seller_products(text, text, integer)
  TO anon, authenticated, service_role;

COMMIT;
