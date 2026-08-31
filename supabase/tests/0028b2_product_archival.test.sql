BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(6);

SELECT has_function(
  'public',
  'archive_seller_product',
  ARRAY['uuid', 'uuid'],
  'the historical archive operation remains identifiable during compatibility cleanup'
);

SELECT ok(
  (
    SELECT procedure.prosecdef
      AND procedure.proconfig = ARRAY['search_path=""']::text[]
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'archive_seller_product'
      AND procedure.proargtypes = '2950 2950'::oidvector
  ),
  'the historical archive operation retains its hardened function definition'
);

SELECT ok(
  NOT has_function_privilege(
    'service_role',
    'public.archive_seller_product(uuid,uuid)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'anon',
      'public.archive_seller_product(uuid,uuid)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.archive_seller_product(uuid,uuid)',
      'EXECUTE'
    ),
  'the superseded archive operation is not callable by application roles'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.products', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.products', 'DELETE'),
  'browser roles cannot hard-delete products'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'Products: owner can delete own'
  ),
  0,
  'the seller hard-delete row-level-security policy remains removed'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_trigger AS trigger
    JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'products'
      AND trigger.tgname = 'trg_products_00_archive_immutable'
      AND NOT trigger.tgisinternal
  ),
  1,
  'archive immutability remains enforced before later product triggers'
);

SELECT * FROM finish();
ROLLBACK;
