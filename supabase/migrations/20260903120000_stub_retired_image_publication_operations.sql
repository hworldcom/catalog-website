BEGIN;

-- These operations remain in the schema temporarily so generated clients and
-- historical contract checks can identify them. Their original bodies refer
-- to columns removed by the versioned product-activation workflow, so replace
-- those bodies with a deterministic retirement failure.
DO $migration$
DECLARE
  operation record;
  retired_count integer := 0;
BEGIN
  FOR operation IN
    SELECT
      namespace.nspname AS schema_name,
      procedure.proname AS function_name,
      pg_catalog.pg_get_function_arguments(procedure.oid) AS function_arguments,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
      pg_catalog.pg_get_function_result(procedure.oid) AS function_result
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = ANY (ARRAY[
        'archive_seller_product',
        'authorize_product_publication_with_correlation_0039a_legacy',
        'authorize_seller_product_publication_0027d_legacy',
        'authorize_seller_product_publication_0040a3_legacy',
        'clear_product_image_publication_object_ownership',
        'complete_product_image_publication_cleanup',
        'fail_claimed_product_image_publication',
        'fail_product_image_publication_attempt',
        'finalize_product_image_publication_cleanup',
        'finalize_seller_product_publication_0035a1_legacy',
        'mark_product_image_publication_dispatch_failed',
        'record_product_image_publication_object_created',
        'retry_product_image_publication_0035a1_legacy',
        'retry_product_publication_with_correlation_0039a_legacy',
        'verify_product_image_publication_item'
      ]::text[])
    ORDER BY procedure.proname, procedure.oid
  LOOP
    retired_count := retired_count + 1;

    EXECUTE pg_catalog.format(
      $definition$
        CREATE OR REPLACE FUNCTION %I.%I(%s)
        RETURNS %s
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $retired$
        BEGIN
          RAISE EXCEPTION USING
            ERRCODE = '0A000',
            MESSAGE = 'product_publication_operation_retired';
        END;
        $retired$
      $definition$,
      operation.schema_name,
      operation.function_name,
      operation.function_arguments,
      operation.function_result
    );

    EXECUTE pg_catalog.format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated, service_role',
      operation.schema_name,
      operation.function_name,
      operation.identity_arguments
    );
  END LOOP;

  IF retired_count <> 15 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'retired_image_publication_operation_set_invalid';
  END IF;
END;
$migration$;

COMMIT;
