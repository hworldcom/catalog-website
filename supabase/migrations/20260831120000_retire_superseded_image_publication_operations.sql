-- The versioned product-activation workflow replaced these operations in
-- 0040c. Keep their definitions for generated-type compatibility while old
-- clients are removed, but prevent the service role from invoking functions
-- whose bodies target the retired publication-run schema.
DO $$
DECLARE
  operation record;
BEGIN
  FOR operation IN
    SELECT
      namespace.nspname,
      procedure.proname,
      pg_catalog.oidvectortypes(procedure.proargtypes) AS argument_types
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = ANY (ARRAY[
        'archive_initial_product_draft',
        'archive_seller_product',
        'authorize_product_publication_with_correlation',
        'authorize_seller_product_publication',
        'clear_product_image_publication_object_ownership',
        'complete_product_image_publication_cleanup',
        'fail_claimed_product_image_publication',
        'fail_product_image_publication_attempt',
        'finalize_product_image_publication_cleanup',
        'finalize_seller_product_publication',
        'mark_product_image_publication_dispatch_failed',
        'record_product_image_publication_object_created',
        'retry_product_image_publication',
        'retry_product_publication_with_correlation',
        'verify_product_image_publication_item'
      ]::text[])
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated, service_role',
      operation.nspname,
      operation.proname,
      operation.argument_types
    );
  END LOOP;
END;
$$;
