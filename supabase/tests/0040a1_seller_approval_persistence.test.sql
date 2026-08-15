BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(27);

SELECT has_table('public', 'seller_profile_working_copies', 'working copies are durable');
SELECT has_table('public', 'seller_profile_submissions', 'submissions are durable');
SELECT has_table('public', 'seller_profile_events', 'moderation events are durable');
SELECT has_table('public', 'seller_slug_aliases', 'seller slug aliases are durable');

SELECT has_column(
  'public',
  'sellers',
  'approved_profile_submission_id',
  'seller approval uses an immutable submission pointer'
);
SELECT has_column(
  'public',
  'sellers',
  'storefront_enabled',
  'storefront preference is separate from administrator approval'
);
SELECT col_default_is(
  'public',
  'sellers',
  'published',
  'false',
  'new seller identities are private by default'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.sellers', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.sellers', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.sellers', 'DELETE')
    AND NOT has_column_privilege('authenticated', 'public.sellers', 'name', 'UPDATE'),
  'authenticated browser callers cannot directly mutate seller identity'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.seller_profile_working_copies', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.seller_profile_working_copies', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.seller_profile_submissions', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.seller_profile_events', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.seller_slug_aliases', 'INSERT'),
  'moderation tables are not directly available to browser roles'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.read_seller_profile_working_copy(uuid)',
    'EXECUTE'
  )
    AND has_function_privilege(
      'service_role',
      'public.save_seller_profile_working_copy(uuid,bigint,text,text,text,text,text,text,text,integer)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.read_seller_profile_working_copy(uuid)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.save_seller_profile_working_copy(uuid,bigint,text,text,text,text,text,text,text,integer)',
      'EXECUTE'
    ),
  'working-copy operations are service-only'
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
    '40a10000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'qa-0040a1@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '40a10000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'qa-0040a1-invalid@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

SELECT throws_ok(
  $$
    SELECT *
    FROM public.create_seller_with_company_code(
      '40a10000-0000-4000-8000-000000000002',
      'Invalid Business Category',
      'invalid-business-category',
      NULL,
      NULL,
      (SELECT id FROM public.categories WHERE slug = 't-shirts'),
      NULL,
      'IBC'
    )
  $$,
  '22023',
  'seller_business_category_not_supported',
  'failed onboarding aborts the protected transaction'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.sellers
    WHERE owner_id = '40a10000-0000-4000-8000-000000000002'
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = '40a10000-0000-4000-8000-000000000002'
    ),
  'failed onboarding leaves neither seller identity nor seller role state'
);

CREATE TEMP TABLE qa_0040a1_seller AS
SELECT *
FROM public.create_seller_with_company_code(
  '40a10000-0000-4000-8000-000000000001',
  'QA Moderated Seller',
  'qa-moderated-seller',
  ' Berlin ',
  ' Germany ',
  (SELECT id FROM public.categories WHERE slug = 'fashion'),
  NULL,
  'QMS'
);

SELECT is(
  (SELECT count(*)::integer FROM public.sellers WHERE id = (SELECT id FROM qa_0040a1_seller)),
  1,
  'protected onboarding creates one seller identity'
);

SELECT results_eq(
  $$
    SELECT published, storefront_enabled, approved_profile_submission_id
    FROM public.sellers
    WHERE id = (SELECT id FROM qa_0040a1_seller)
  $$,
  $$ VALUES (false, false, NULL::uuid) $$,
  'onboarding never creates approval or public state'
);

SELECT results_eq(
  $$
    SELECT revision, name, slug, city, country
    FROM public.seller_profile_working_copies
    WHERE seller_id = (SELECT id FROM qa_0040a1_seller)
  $$,
  $$ VALUES (1::bigint, 'QA Moderated Seller'::text, 'qa-moderated-seller'::text, 'Berlin'::text, 'Germany'::text) $$,
  'onboarding creates the revision-one working copy atomically'
);

SELECT is(
  (
    SELECT revision
    FROM public.read_seller_profile_working_copy((SELECT id FROM qa_0040a1_seller))
  ),
  1::bigint,
  'the protected read returns the owned working copy'
);

INSERT INTO public.seller_profile_assets (
  id,
  seller_id,
  kind,
  object_key,
  original_filename,
  mime_type,
  size_bytes,
  status,
  prepare_request_id
)
VALUES
  (
    '40a10000-0000-4000-8000-000000000101',
    (SELECT id FROM qa_0040a1_seller),
    'logo',
    (SELECT id::text FROM qa_0040a1_seller) || '/40a10000-0000-4000-8000-000000000101.png',
    'logo.png',
    'image/png',
    128,
    'available',
    '40a10000-0000-4000-8000-000000000111'
  ),
  (
    '40a10000-0000-4000-8000-000000000102',
    (SELECT id FROM qa_0040a1_seller),
    'cover',
    (SELECT id::text FROM qa_0040a1_seller) || '/40a10000-0000-4000-8000-000000000102.jpg',
    'cover.jpg',
    'image/jpeg',
    256,
    'available',
    '40a10000-0000-4000-8000-000000000112'
  );

UPDATE public.seller_profile_working_copies
SET
  logo_asset_id = '40a10000-0000-4000-8000-000000000101',
  cover_asset_id = '40a10000-0000-4000-8000-000000000102'
