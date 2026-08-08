BEGIN;

ALTER TABLE public.classifier_import_group_outcomes
  ALTER COLUMN approved_category_slug DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.prepare_classifier_import_group(
  p_import_id uuid,
  p_attempt_token uuid,
  p_classifier_group_id uuid,
  p_approved_category_slug text,
  p_source_cover_classifier_image_id uuid
)
RETURNS TABLE (
  result text,
  product_draft_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.classifier_import_runs%ROWTYPE;
  selected_category public.categories%ROWTYPE;
  selected_product_id uuid;
  selected_product_seller_id uuid;
  selected_source_slug text;
  stable_error text;
BEGIN
  SELECT run.*
  INTO selected_run
  FROM public.classifier_import_runs AS run
  WHERE run.id = p_import_id
    AND run.status = 'running'
    AND run.attempt_token = p_attempt_token
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'claim_lost'::text, NULL::uuid;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'classifier-product-source:'
        || selected_run.classifier_organization_id::text
        || ':' || p_classifier_group_id::text,
      0
    )
  );

  selected_source_slug := p_approved_category_slug;
  SELECT outcome.approved_category_slug
  INTO selected_source_slug
  FROM public.classifier_import_group_outcomes AS outcome
  WHERE outcome.classifier_import_run_id = p_import_id
    AND outcome.classifier_group_id = p_classifier_group_id;

  IF NOT FOUND THEN
    SELECT outcome.approved_category_slug
    INTO selected_source_slug
    FROM public.classifier_import_group_outcomes AS outcome
    WHERE outcome.classifier_group_id = p_classifier_group_id
      AND outcome.product_draft_id IS NOT NULL
    ORDER BY outcome.created_at, outcome.classifier_import_run_id
    LIMIT 1;

    IF NOT FOUND THEN
      selected_source_slug := p_approved_category_slug;
    END IF;
  END IF;

  SELECT product.id, product.seller_id
  INTO selected_product_id, selected_product_seller_id
  FROM public.products AS product
  WHERE product.classifier_organization_id = selected_run.classifier_organization_id
    AND product.classifier_group_id = p_classifier_group_id;

  IF selected_product_id IS NOT NULL
    AND selected_product_seller_id <> selected_run.seller_id
  THEN
    stable_error := 'product_draft_source_conflict';
  ELSIF selected_product_id IS NULL THEN
    IF selected_source_slug IS NOT NULL THEN
      SELECT category.*
      INTO selected_category
      FROM public.categories AS category
      WHERE category.slug = selected_source_slug
        AND EXISTS (
          SELECT 1
          FROM public.categories AS parent_category
          WHERE parent_category.id = category.parent_id
            AND parent_category.slug = 'fashion'
            AND parent_category.parent_id IS NULL
        );
    END IF;

    selected_product_id := pg_catalog.gen_random_uuid();
    INSERT INTO public.products (
      id,
      seller_id,
      category_id,
      product_code,
      title,
      status,
      classifier_organization_id,
      classifier_group_id
    )
    VALUES (
      selected_product_id,
      selected_run.seller_id,
      selected_category.id,
      NULL,
      '',
      'draft',
      selected_run.classifier_organization_id,
      p_classifier_group_id
    );
  END IF;

  IF stable_error IS NOT NULL THEN
    INSERT INTO public.classifier_import_group_outcomes AS outcome (
      classifier_import_run_id,
      classifier_group_id,
      product_draft_id,
      approved_category_slug,
      source_cover_classifier_image_id,
      status,
      error_code,
      retryable
    )
    VALUES (
      p_import_id,
      p_classifier_group_id,
      NULL,
      selected_source_slug,
      p_source_cover_classifier_image_id,
      'failed',
      stable_error,
      false
    )
    ON CONFLICT (classifier_import_run_id, classifier_group_id)
    DO UPDATE SET
      product_draft_id = NULL,
      source_cover_classifier_image_id = EXCLUDED.source_cover_classifier_image_id,
      status = 'failed',
      error_code = EXCLUDED.error_code,
      retryable = false;

    RETURN QUERY SELECT stable_error, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.classifier_import_group_outcomes AS outcome (
    classifier_import_run_id,
    classifier_group_id,
    product_draft_id,
    approved_category_slug,
    source_cover_classifier_image_id,
    status,
    error_code,
    retryable
  )
  VALUES (
    p_import_id,
    p_classifier_group_id,
    selected_product_id,
    selected_source_slug,
    p_source_cover_classifier_image_id,
    'pending',
    NULL,
    false
  )
  ON CONFLICT (classifier_import_run_id, classifier_group_id)
  DO UPDATE SET
    product_draft_id = EXCLUDED.product_draft_id,
    source_cover_classifier_image_id = EXCLUDED.source_cover_classifier_image_id,
    status = 'pending',
    error_code = NULL,
    retryable = false;

  RETURN QUERY SELECT 'prepared'::text, selected_product_id;
END;
$$;

COMMIT;
