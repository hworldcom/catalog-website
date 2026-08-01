BEGIN;

CREATE FUNCTION public.list_owned_classifier_import_product_drafts(
  p_seller_id uuid,
  p_import_ids uuid[]
)
RETURNS TABLE (
  classifier_import_run_id uuid,
  seller_classifier_workflow_id uuid,
  product_draft_id uuid,
  classifier_group_id uuid,
  source_group_position integer,
  title text,
  product_status public.product_status
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_seller_id IS NULL
    OR p_import_ids IS NULL
    OR cardinality(p_import_ids) < 1
    OR cardinality(p_import_ids) > 101
    OR array_position(p_import_ids, NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION 'seller_classifier_import_product_list_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.classifier_import_runs AS run
    JOIN public.classifier_import_group_outcomes AS outcome
      ON outcome.classifier_import_run_id = run.id
    LEFT JOIN public.products AS source_product
      ON source_product.classifier_organization_id =
        run.classifier_organization_id
      AND source_product.classifier_group_id = outcome.classifier_group_id
    LEFT JOIN public.products AS referenced_product
      ON referenced_product.id = outcome.product_draft_id
    WHERE run.id = ANY(p_import_ids)
      AND run.seller_id = p_seller_id
      AND run.seller_classifier_workflow_id IS NOT NULL
      AND (
        (
          source_product.id IS NOT NULL
          AND source_product.seller_id <> run.seller_id
        )
        OR
        (
          outcome.product_draft_id IS NOT NULL
          AND (
            referenced_product.id IS NULL
            OR referenced_product.seller_id <> run.seller_id
            OR referenced_product.classifier_organization_id
              IS DISTINCT FROM run.classifier_organization_id
            OR referenced_product.classifier_group_id
              IS DISTINCT FROM outcome.classifier_group_id
            OR source_product.id IS NULL
            OR source_product.id <> referenced_product.id
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'seller_classifier_import_product_source_conflict'
      USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  SELECT
    run.id,
    run.seller_classifier_workflow_id,
    product.id,
    outcome.classifier_group_id,
    outcome.source_group_position,
    product.title,
    product.status
  FROM public.classifier_import_runs AS run
  JOIN public.classifier_import_group_outcomes AS outcome
    ON outcome.classifier_import_run_id = run.id
  JOIN public.products AS product
    ON product.classifier_organization_id = run.classifier_organization_id
    AND product.classifier_group_id = outcome.classifier_group_id
    AND product.seller_id = run.seller_id
  WHERE run.id = ANY(p_import_ids)
    AND run.seller_id = p_seller_id
    AND run.seller_classifier_workflow_id IS NOT NULL
  ORDER BY
    array_position(p_import_ids, run.id),
    outcome.source_group_position NULLS LAST,
    outcome.created_at,
    outcome.classifier_group_id;
END;
$$;

REVOKE ALL
  ON FUNCTION public.list_owned_classifier_import_product_drafts(uuid, uuid[])
  FROM PUBLIC;
REVOKE ALL
  ON FUNCTION public.list_owned_classifier_import_product_drafts(uuid, uuid[])
  FROM anon;
REVOKE ALL
  ON FUNCTION public.list_owned_classifier_import_product_drafts(uuid, uuid[])
  FROM authenticated;
GRANT EXECUTE
  ON FUNCTION public.list_owned_classifier_import_product_drafts(uuid, uuid[])
  TO service_role;

COMMIT;
