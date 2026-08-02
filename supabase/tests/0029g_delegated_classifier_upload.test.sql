BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(7);

INSERT INTO public.sellers (id, slug, name, published, company_code)
VALUES
  (
    '29f00000-0000-0000-0000-000000000001',
    'qa-0029g-beta',
    'QA 0029g Beta',
    false,
    'Q51'
  ),
  (
    '29f00000-0000-0000-0000-000000000002',
    'qa-0029g-alpha',
    'qa 0029g alpha',
    true,
    'Q52'
  ),
  (
    '29f00000-0000-0000-0000-000000000003',
    'qa-0029g-percent',
    'QA 0029g Percent %',
    true,
    'Q53'
  ),
  (
    '29f00000-0000-0000-0000-000000000004',
    'qa-0029g-underscore',
    'QA 0029g Underscore _',
    true,
    'Q54'
  );

SELECT results_eq(
  $$
    SELECT seller_id
    FROM public.search_delegated_upload_sellers('qa 0029g', 10)
  $$,
  $$
    VALUES
      ('29f00000-0000-0000-0000-000000000002'::uuid),
      ('29f00000-0000-0000-0000-000000000001'::uuid),
      ('29f00000-0000-0000-0000-000000000003'::uuid),
      ('29f00000-0000-0000-0000-000000000004'::uuid)
  $$,
  'seller search uses normalized name ordering'
);

SELECT results_eq(
  $$
    SELECT seller_id
    FROM public.search_delegated_upload_sellers('QA-0029G-ALPHA', 10)
  $$,
  $$ VALUES ('29f00000-0000-0000-0000-000000000002'::uuid) $$,
  'seller search matches slugs case-insensitively'
);

SELECT results_eq(
  $$
    SELECT seller_id
    FROM public.search_delegated_upload_sellers('%', 10)
  $$,
  $$ VALUES ('29f00000-0000-0000-0000-000000000003'::uuid) $$,
  'percent is treated as a literal search character'
);

SELECT results_eq(
  $$
    SELECT seller_id
    FROM public.search_delegated_upload_sellers('_', 10)
  $$,
  $$ VALUES ('29f00000-0000-0000-0000-000000000004'::uuid) $$,
  'underscore is treated as a literal search character'
);

SELECT is(
  (
    SELECT published
    FROM public.search_delegated_upload_sellers('qa-0029g-beta', 10)
  ),
  false,
  'an unpublished storefront remains selectable'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.search_delegated_upload_sellers(text, integer)',
    'EXECUTE'
  ),
  'authenticated browser users cannot execute the seller search function'
);

SELECT is(
  (
    SELECT initiator_kind
    FROM public.create_or_get_seller_classifier_batch(
      '29f00000-0000-0000-0000-000000000001',
      '29f00000-0000-0000-0000-000000000011',
      '29f00000-0000-0000-0000-000000000099',
      '29f00000-0000-0000-0000-000000000101',
      'administrator'
    )
  ),
  'administrator',
  'delegated creation records the administrator initiator kind'
);

SELECT * FROM finish();

ROLLBACK;
