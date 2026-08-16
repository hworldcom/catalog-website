BEGIN;

CREATE OR REPLACE FUNCTION public.save_initial_product_draft_with_description(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_expected_moderation_revision bigint,
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
RETURNS TABLE(
  result text,
  product_draft_id uuid,
  title text,
  title_source text,
  product_status public.product_status,
  english_description text,
  moderation_revision bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  save_result record;
  saved_moderation_revision bigint;
BEGIN
  IF p_product_draft_id IS NULL THEN
    IF p_expected_moderation_revision IS NOT NULL OR p_status <> 'draft' THEN
      RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
    END IF;
  ELSE
    PERFORM public.assert_initial_product_moderation_revision(
      p_product_draft_id,
      p_seller_id,
      p_expected_moderation_revision
    );
    IF p_status <> 'draft' THEN
      RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
    END IF;
  END IF;

  SELECT operation.*
  INTO save_result
  FROM public.save_seller_product_with_description(
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
    p_status,
    p_audiences
  ) AS operation;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_save_contract_invalid' USING ERRCODE = '55000';
  END IF;

  IF save_result.product_draft_id IS NOT NULL THEN
    SELECT product.moderation_revision
    INTO saved_moderation_revision
    FROM public.products AS product
    WHERE product.id = save_result.product_draft_id;
  END IF;

  IF save_result.result IN ('created', 'updated')
    AND saved_moderation_revision IS NULL
  THEN
    RAISE EXCEPTION 'product_moderation_save_contract_invalid' USING ERRCODE = '55000';
  END IF;

  RETURN QUERY SELECT
    save_result.result::text,
    save_result.product_draft_id::uuid,
    save_result.title::text,
    save_result.title_source::text,
    save_result.product_status::public.product_status,
    save_result.english_description::text,
    saved_moderation_revision;
END;
$$;

COMMIT;
