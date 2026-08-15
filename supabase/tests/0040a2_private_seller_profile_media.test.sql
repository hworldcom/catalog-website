BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(28);

SELECT has_table('public', 'seller_profile_assets', 'seller profile assets are durable');
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'seller-profile-images'),
  false,
  'seller profile images use a private bucket'
);
SELECT results_eq(
  $$
    SELECT file_size_limit, allowed_mime_types
    FROM storage.buckets
    WHERE id = 'seller-profile-images'
  $$,
  $$
    VALUES (
      20971520::bigint,
      ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    )
  $$,
  'the private bucket enforces the exact size and type contract'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.seller_profile_assets', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.seller_profile_assets', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.seller_profile_assets', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.seller_profile_assets', 'DELETE'),
  'browser roles cannot read or mutate profile assets directly'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.prepare_seller_profile_asset_upload(uuid,text,text,text,bigint,uuid)',
    'EXECUTE'
  )
    AND has_function_privilege(
      'service_role',
      'public.read_public_seller_profile_asset(uuid,text,bigint)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.prepare_seller_profile_asset_upload(uuid,text,text,text,bigint,uuid)',
      'EXECUTE'
    ),
  'profile asset operations are service-only'
);

INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
  (
    '40a20000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'qa-0040a2-owner@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '40a20000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'qa-0040a2-other@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

CREATE TEMP TABLE qa_0040a2_owner AS
SELECT *
FROM public.create_seller_with_company_code(
  '40a20000-0000-4000-8000-000000000001',
  'Private Media Seller',
  'private-media-seller',
  NULL,
  NULL,
  (SELECT id FROM public.categories WHERE slug = 'fashion'),
  NULL,
  'PMS'
);

CREATE TEMP TABLE qa_0040a2_other AS
SELECT *
FROM public.create_seller_with_company_code(
  '40a20000-0000-4000-8000-000000000002',
  'Other Media Seller',
  'other-media-seller',
  NULL,
  NULL,
  (SELECT id FROM public.categories WHERE slug = 'fashion'),
  NULL,
  'OMS'
);

CREATE TEMP TABLE qa_0040a2_logo AS
SELECT *
FROM public.prepare_seller_profile_asset_upload(
  (SELECT id FROM qa_0040a2_owner),
  'logo',
  ' logo.png ',
  'IMAGE/PNG',
  128,
  '40a20000-0000-4000-8000-000000000101'
);

SELECT is((SELECT status FROM qa_0040a2_logo), 'pending', 'prepare creates pending state');
SELECT is(
  (SELECT object_key FROM qa_0040a2_logo),
  (SELECT id::text FROM qa_0040a2_owner) || '/' || (SELECT id::text FROM qa_0040a2_logo) || '.png',
  'the server-generated object key stays under the seller identifier'
);
SELECT is(
  (
    SELECT id
    FROM public.prepare_seller_profile_asset_upload(
      (SELECT id FROM qa_0040a2_owner),
      'logo',
      'logo.png',
      'image/png',
      128,
      '40a20000-0000-4000-8000-000000000101'
    )
  ),
  (SELECT id FROM qa_0040a2_logo),
  'an exact prepare replay returns the same asset'
);
SELECT throws_ok(
  pg_catalog.format(
    'SELECT * FROM public.prepare_seller_profile_asset_upload(%L, %L, %L, %L, 129, %L)',
    (SELECT id FROM qa_0040a2_owner),
    'logo',
    'logo.png',
    'image/png',
    '40a20000-0000-4000-8000-000000000101'
  ),
  '23505',
  'seller_profile_image_conflict',
  'request-identifier reuse with different metadata conflicts'
);

SELECT is(
  (
    SELECT status
    FROM public.complete_seller_profile_asset_upload(
      (SELECT id FROM qa_0040a2_owner),
      (SELECT id FROM qa_0040a2_logo),
      'image/png',
      128
    )
  ),
  'available',
  'verified finalization marks the asset available'
);
SELECT is(
  (
    SELECT logo_asset_id
    FROM public.save_seller_profile_working_copy(
      (SELECT id FROM qa_0040a2_owner),
      1,
      'Private Media Seller',
      'private-media-seller',
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      (SELECT id FROM qa_0040a2_logo),
      NULL
    )
  ),
  (SELECT id FROM qa_0040a2_logo),
  'a revisioned save selects an available owned logo'
);
SELECT throws_ok(
  pg_catalog.format(
    'SELECT * FROM public.save_seller_profile_working_copy(%L, 2, %L, %L, NULL, NULL, NULL, NULL, NULL, NULL, NULL, %L)',
    (SELECT id FROM qa_0040a2_owner),
    'Private Media Seller',
    'private-media-seller',
    (SELECT id FROM qa_0040a2_logo)
  ),
  '55000',
  'seller_profile_image_not_ready',
  'a logo cannot be selected as a cover'
);
SELECT throws_ok(
  pg_catalog.format(
    'SELECT * FROM public.save_seller_profile_working_copy(%L, 1, %L, %L, NULL, NULL, NULL, NULL, NULL, NULL, %L, NULL)',
    (SELECT id FROM qa_0040a2_other),
    'Other Media Seller',
    'other-media-seller',
    (SELECT id FROM qa_0040a2_logo)
  ),
  '55000',
  'seller_profile_image_not_ready',
  'another seller cannot select the asset'
);
SELECT throws_ok(
  pg_catalog.format(
    'SELECT public.begin_seller_profile_asset_removal(%L, %L)',
    (SELECT id FROM qa_0040a2_owner),
    (SELECT id FROM qa_0040a2_logo)
  ),
  '55000',
  'seller_profile_image_not_ready',
  'a working-copy reference prevents removal'
);
SELECT is(
  (
    SELECT revision
    FROM public.save_seller_profile_working_copy(
      (SELECT id FROM qa_0040a2_owner),
      2,
      'Private Media Seller',
      'private-media-seller',
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL
    )
  ),
  3::bigint,
  'a revisioned save can detach profile media'
);
SELECT is(
  public.begin_seller_profile_asset_removal(
    (SELECT id FROM qa_0040a2_owner),
    (SELECT id FROM qa_0040a2_logo)
  )->>'result',
  'deleting',
  'unreferenced removal is claimed durably'
);
SELECT is(
  (
    SELECT error_code
    FROM public.fail_seller_profile_asset_removal(
      (SELECT id FROM qa_0040a2_owner),
      (SELECT id FROM qa_0040a2_logo)
    )
  ),
  'seller_profile_image_cleanup_required',
  'a deletion failure records its durable cleanup code'
);
SELECT throws_ok(
  pg_catalog.format(
    'SELECT public.begin_seller_profile_asset_removal(%L, %L)',
    (SELECT id FROM qa_0040a2_owner),
    (SELECT id FROM qa_0040a2_logo)
  ),
  '55000',
  'seller_profile_image_cleanup_required',
  'failed cleanup requires the explicit retry operation'
);
SELECT is(
  public.claim_seller_profile_asset_cleanup_retry(
    (SELECT id FROM qa_0040a2_owner),
    (SELECT id FROM qa_0040a2_logo)
  )->>'result',
  'deleting',
  'cleanup retry safely reclaims the failed deletion'
);
SELECT is(
  (
    SELECT status
    FROM public.complete_seller_profile_asset_removal(
      (SELECT id FROM qa_0040a2_owner),
      (SELECT id FROM qa_0040a2_logo)
    )
  ),
  'deleted',
  'verified deletion records terminal deleted state'
);
SELECT is(
  public.begin_seller_profile_asset_removal(
    (SELECT id FROM qa_0040a2_owner),
    (SELECT id FROM qa_0040a2_logo)
  )->>'result',
  'deleted',
  'removal replay is idempotent'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.read_public_seller_profile_asset(
      (SELECT id FROM qa_0040a2_owner),
      'logo',
      1
    )
  ),
  0,
  'public delivery remains unavailable before seller approval'
);

