BEGIN;

CREATE OR REPLACE FUNCTION public.read_product_activation_dispatch_health()
RETURNS TABLE (
  pending_count bigint,
  oldest_pending_created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    count(*)::bigint AS pending_count,
    min(run.created_at) AS oldest_pending_created_at
  FROM public.product_image_publication_runs AS run
  WHERE run.phase IN ('activation', 'pre_switch_cleanup', 'post_switch_cleanup')
    AND run.status = 'pending'
    AND run.dispatch_status = 'pending';
$$;

REVOKE ALL ON FUNCTION public.read_product_activation_dispatch_health()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_product_activation_dispatch_health()
  TO service_role;

COMMIT;
