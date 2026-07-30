BEGIN;

CREATE FUNCTION public.search_delegated_upload_sellers(
  p_query text,
  p_limit integer
)
RETURNS TABLE (
  seller_id uuid,
  name text,
  slug text,
  published boolean
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  normalized_query text;
  escaped_query text;
BEGIN
  IF p_query IS NULL
    OR char_length(p_query) > 100
    OR p_limit IS NULL
    OR p_limit < 1
    OR p_limit > 50
  THEN
    RAISE EXCEPTION 'invalid delegated seller search';
  END IF;

  normalized_query := lower(btrim(p_query));
  escaped_query := replace(
    replace(
      replace(normalized_query, E'\\', E'\\\\'),
      '%',
      E'\\%'
    ),
    '_',
    E'\\_'
  );

  RETURN QUERY
  SELECT
    seller.id,
    seller.name,
    seller.slug,
    seller.published
  FROM public.sellers AS seller
  WHERE normalized_query = ''
    OR lower(seller.name) LIKE '%' || escaped_query || '%' ESCAPE E'\\'
    OR lower(seller.slug) LIKE '%' || escaped_query || '%' ESCAPE E'\\'
  ORDER BY lower(btrim(seller.name)), seller.id
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_delegated_upload_sellers(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_delegated_upload_sellers(text, integer)
  TO service_role;

COMMIT;
