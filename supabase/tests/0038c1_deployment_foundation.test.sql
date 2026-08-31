BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(12);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_extension extension
    JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
    WHERE extension.extname = 'unaccent'
      AND namespace.nspname = 'extensions'
  ),
  'unaccent is installed in the extensions schema'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_extension extension
    JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
    WHERE extension.extname = 'pgcrypto'
      AND namespace.nspname = 'extensions'
  ),
  'pgcrypto is installed in the extensions schema'
);

SELECT results_eq(
  $$
    SELECT public, file_size_limit, allowed_mime_types
    FROM storage.buckets
    WHERE id = 'product-images'
  $$,
  $$
    VALUES (
      true,
      20971520::bigint,
      ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    )
  $$,
  'published product images use the exact public bucket contract'
);

SELECT results_eq(
  $$
    SELECT public, file_size_limit, allowed_mime_types
    FROM storage.buckets
    WHERE id = 'product-draft-images'
  $$,
  $$
    VALUES (
      false,
      20971520::bigint,
      ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    )
  $$,
  'draft product images use the exact private bucket contract'
);

SELECT results_eq(
  $$
    SELECT public, file_size_limit, allowed_mime_types
    FROM storage.buckets
    WHERE id = 'seller-profile-images'
  $$,
  $$
    VALUES (
      false,
      20971520::bigint,
      ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    )
  $$,
  'seller profile images use the exact private bucket contract'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM supabase_migrations.schema_migrations
  ),
  77,
  'the complete ordered migration history is registered'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version::text = '20260831120000'
  ),
  'the latest local migration is registered'
);

SELECT ok(
  NOT has_function_privilege(
    'service_role',
    'public.authorize_product_publication_with_correlation(uuid,uuid,boolean,text,boolean,text,uuid,integer,text,numeric,text,public.stock_status,boolean,text,boolean,text[],uuid,text)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'service_role',
      'public.finalize_seller_product_publication(uuid,uuid,uuid)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'service_role',
      'public.retry_product_publication_with_correlation(uuid,uuid,uuid,text)',
      'EXECUTE'
    ),
  'superseded image-publication operations are not callable by the service role'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND relation.relrowsecurity
  ),
  'storage objects have row-level security enabled'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND policy.roles && ARRAY['anon', 'authenticated']::name[]
  ),
  0,
  'browser roles have no direct storage mutation policy'
);

SELECT ok(
  has_table_privilege('service_role', 'storage.objects', 'INSERT')
    AND has_table_privilege('service_role', 'storage.objects', 'UPDATE')
    AND has_table_privilege('service_role', 'storage.objects', 'DELETE'),
  'the service role retains storage mutation grants'
);

SELECT ok(
  NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'anon')
    AND NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'authenticated'),
  'browser roles cannot bypass row-level security'
);

SELECT * FROM finish();
ROLLBACK;