CREATE TEMP TABLE qa_0040a2_cover AS
SELECT *
FROM public.prepare_seller_profile_asset_upload(
  (SELECT id FROM qa_0040a2_owner),
  'cover',
  'cover.jpg',
  'image/jpeg',
  256,
  '40a20000-0000-4000-8000-000000000102'
);

SELECT is(
  (
    SELECT status
    FROM public.complete_seller_profile_asset_upload(
      (SELECT id FROM qa_0040a2_owner),
      (SELECT id FROM qa_0040a2_cover),
      'image/jpeg',
      256
    )
  ),
  'available',
  'cover finalization uses the same verified lifecycle'
);

INSERT INTO public.seller_profile_submissions (
  seller_id,
  revision,
  submission_kind,
  status,
  name,
  slug,
  cover_asset_id,
  seller_request_id,
  submitted_by_user_id
)
SELECT
  id,
  3,
  'initial',
  'pending',
  'Private Media Seller',
  'private-media-seller',
  (SELECT id FROM qa_0040a2_cover),
  '40a20000-0000-4000-8000-000000000103',
  '40a20000-0000-4000-8000-000000000001'
FROM qa_0040a2_owner;

SELECT throws_ok(
  pg_catalog.format(
    'SELECT public.begin_seller_profile_asset_removal(%L, %L)',
    (SELECT id FROM qa_0040a2_owner),
    (SELECT id FROM qa_0040a2_cover)
  ),
  '55000',
  'seller_profile_image_not_ready',
  'an immutable submission reference prevents removal'
);
SELECT throws_ok(
  $$
    INSERT INTO public.seller_profile_assets (
      seller_id,
      kind,
      object_key,
      original_filename,
      mime_type,
      size_bytes,
      status,
      prepare_request_id,
      error_code
    )
    SELECT
      id,
      'logo',
      id::text || '/40a20000-0000-4000-8000-000000000999.png',
      'bad.png',
      'image/png',
      1,
      'available',
      '40a20000-0000-4000-8000-000000000999',
      'seller_profile_image_invalid'
    FROM qa_0040a2_owner
  $$,
  '23514',
  NULL,
  'invalid lifecycle combinations are rejected by the database'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.read_public_seller_profile_asset(uuid,text,bigint)',
    'EXECUTE'
  ),
  'anonymous callers cannot invoke the service-only public delivery lookup directly'
);
SELECT is(
  (
    SELECT status
    FROM public.complete_seller_profile_asset_upload(
      (SELECT id FROM qa_0040a2_owner),
      (SELECT id FROM qa_0040a2_cover),
      'image/jpeg',
      256
    )
  ),
  'available',
  'finalization replay is idempotent'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.seller_profile_assets
    WHERE seller_id = (SELECT id FROM qa_0040a2_owner)
  ),
  2,
  'request replay cannot create duplicate durable assets'
);

SELECT * FROM finish();
ROLLBACK;
