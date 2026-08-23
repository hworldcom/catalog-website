BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(14);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '40aa0000-0000-4000-8000-000000000001',
  'qa-0040l-disabled',
  'QA 0040l Disabled Storefront',
  'Q4L'
);
SELECT pg_temp.approve_fixture_seller(
  '40aa0000-0000-4000-8000-000000000001',
  false
);
UPDATE public.sellers
SET owner_id = '40000000-0000-4000-8000-000000000001'
WHERE id = '40aa0000-0000-4000-8000-000000000001';

CREATE TEMP TABLE qa_disabled_product AS
SELECT * FROM public.save_initial_product_draft_with_description(
  NULL,
  '40aa0000-0000-4000-8000-000000000001',
  NULL,
  true,
  'Visibility test product',
  false,
  NULL,
  (SELECT id FROM public.categories WHERE slug = 't-shirts'),
  10,
  '10 pieces',
  20,
  'EUR',
  'in_stock',
  false,
  NULL,
  false,
  'draft',
  ARRAY['women']::text[]
);

SELECT is(
  (
    SELECT marketplace_visibility
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_disabled_product),
      '40aa0000-0000-4000-8000-000000000001'
    )
  ),
  'not_published',
  'a private draft is not published regardless of seller storefront state'
);

SELECT is(
  (
    SELECT marketplace_visibility
    FROM public.list_seller_products_for_moderation(
      '40aa0000-0000-4000-8000-000000000001', 'active', 10, NULL, NULL
    )
    WHERE id = (SELECT product_draft_id FROM qa_disabled_product)
  ),
  'not_published',
  'the seller list agrees with draft detail visibility'
);

SET LOCAL session_replication_role = replica;
UPDATE public.products
SET status = 'published'
WHERE id = (SELECT product_draft_id FROM qa_disabled_product);
SET LOCAL session_replication_role = origin;

SELECT is(
  (
    SELECT published
    FROM public.sellers
    WHERE id = '40aa0000-0000-4000-8000-000000000001'
  ),
  false,
  'an approved seller with a disabled storefront remains hidden'
);

SELECT is(
  (
    SELECT marketplace_visibility
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_disabled_product),
      '40aa0000-0000-4000-8000-000000000001'
    )
  ),
  'storefront_disabled',
  'a published product reports disabled storefront visibility'
);

SELECT results_eq(
  $$
    SELECT list.marketplace_visibility
    FROM public.list_seller_products_for_moderation(
      '40aa0000-0000-4000-8000-000000000001', 'active', 10, NULL, NULL
    ) AS list
    WHERE list.id = (SELECT product_draft_id FROM qa_disabled_product)
  $$,
  $$
    SELECT detail.marketplace_visibility
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_disabled_product),
      '40aa0000-0000-4000-8000-000000000001'
    ) AS detail
  $$,
  'the seller list and detail agree when the storefront is disabled'
);

GRANT SELECT ON qa_disabled_product TO anon;
SET LOCAL ROLE anon;
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.products
    WHERE id = (SELECT product_draft_id FROM qa_disabled_product)
  ),
  0,
  'anonymous reads cannot see a published product under a disabled storefront'
);
RESET ROLE;

CREATE TEMP TABLE qa_enable_storefront AS
SELECT * FROM public.set_seller_storefront_enabled(
  '40aa0000-0000-4000-8000-000000000001',
  true,
  '40aa0000-0000-4000-8000-000000000101',
  '40000000-0000-4000-8000-000000000001'
);

SELECT is(
  (SELECT storefront_enabled FROM qa_enable_storefront),
  true,
  'the existing protected operation enables the storefront'
);

SELECT is(
  (
    SELECT marketplace_visibility
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_disabled_product),
      '40aa0000-0000-4000-8000-000000000001'
    )
  ),
  'visible',
  'an enabled approved seller makes the existing published product visible'
);

SELECT is(
  (
    SELECT status::text
    FROM public.products
    WHERE id = (SELECT product_draft_id FROM qa_disabled_product)
  ),
  'published',
  'enabling the storefront does not republish or mutate product state'
);

SET LOCAL ROLE anon;
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.products
    WHERE id = (SELECT product_draft_id FROM qa_disabled_product)
  ),
  1,
  'anonymous reads can see the existing product after storefront enablement'
);
RESET ROLE;

SET LOCAL session_replication_role = replica;
UPDATE public.products
SET status = 'archived'
WHERE id = (SELECT product_draft_id FROM qa_disabled_product);
SET LOCAL session_replication_role = origin;

SELECT is(
  (
    SELECT marketplace_visibility
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_disabled_product),
      '40aa0000-0000-4000-8000-000000000001'
    )
  ),
  'not_published',
  'an archived product is not published even when its storefront is enabled'
);

SET LOCAL ROLE anon;
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.products
    WHERE id = (SELECT product_draft_id FROM qa_disabled_product)
  ),
  0,
  'anonymous reads cannot see an archived product'
);
RESET ROLE;

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '40aa0000-0000-4000-8000-000000000002',
  'qa-0040l-unapproved',
  'QA 0040l Unapproved Seller',
  'Q4U'
);

CREATE TEMP TABLE qa_unapproved_product AS
SELECT * FROM public.save_initial_product_draft_with_description(
  NULL,
  '40aa0000-0000-4000-8000-000000000002',
  NULL,
  true,
  'Defensive visibility product',
  false,
  NULL,
  (SELECT id FROM public.categories WHERE slug = 't-shirts'),
  10,
  '10 pieces',
  20,
  'EUR',
  'in_stock',
  false,
  NULL,
  false,
  'draft',
  ARRAY['women']::text[]
);

SET LOCAL session_replication_role = replica;
UPDATE public.products
SET status = 'published'
WHERE id = (SELECT product_draft_id FROM qa_unapproved_product);
SET LOCAL session_replication_role = origin;

SELECT is(
  (
    SELECT marketplace_visibility
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_unapproved_product),
      '40aa0000-0000-4000-8000-000000000002'
    )
  ),
  'seller_approval_required',
  'a defensive published row without seller approval is not presented as visible'
);

SELECT results_eq(
  $$
    SELECT list.marketplace_visibility
    FROM public.list_seller_products_for_moderation(
      '40aa0000-0000-4000-8000-000000000002', 'active', 10, NULL, NULL
    ) AS list
    WHERE list.id = (SELECT product_draft_id FROM qa_unapproved_product)
  $$,
  $$
    SELECT detail.marketplace_visibility
    FROM public.read_seller_product_moderation_status(
      (SELECT product_draft_id FROM qa_unapproved_product),
      '40aa0000-0000-4000-8000-000000000002'
    ) AS detail
  $$,
  'the seller list and detail agree for the defensive approval-required state'
);

SELECT * FROM finish();
ROLLBACK;