WHERE seller_id = (SELECT id FROM qa_0040a1_seller);

CREATE TEMP TABLE qa_0040a1_saved AS
SELECT *
FROM public.save_seller_profile_working_copy(
  (SELECT id FROM qa_0040a1_seller),
  1,
  ' Updated Seller ',
  'updated-seller',
  ' Hamburg ',
  '',
  ' +49 123 ',
  ' OWNER@EXAMPLE.TEST ',
  ' Updated profile ',
  2020
);

SELECT results_eq(
  $$
    SELECT revision, name, city, country, email, about
    FROM qa_0040a1_saved
  $$,
  $$ VALUES (2::bigint, 'Updated Seller'::text, 'Hamburg'::text, NULL::text, 'owner@example.test'::text, 'Updated profile'::text) $$,
  'scalar saves normalize the complete profile and increment its revision'
);

SELECT results_eq(
  $$
    SELECT logo_asset_id, cover_asset_id
    FROM qa_0040a1_saved
  $$,
  $$ VALUES ('40a10000-0000-4000-8000-000000000101'::uuid, '40a10000-0000-4000-8000-000000000102'::uuid) $$,
  'scalar saves preserve media identifiers'
);

SELECT throws_ok(
  pg_catalog.format(
    'SELECT * FROM public.save_seller_profile_working_copy(%L, 1, %L, %L, NULL, NULL, NULL, NULL, NULL, NULL)',
    (SELECT id FROM qa_0040a1_seller),
    'Stale Seller',
    'stale-seller'
  ),
  '40001',
  'seller_profile_revision_conflict',
  'a stale expected revision cannot overwrite a newer save'
);

SELECT throws_ok(
  pg_catalog.format(
    'SELECT * FROM public.save_seller_profile_working_copy(%L, 2, %L, %L, NULL, NULL, NULL, NULL, NULL, NULL)',
    (SELECT id FROM qa_0040a1_seller),
    'X',
    'INVALID SLUG'
  ),
  '22023',
  'seller_approval_submission_invalid',
  'invalid scalar input is rejected by the database transaction'
);

UPDATE public.sellers
SET published = true
WHERE id = (SELECT id FROM qa_0040a1_seller);

SELECT is(
  (SELECT published FROM public.sellers WHERE id = (SELECT id FROM qa_0040a1_seller)),
  false,
  'the compatibility trigger rejects a direct public-state projection'
);

SELECT is(
  (
    SELECT id
    FROM public.create_seller_with_company_code(
      '40a10000-0000-4000-8000-000000000001',
      '',
      '',
      NULL,
      NULL,
      NULL,
      NULL,
      ''
    )
  ),
  (SELECT id FROM qa_0040a1_seller),
  'onboarding replay returns the existing atomic identity'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.seller_profile_working_copies
    WHERE seller_id = (SELECT id FROM qa_0040a1_seller)
  ),
  1,
  'onboarding replay cannot duplicate the working copy'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.read_seller_profile_working_copy('40a10000-0000-4000-8000-000000000999')
  $$,
  'P0002',
  'seller_approval_not_found',
  'an absent working copy has a stable not-found error'
);

INSERT INTO public.seller_profile_submissions (
  seller_id,
  revision,
  submission_kind,
  status,
  name,
  slug,
  city,
  country,
  whatsapp,
  email,
  about,
  logo_asset_id,
  cover_asset_id,
  established_year,
  seller_request_id,
  submitted_by_user_id
)
SELECT
  id,
  2,
  'initial',
  'pending',
  'Updated Seller',
  'updated-seller',
  'Hamburg',
  NULL,
  '+49 123',
  'owner@example.test',
  'Updated profile',
  '40a10000-0000-4000-8000-000000000101',
  '40a10000-0000-4000-8000-000000000102',
  2020,
  '40a10000-0000-4000-8000-000000000201',
  '40a10000-0000-4000-8000-000000000001'
FROM qa_0040a1_seller;

SELECT throws_ok(
  $$
    UPDATE public.seller_profile_submissions
    SET name = 'Mutated snapshot'
    WHERE seller_request_id = '40a10000-0000-4000-8000-000000000201'
  $$,
  '23514',
  'seller_profile_submission_immutable',
  'immutable submission snapshots cannot be rewritten'
);

SELECT throws_ok(
  $$
    DELETE FROM public.seller_profile_submissions
    WHERE seller_request_id = '40a10000-0000-4000-8000-000000000201'
  $$,
  '23514',
  'seller_profile_submission_immutable',
  'immutable submission history cannot be deleted'
);

SELECT throws_ok(
  $$
    INSERT INTO public.seller_profile_submissions (
      seller_id,
      revision,
      submission_kind,
      status,
      name,
      slug,
      seller_request_id,
      submitted_by_user_id
    )
    SELECT
      id,
      3,
      'initial',
      'pending',
      'Updated Seller',
      'updated-seller',
      '40a10000-0000-4000-8000-000000000202',
      '40a10000-0000-4000-8000-000000000001'
    FROM qa_0040a1_seller
  $$,
  '23505',
  NULL,
  'only one pending submission may exist for a seller'
);

SELECT * FROM finish();
ROLLBACK;
