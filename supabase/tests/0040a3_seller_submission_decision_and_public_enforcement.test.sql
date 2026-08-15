BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(39);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.submit_seller_profile_working_copy(uuid,bigint,uuid,uuid)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.submit_seller_profile_working_copy(uuid,bigint,uuid,uuid)',
      'EXECUTE'
    ),
  'seller submissions are service-only database operations'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.decide_seller_profile_submission(uuid,uuid,bigint,text,text,uuid,uuid)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.decide_seller_profile_submission(uuid,uuid,bigint,text,text,uuid,uuid)',
      'EXECUTE'
    ),
  'administrator decisions cannot be called through browser database roles'
);

SELECT ok(
  has_function_privilege('anon', 'public.resolve_public_seller_slug(text)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.resolve_public_seller_slug(text)', 'EXECUTE')
    AND NOT has_function_privilege(
      'service_role',
      'public.retry_product_image_publication(uuid,uuid)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.retry_product_publication_with_correlation(uuid,uuid,uuid,text)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.set_seller_storefront_enabled(uuid,boolean,uuid,uuid)',
      'EXECUTE'
    ),
  'only canonical public lookup is exposed to browser database roles'
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
    '40a30000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'qa-0040a3-owner@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '40a30000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'qa-0040a3-admin@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '40a30000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'qa-0040a3-unapproved@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

CREATE TEMP TABLE qa_0040a3_seller AS
SELECT *
FROM public.create_seller_with_company_code(
  '40a30000-0000-4000-8000-000000000001',
  'Moderated Seller',
  'moderated-seller',
  'Berlin',
  'Germany',
  (SELECT id FROM public.categories WHERE slug = 'fashion'),
  NULL,
  'MDS'
);

SELECT results_eq(
  $$
    SELECT approved_profile_submission_id, storefront_enabled, published
    FROM public.sellers
    WHERE id = (SELECT id FROM qa_0040a3_seller)
  $$,
  $$ VALUES (NULL::uuid, false, false) $$,
  'new sellers begin private and unapproved'
);

CREATE TEMP TABLE qa_0040a3_initial_submission AS
SELECT *
FROM public.submit_seller_profile_working_copy(
  (SELECT id FROM qa_0040a3_seller),
  1,
  '40a30000-0000-4000-8000-000000000101',
  '40a30000-0000-4000-8000-000000000001'
);

SELECT results_eq(
  $$ SELECT status, submission_kind, revision FROM qa_0040a3_initial_submission $$,
  $$ VALUES ('pending'::text, 'initial'::text, 1::bigint) $$,
  'submission freezes the initial working-copy revision'
);

SELECT is(
  (
    SELECT id
    FROM public.submit_seller_profile_working_copy(
      (SELECT id FROM qa_0040a3_seller),
      1,
      '40a30000-0000-4000-8000-000000000101',
      '40a30000-0000-4000-8000-000000000001'
    )
  ),
  (SELECT id FROM qa_0040a3_initial_submission),
  'exact submission replay returns the original snapshot'
);

SELECT throws_ok(
  pg_catalog.format(
    'SELECT * FROM public.save_seller_profile_working_copy(%L, 1, %L, %L, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)',
    (SELECT id FROM qa_0040a3_seller),
    'Blocked pending edit',
    'blocked-pending-edit'
  ),
  '55000',
  'seller_approval_submission_conflict',
  'pending review keeps the working copy read-only'
);

SELECT throws_ok(
  pg_catalog.format(
    'SELECT * FROM public.submit_seller_profile_working_copy(%L, 1, %L, %L)',
    (SELECT id FROM qa_0040a3_seller),
    '40a30000-0000-4000-8000-000000000102',
    '40a30000-0000-4000-8000-000000000001'
  ),
  '55000',
  'seller_approval_submission_conflict',
  'a seller cannot create a second pending submission'
);

CREATE TEMP TABLE qa_0040a3_withdrawn AS
SELECT *
FROM public.withdraw_seller_profile_submission(
  (SELECT id FROM qa_0040a3_seller),
  (SELECT id FROM qa_0040a3_initial_submission),
  1,
  '40a30000-0000-4000-8000-000000000103',
  '40a30000-0000-4000-8000-000000000001'
);

SELECT is((SELECT status FROM qa_0040a3_withdrawn), 'withdrawn', 'pending review can be withdrawn');
SELECT is(
  (
    SELECT id
    FROM public.withdraw_seller_profile_submission(
      (SELECT id FROM qa_0040a3_seller),
      (SELECT id FROM qa_0040a3_initial_submission),
      1,
      '40a30000-0000-4000-8000-000000000103',
      '40a30000-0000-4000-8000-000000000001'
    )
  ),
  (SELECT id FROM qa_0040a3_initial_submission),
  'withdrawal replay returns the original terminal submission'
);
SELECT is(
  (SELECT revision FROM public.seller_profile_working_copies WHERE seller_id = (SELECT id FROM qa_0040a3_seller)),
  2::bigint,
  'withdrawal unlocks a newer editable revision'
);

CREATE TEMP TABLE qa_0040a3_approval_working_copy AS
SELECT *
FROM public.save_seller_profile_working_copy(
  (SELECT id FROM qa_0040a3_seller),
  2,
  'Approved Seller',
  'approved-seller',
  'Hamburg',
  'Germany',
  NULL,
  'approved@example.test',
  'Approved profile snapshot',
  2024,
  NULL,
  NULL
);

SELECT is(
  (SELECT revision FROM qa_0040a3_approval_working_copy),
  3::bigint,
  'an unlocked working copy can be edited after withdrawal'
);

CREATE TEMP TABLE qa_0040a3_approval_submission AS
SELECT *
FROM public.submit_seller_profile_working_copy(
  (SELECT id FROM qa_0040a3_seller),
  3,
  '40a30000-0000-4000-8000-000000000104',
  '40a30000-0000-4000-8000-000000000001'
);

SELECT throws_ok(
  pg_catalog.format(
    'SELECT * FROM public.decide_seller_profile_submission(%L, %L, 3, %L, %L, %L, %L)',
    (SELECT id FROM qa_0040a3_seller),
    (SELECT id FROM qa_0040a3_approval_submission),
    'approve',
    'Approval reason is not accepted',
    '40a30000-0000-4000-8000-000000000105',
    '40a30000-0000-4000-8000-000000000002'
  ),
  '22023',
  'seller_approval_submission_invalid',
  'approval rejects administrator reason text'
);

CREATE TEMP TABLE qa_0040a3_approved AS
SELECT *
FROM public.decide_seller_profile_submission(
  (SELECT id FROM qa_0040a3_seller),
  (SELECT id FROM qa_0040a3_approval_submission),
  3,
  'approve',
  NULL,
  '40a30000-0000-4000-8000-000000000106',
  '40a30000-0000-4000-8000-000000000002'
);

SELECT is((SELECT status FROM qa_0040a3_approved), 'approved', 'administrator approval is durable');
SELECT results_eq(
  $$
    SELECT name, slug, approved_profile_submission_id
    FROM public.sellers
    WHERE id = (SELECT id FROM qa_0040a3_seller)
  $$,
  $$
    SELECT 'Approved Seller'::text, 'approved-seller'::text, id
    FROM qa_0040a3_approval_submission
  $$,
  'approval atomically promotes the reviewed snapshot'
);
SELECT results_eq(
  $$
    SELECT storefront_enabled, published
    FROM public.sellers
    WHERE id = (SELECT id FROM qa_0040a3_seller)
  $$,
  $$ VALUES (false, false) $$,
  'approval does not silently enable the storefront'
);
SELECT is(
  (SELECT revision FROM public.seller_profile_working_copies WHERE seller_id = (SELECT id FROM qa_0040a3_seller)),
  4::bigint,
  'approval initializes the next editable revision'
);
SELECT is(
  (
    SELECT id
    FROM public.decide_seller_profile_submission(
      (SELECT id FROM qa_0040a3_seller),
      (SELECT id FROM qa_0040a3_approval_submission),
      3,
      'approve',
      NULL,
      '40a30000-0000-4000-8000-000000000106',
      '40a30000-0000-4000-8000-000000000002'
    )
  ),
  (SELECT id FROM qa_0040a3_approval_submission),
  'exact administrator decision replay returns the original result'
);
SELECT throws_ok(
  pg_catalog.format(
    'SELECT * FROM public.decide_seller_profile_submission(%L, %L, 3, %L, NULL, %L, %L)',
    (SELECT id FROM qa_0040a3_seller),
    (SELECT id FROM qa_0040a3_approval_submission),
    'approve',
    '40a30000-0000-4000-8000-000000000107',
    '40a30000-0000-4000-8000-000000000002'
  ),
  '40001',
  'seller_profile_revision_conflict',
  'a stale decision cannot replace a completed decision'
);

CREATE TEMP TABLE qa_0040a3_enabled AS
SELECT *
FROM public.set_seller_storefront_enabled(
  (SELECT id FROM qa_0040a3_seller),
  true,
  '40a30000-0000-4000-8000-000000000108',
  '40a30000-0000-4000-8000-000000000001'
);

SELECT results_eq(
  $$ SELECT storefront_enabled, published FROM qa_0040a3_enabled $$,
  $$ VALUES (true, true) $$,
  'an approved seller can enable the public storefront'
);
SELECT results_eq(
  $$ SELECT canonical_slug, is_alias FROM public.resolve_public_seller_slug('approved-seller') $$,
  $$ VALUES ('approved-seller'::text, false) $$,
  'canonical lookup resolves the enabled approved seller'
);
SELECT is(
  (
    SELECT published
    FROM public.set_seller_storefront_enabled(
      (SELECT id FROM qa_0040a3_seller),
      true,
      '40a30000-0000-4000-8000-000000000108',
      '40a30000-0000-4000-8000-000000000001'
    )
  ),
  true,
  'storefront preference replay preserves its original successful outcome'
);

CREATE TEMP TABLE qa_0040a3_slug_working_copy AS
SELECT *
FROM public.save_seller_profile_working_copy(
  (SELECT id FROM qa_0040a3_seller),
  4,
  'Approved Seller',
  'canonical-seller',
  'Hamburg',
  'Germany',
  NULL,
  'approved@example.test',
  'Approved profile snapshot',
  2024,
  NULL,
  NULL
);
CREATE TEMP TABLE qa_0040a3_slug_submission AS
SELECT *
FROM public.submit_seller_profile_working_copy(
  (SELECT id FROM qa_0040a3_seller),
  5,
  '40a30000-0000-4000-8000-000000000109',
  '40a30000-0000-4000-8000-000000000001'
);
CREATE TEMP TABLE qa_0040a3_slug_approved AS
SELECT *
FROM public.decide_seller_profile_submission(
  (SELECT id FROM qa_0040a3_seller),
  (SELECT id FROM qa_0040a3_slug_submission),
  5,
  'approve',
  NULL,
  '40a30000-0000-4000-8000-000000000110',
  '40a30000-0000-4000-8000-000000000002'
);

SELECT is(
  (SELECT slug FROM public.sellers WHERE id = (SELECT id FROM qa_0040a3_seller)),
  'canonical-seller',
  'a later approved profile may change the canonical slug'
);
SELECT results_eq(
  $$ SELECT canonical_slug, is_alias FROM public.resolve_public_seller_slug('approved-seller') $$,
  $$ VALUES ('canonical-seller'::text, true) $$,
  'the previous approved slug remains a public alias'
);
SELECT results_eq(
  $$ SELECT canonical_slug, is_alias FROM public.resolve_public_seller_slug('canonical-seller') $$,
  $$ VALUES ('canonical-seller'::text, false) $$,
  'the replacement slug resolves canonically'
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
SELECT
  '40a30000-0000-4000-8000-000000000201',
  id,
  'logo',
  id::text || '/40a30000-0000-4000-8000-000000000201.png',
  'logo.png',
  'image/png',
  128,
  'available',
  '40a30000-0000-4000-8000-000000000202'
FROM qa_0040a3_seller;

CREATE TEMP TABLE qa_0040a3_media_working_copy AS
SELECT *
FROM public.save_seller_profile_working_copy(
  (SELECT id FROM qa_0040a3_seller),
  6,
  'Approved Seller',
  'canonical-seller',
  'Hamburg',
  'Germany',
  NULL,
  'approved@example.test',
  'Pending media review',
  2024,
  '40a30000-0000-4000-8000-000000000201',
  NULL
);
CREATE TEMP TABLE qa_0040a3_media_submission AS
SELECT *
FROM public.submit_seller_profile_working_copy(
  (SELECT id FROM qa_0040a3_seller),
  7,
  '40a30000-0000-4000-8000-000000000203',
  '40a30000-0000-4000-8000-000000000001'
);

SELECT throws_ok(
  $$
    UPDATE public.seller_profile_assets
    SET status = 'deleting'
    WHERE id = '40a30000-0000-4000-8000-000000000201'
  $$,
  '55000',
  'seller_profile_image_not_ready',
  'submitted or working-copy media cannot be reassigned or removed'
);
SELECT throws_ok(
  pg_catalog.format(
    'SELECT * FROM public.decide_seller_profile_submission(%L, %L, 7, %L, NULL, %L, %L)',
    (SELECT id FROM qa_0040a3_seller),
    (SELECT id FROM qa_0040a3_media_submission),
    'request_changes',
    '40a30000-0000-4000-8000-000000000204',
    '40a30000-0000-4000-8000-000000000002'
  ),
  '22023',
  'seller_approval_submission_invalid',
  'request-changes decisions require a seller-visible custom reason'
);
CREATE TEMP TABLE qa_0040a3_changes_requested AS
SELECT *
FROM public.decide_seller_profile_submission(
  (SELECT id FROM qa_0040a3_seller),
  (SELECT id FROM qa_0040a3_media_submission),
  7,
  'request_changes',
  'Please replace the logo with a higher-resolution image.',
  '40a30000-0000-4000-8000-000000000205',
  '40a30000-0000-4000-8000-000000000002'
);
SELECT results_eq(
  $$ SELECT status, seller_visible_reason FROM qa_0040a3_changes_requested $$,
  $$ VALUES ('changes_requested'::text, 'Please replace the logo with a higher-resolution image.'::text) $$,
  'request changes records the custom administrator reason'
);
SELECT is(
  (SELECT slug FROM public.sellers WHERE id = (SELECT id FROM qa_0040a3_seller)),
  'canonical-seller',
  'request changes leaves the previously approved public profile unchanged'
);

CREATE TEMP TABLE qa_0040a3_conflicting_slug_working_copy AS
SELECT *
FROM public.save_seller_profile_working_copy(
  (SELECT id FROM qa_0040a3_seller),
  8,
  'Approved Seller',
  'future-canonical-seller',
  'Hamburg',
  'Germany',
  NULL,
  'approved@example.test',
  'Profile awaiting a collision check',
  2024,
  '40a30000-0000-4000-8000-000000000201',
  NULL
);
CREATE TEMP TABLE qa_0040a3_conflicting_slug_submission AS
SELECT *
FROM public.submit_seller_profile_working_copy(
  (SELECT id FROM qa_0040a3_seller),
  9,
  '40a30000-0000-4000-8000-000000000206',
  '40a30000-0000-4000-8000-000000000001'
);

CREATE TEMP TABLE qa_0040a3_unapproved_seller AS
SELECT *
FROM public.create_seller_with_company_code(
  '40a30000-0000-4000-8000-000000000003',
  'Unapproved Seller',
  'future-canonical-seller',
  NULL,
  NULL,
  (SELECT id FROM public.categories WHERE slug = 'fashion'),
  NULL,
  'UNS'
);

SELECT throws_ok(
  pg_catalog.format(
    'SELECT * FROM public.decide_seller_profile_submission(%L, %L, 9, %L, NULL, %L, %L)',
    (SELECT id FROM qa_0040a3_seller),
    (SELECT id FROM qa_0040a3_conflicting_slug_submission),
    'approve',
    '40a30000-0000-4000-8000-000000000207',
    '40a30000-0000-4000-8000-000000000002'
  ),
  '23505',
  'seller_profile_slug_conflict',
  'approval rechecks slug availability after submission'
);
SELECT ok(
  (
    SELECT status = 'pending'
    FROM public.seller_profile_submissions
    WHERE id = (SELECT id FROM qa_0040a3_conflicting_slug_submission)
  )
    AND (
      SELECT slug = 'canonical-seller'
      FROM public.sellers
      WHERE id = (SELECT id FROM qa_0040a3_seller)
    ),
  'a failed approval keeps the submission pending and public profile unchanged'
);
SELECT throws_ok(
  pg_catalog.format(
    'SELECT * FROM public.save_seller_profile_working_copy(%L, 9, %L, %L, NULL, NULL, NULL, NULL, NULL, NULL, %L, NULL)',
    (SELECT id FROM qa_0040a3_seller),
    'Blocked after failed approval',
    'blocked-after-failed-approval',
    '40a30000-0000-4000-8000-000000000201'
  ),
  '55000',
  'seller_approval_submission_conflict',
  'a failed decision keeps the pending working copy read-only'
);

INSERT INTO public.products (
  id,
  seller_id,
  category_id,
  product_code,
  title,
  title_source,
  status
)
SELECT
  '40a30000-0000-4000-8000-000000000301',
  seller.id,
  category.id,
  public.reserve_product_code(
    '40a30000-0000-4000-8000-000000000301',
    seller.id,
    category.id
  ),
  'Private draft',
  'human',
  'draft'
FROM qa_0040a3_unapproved_seller AS seller
CROSS JOIN public.categories AS category
WHERE category.slug = 't-shirts';
INSERT INTO public.product_audience_memberships (product_id, audience)
VALUES ('40a30000-0000-4000-8000-000000000301', 'women');
INSERT INTO public.direct_product_legacy_cover_allowances (
  product_draft_id,
  recorded_cover_image_url
)
VALUES (
  '40a30000-0000-4000-8000-000000000301',
  'https://example.test/qa-0040a3-unapproved.jpg'
);

SELECT throws_ok(
  $$
    UPDATE public.products
    SET status = 'published',
        cover_image_url = 'https://example.test/qa-0040a3-unapproved.jpg'
    WHERE id = '40a30000-0000-4000-8000-000000000301'
  $$,
  '23514',
  'seller_approval_required',
  'direct product publication cannot bypass seller approval'
);
SELECT is(
  (
    SELECT result
    FROM public.authorize_seller_product_publication(
      '40a30000-0000-4000-8000-000000000301',
      (SELECT id FROM qa_0040a3_unapproved_seller),
      false,
      NULL,
      false,
      NULL,
      NULL,
      1,
      NULL,
      NULL,
      'USD',
      'in_stock',
      false,
      NULL,
      false
    )
  ),
  'seller_approval_required',
  'protected product authorization rechecks seller approval'
);

INSERT INTO public.products (
  id,
  seller_id,
  category_id,
  product_code,
  title,
  title_source,
  status
)
SELECT
  '40a30000-0000-4000-8000-000000000302',
  seller.id,
  category.id,
  public.reserve_product_code(
    '40a30000-0000-4000-8000-000000000302',
    seller.id,
    category.id
  ),
  'Approved seller product',
  'human',
  'draft'
FROM qa_0040a3_seller AS seller
CROSS JOIN public.categories AS category
WHERE category.slug = 't-shirts';

INSERT INTO public.product_audience_memberships (product_id, audience)
VALUES ('40a30000-0000-4000-8000-000000000302', 'women');
INSERT INTO public.direct_product_legacy_cover_allowances (
  product_draft_id,
  recorded_cover_image_url
)
VALUES (
  '40a30000-0000-4000-8000-000000000302',
  'https://example.test/qa-0040a3-product.jpg'
);
UPDATE public.products
SET status = 'published',
    cover_image_url = 'https://example.test/qa-0040a3-product.jpg'
WHERE id = '40a30000-0000-4000-8000-000000000302';
INSERT INTO public.product_images (id, product_id, url, sort_order)
VALUES (
  '40a30000-0000-4000-8000-000000000303',
  '40a30000-0000-4000-8000-000000000302',
  'https://example.test/qa-0040a3-product.jpg',
  0
);

GRANT SELECT ON qa_0040a3_seller TO anon;
SET LOCAL ROLE anon;
SELECT ok(
  (SELECT count(*) = 1 FROM public.sellers WHERE id = (SELECT id FROM qa_0040a3_seller))
    AND (SELECT count(*) = 1 FROM public.products WHERE id = '40a30000-0000-4000-8000-000000000302')
    AND (SELECT count(*) = 1 FROM public.product_images WHERE id = '40a30000-0000-4000-8000-000000000303'),
  'enabled approved sellers and their catalog records are public'
);
RESET ROLE;

CREATE TEMP TABLE qa_0040a3_disabled AS
SELECT *
FROM public.set_seller_storefront_enabled(
  (SELECT id FROM qa_0040a3_seller),
  false,
  '40a30000-0000-4000-8000-000000000401',
  '40a30000-0000-4000-8000-000000000001'
);
SELECT results_eq(
  $$ SELECT storefront_enabled, published FROM qa_0040a3_disabled $$,
  $$ VALUES (false, false) $$,
  'an approved seller can disable the storefront without losing approval'
);

SET LOCAL ROLE anon;
SELECT ok(
  (SELECT count(*) = 0 FROM public.sellers WHERE id = (SELECT id FROM qa_0040a3_seller))
    AND (SELECT count(*) = 0 FROM public.products WHERE id = '40a30000-0000-4000-8000-000000000302')
    AND (SELECT count(*) = 0 FROM public.product_images WHERE id = '40a30000-0000-4000-8000-000000000303'),
  'disabled storefronts hide seller, product, and image records together'
);
SELECT ok(
  (SELECT count(*) > 0 FROM public.categories),
  'storefront enforcement keeps taxonomy rows public'
);
SELECT is(
  (SELECT count(*)::integer FROM public.resolve_public_seller_slug('canonical-seller')),
  0,
  'disabled sellers cannot resolve through canonical public lookup'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
