BEGIN;

CREATE OR REPLACE FUNCTION public.list_pending_product_activation_dispatches(
  p_limit integer
)
RETURNS TABLE (run_id uuid, dispatch_generation integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'product_activation_reconciliation_invalid'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT run.id, run.dispatch_generation
  FROM public.product_image_publication_runs AS run
  WHERE run.phase IN ('activation', 'pre_switch_cleanup', 'post_switch_cleanup')
    AND run.status = 'pending'
    AND run.dispatch_status = 'pending'
  ORDER BY run.created_at, run.id
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.list_pending_product_activation_dispatches(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_pending_product_activation_dispatches(integer)
  TO service_role;

COMMIT;
