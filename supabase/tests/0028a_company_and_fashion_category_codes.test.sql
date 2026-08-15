BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(25);

SELECT is(public.derive_company_code_base('Kesar Textiles'), 'KES', 'Kesar fixture');
SELECT is(public.derive_company_code_base('Jaipur Handicrafts Co.'), 'JDO', 'Jaipur fixture');
SELECT is(public.derive_company_code_base('Aroma Naturals'), 'AAS', 'Aroma fixture');
SELECT is(public.derive_company_code_base('Árömà Naturals'), 'AAS', 'diacritics are removed');
SELECT is(public.derive_company_code_base('ABCD'), 'ABD', 'even-length names use the lower middle character');
SELECT is(public.derive_company_code_base('A!'), NULL, 'short normalized names have no proposal');

SELECT is(
  (SELECT count(*)::integer FROM public.sellers),
  0,
  'fresh migration replays do not create pre-moderation seller fixtures'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.sellers
    WHERE company_code IS NULL
      OR company_code !~ '^[A-Z0-9]{3}[0-9]*$'
      OR char_length(company_code) > 10
  )
  AND (
    SELECT count(*) = count(DISTINCT company_code)
    FROM public.sellers
  ),
  'seller company codes are present, valid, and unique'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'sellers'
      AND indexname = 'sellers_owner_unique'
      AND indexdef LIKE '%WHERE (owner_id IS NOT NULL)%'
  ),
  'one owned seller is enforced by a partial unique index'
);

