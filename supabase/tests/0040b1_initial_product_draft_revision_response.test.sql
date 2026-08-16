BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(6);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '40b10000-0000-4000-8000-000000000001',
  'qa-0040b1-revision-seller',
  'QA 0040b1 Revision Seller',
  'Q41'
);

SELECT pg_temp.approve_fixture_seller('40b10000-0000-4000-8000-000000000001');

CREATE TEMP TABLE qa_titled_draft AS
SELECT *
FROM public.save_initial_product_draft_with_description(
  NULL,
  '40b10000-0000-4000-8000-000000000001',
  NULL,
  true,
  'QA cotton shirt',
  false,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'EUR',
  'in_stock',
  false,
  NULL,
  false,
  'draft',
  NULL
);

SELECT is(
  (SELECT result FROM qa_titled_draft),
  'created',
  'a titled initial ProductDraft is created'
);

SELECT is(
  (SELECT moderation_revision FROM qa_titled_draft),
  1::bigint,
  'a titled initial ProductDraft returns its moderation revision'
);

SELECT is(
  (
    SELECT product.moderation_revision
    FROM public.products AS product
    WHERE product.id = (SELECT product_draft_id FROM qa_titled_draft)
  ),
  (SELECT moderation_revision FROM qa_titled_draft),
  'the titled draft response revision matches the stored revision'
);

CREATE TEMP TABLE qa_untitled_draft AS
SELECT *
FROM public.save_initial_product_draft_with_description(
  NULL,
  '40b10000-0000-4000-8000-000000000001',
  NULL,
  true,
  '',
  false,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'EUR',
  'in_stock',
  false,
  NULL,
  false,
  'draft',
  NULL
);

SELECT is(
  (SELECT result FROM qa_untitled_draft),
  'created',
  'an untitled initial ProductDraft is created'
);

SELECT is(
  (SELECT moderation_revision FROM qa_untitled_draft),
  1::bigint,
  'an untitled initial ProductDraft returns its moderation revision'
);

SELECT results_eq(
  $$
    SELECT title, title_source, moderation_revision
    FROM qa_untitled_draft
  $$,
  $$
    VALUES (''::text, NULL::text, 1::bigint)
  $$,
  'an untitled draft keeps the canonical blank title representation'
);

SELECT * FROM finish();
ROLLBACK;
