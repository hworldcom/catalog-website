BEGIN;

CREATE FUNCTION public.get_public_product_description(
  p_product_id uuid,
  p_language text
)
RETURNS TABLE (
  description_text text,
  resolved_language text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_language IS NULL
    OR p_language NOT IN ('pl', 'en', 'de', 'vi')
  THEN
    RAISE EXCEPTION 'public_product_description_invalid'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    description.description_text,
    description.language
  FROM public.products AS product
  JOIN public.sellers AS seller
    ON seller.id = product.seller_id
  JOIN public.product_draft_descriptions AS description
    ON description.product_draft_id = product.id
  WHERE product.id = p_product_id
    AND product.status = 'published'
    AND seller.published
    AND (
      description.language = p_language
      OR (
        p_language <> 'en'
        AND description.language = 'en'
      )
    )
  ORDER BY
    CASE WHEN description.language = p_language THEN 0 ELSE 1 END
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_product_description(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_product_description(uuid, text)
  TO anon, authenticated;

COMMIT;