SELECT results_eq(
  $$
    SELECT category.slug, category.product_code_prefix, parent.slug
    FROM public.categories AS category
    LEFT JOIN public.categories AS parent ON parent.id = category.parent_id
    WHERE category.product_code_prefix IS NOT NULL
    ORDER BY category.slug
  $$,
  $$
    VALUES
      ('blazers'::text, 'BLZ'::text, 'fashion'::text),
      ('cardigans'::text, 'CRD'::text, 'fashion'::text),
      ('coats'::text, 'COA'::text, 'fashion'::text),
      ('dresses'::text, 'DRS'::text, 'fashion'::text),
      ('fashion'::text, 'F'::text, NULL::text),
      ('hoodies'::text, 'HOD'::text, 'fashion'::text),
      ('jackets'::text, 'JKT'::text, 'fashion'::text),
      ('jeans'::text, 'JNS'::text, 'fashion'::text),
      ('leggings'::text, 'LEG'::text, 'fashion'::text),
      ('shorts'::text, 'SHT'::text, 'fashion'::text),
      ('skirts'::text, 'SKT'::text, 'fashion'::text),
      ('sportswear'::text, 'SPW'::text, 'fashion'::text),
      ('sweaters'::text, 'SWE'::text, 'fashion'::text),
      ('sweatpants'::text, 'SWP'::text, 'fashion'::text),
      ('sweatshirts'::text, 'SWS'::text, 'fashion'::text),
      ('t-shirts'::text, 'TSH'::text, 'fashion'::text),
      ('tracksuit-sets'::text, 'TSS'::text, 'fashion'::text),
      ('trousers'::text, 'TRO'::text, 'fashion'::text),
      ('vests'::text, 'VST'::text, 'fashion'::text)
  $$,
  'Fashion and all supported product categories have exact immutable codes'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.sellers', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.sellers', 'DELETE')
  AND NOT has_column_privilege('authenticated', 'public.sellers', 'name', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.sellers', 'company_code', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.sellers', 'company_code_locked_at', 'UPDATE'),
  'browser callers cannot directly mutate seller identity or profile columns'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.create_seller_with_company_code(uuid,text,text,text,text,uuid,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.create_seller_with_company_code(uuid,text,text,text,text,uuid,text,text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.update_unlocked_seller_company_code(text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.update_unlocked_seller_company_code(text)',
    'EXECUTE'
  ),
  'protected creation and editing operations have distinct role grants'
);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  (
    '28a00000-0000-0000-0000-000000000101', 'authenticated', 'authenticated',
    'qa-0028a-one@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '28a00000-0000-0000-0000-000000000102', 'authenticated', 'authenticated',
    'qa-0028a-two@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '28a00000-0000-0000-0000-000000000103', 'authenticated', 'authenticated',
    'qa-0028a-three@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

CREATE TEMP TABLE qa_0028a_first AS
SELECT *
FROM public.create_seller_with_company_code(
  '28a00000-0000-0000-0000-000000000101',
  'Kesar Textiles',
  'qa-company',
  NULL,
  NULL,
  (SELECT id FROM public.categories WHERE slug = 'fashion'),
  NULL,
  'KES'
);

CREATE TEMP TABLE qa_0028a_second AS
SELECT *
FROM public.create_seller_with_company_code(
  '28a00000-0000-0000-0000-000000000102',
  'Kesar Textiles',
  'qa-company',
  NULL,
  NULL,
  (SELECT id FROM public.categories WHERE slug = 'fashion'),
  NULL,
  'KES'
);

SELECT is((SELECT company_code FROM qa_0028a_first), 'KES', 'the first automatic code uses its base');
SELECT is((SELECT company_code FROM qa_0028a_second), 'KES2', 'automatic collision gets suffix two');
SELECT is((SELECT slug FROM qa_0028a_second), 'qa-company-2', 'slug collisions are serialized and suffixed');

SELECT is(
  (
    SELECT id
    FROM public.create_seller_with_company_code(
      '28a00000-0000-0000-0000-000000000101',
      '',
      '',
      NULL,
      NULL,
      NULL,
      NULL,
      ''
    )
  ),
  (SELECT id FROM qa_0028a_first),
  'existing-owner onboarding is idempotent before current input validation'
);

SELECT is(
  (SELECT count(*)::integer FROM public.sellers WHERE owner_id = '28a00000-0000-0000-0000-000000000101'),
  1,
  'idempotent onboarding keeps one seller for an owner'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.create_seller_with_company_code(
      '28a00000-0000-0000-0000-000000000103',
      'Different Company',
      'different-company',
      NULL,
      NULL,
      (SELECT id FROM public.categories WHERE slug = 'fashion'),
      NULL,
      'KES'
    )
  $$,
  '23505',
  'seller_company_code_taken',
  'a deliberate duplicate is rejected rather than renamed'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.create_seller_with_company_code(
      '28a00000-0000-0000-0000-000000000103',
      'Different Company',
      'different-company',
      NULL,
      NULL,
      (SELECT id FROM public.categories WHERE slug = 't-shirts'),
      NULL,
      'DIF'
    )
  $$,
  '22023',
  'seller_business_category_not_supported',
  'onboarding accepts only the Fashion business root'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '28a00000-0000-0000-0000-000000000101',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT company_code FROM public.update_unlocked_seller_company_code(' q91 ')),
  'Q91',
  'an authenticated owner can update an unlocked code'
);

SELECT throws_ok(
  $$ SELECT * FROM public.update_unlocked_seller_company_code('KES2') $$,
  '23505',
  'seller_company_code_taken',
  'an unlocked edit cannot take another seller code'
);

RESET ROLE;
UPDATE public.sellers
SET company_code_locked_at = now()
WHERE owner_id = '28a00000-0000-0000-0000-000000000101';

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT * FROM public.update_unlocked_seller_company_code('Q92') $$,
  '23514',
  'seller_company_code_locked',
  'an allocated seller code cannot be changed'
);
RESET ROLE;

SELECT throws_ok(
  $$
    UPDATE public.categories
    SET product_code_prefix = 'NEW'
    WHERE slug = 't-shirts'
  $$,
  '23514',
  'category_code_immutable',
  'assigned category codes cannot be changed'
);

SELECT throws_ok(
  $$
    UPDATE public.categories
    SET parent_id = NULL
    WHERE slug = 't-shirts'
  $$,
  '23514',
  'category_code_immutable',
  'coded product categories cannot leave their assigned root'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.user_roles
    WHERE user_id IN (
      '28a00000-0000-0000-0000-000000000101',
      '28a00000-0000-0000-0000-000000000102'
    )
      AND role = 'seller'
  ),
  2,
  'successful onboarding atomically assigns the seller role'
);

SELECT * FROM finish();
ROLLBACK;
