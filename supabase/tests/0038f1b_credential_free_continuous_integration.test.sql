BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(3);

CREATE TEMP TABLE qa_0038f1b_retired_operations (function_name text PRIMARY KEY);
INSERT INTO qa_0038f1b_retired_operations (function_name)
VALUES
  ('archive_seller_product'),
  ('authorize_product_publication_with_correlation_0039a_legacy'),
  ('authorize_seller_product_publication_0027d_legacy'),
  ('authorize_seller_product_publication_0040a3_legacy'),
  ('clear_product_image_publication_object_ownership'),
  ('complete_product_image_publication_cleanup'),
  ('fail_claimed_product_image_publication'),
  ('fail_product_image_publication_attempt'),
  ('finalize_product_image_publication_cleanup'),
  ('finalize_seller_product_publication_0035a1_legacy'),
  ('mark_product_image_publication_dispatch_failed'),
  ('record_product_image_publication_object_created'),
  ('retry_product_image_publication_0035a1_legacy'),
  ('retry_product_publication_with_correlation_0039a_legacy'),
  ('verify_product_image_publication_item');

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    JOIN qa_0038f1b_retired_operations AS expected
      ON expected.function_name = procedure.proname
    WHERE namespace.nspname = 'public'
      AND procedure.prosrc LIKE '%product_publication_operation_retired%'
  ),
  15,
  'all retired image-publication operations have deterministic stub bodies'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    JOIN qa_0038f1b_retired_operations AS expected
      ON expected.function_name = procedure.proname
    WHERE namespace.nspname = 'public'
      AND (
        NOT procedure.prosecdef
        OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
      )
  ),
  'retired compatibility operations retain hardened definitions'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    JOIN qa_0038f1b_retired_operations AS expected
      ON expected.function_name = procedure.proname
    WHERE namespace.nspname = 'public'
      AND (
        pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
        OR pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
        OR pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE')
      )
  ),
  'retired compatibility operations remain inaccessible to application roles'
);

SELECT * FROM finish();
ROLLBACK;
