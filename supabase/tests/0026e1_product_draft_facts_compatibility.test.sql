BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(12);

SELECT ok(
  (
    SELECT procedure.prosecdef
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'initialize_product_draft_facts'
  ),
  'the initialization trigger function remains security definer'
);

SELECT is(
  (
    SELECT procedure.proconfig
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'initialize_product_draft_facts'
  ),
  ARRAY['search_path=""']::text[],
  'the initialization trigger function retains an empty search path'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.initialize_product_draft_facts()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.initialize_product_draft_facts()',
    'EXECUTE'
  ),
  'browser database roles cannot execute the initialization function'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.products AS product
    LEFT JOIN public.product_draft_facts AS facts
      ON facts.product_draft_id = product.id
    WHERE facts.product_draft_id IS NULL
  ),
  0,
  'the compatibility migration backfills facts for every existing product'
);

INSERT INTO public.sellers (id, slug, name)
VALUES (
  '26000000-0000-0000-0000-000000000001',
  'qa-0026e1',
  'QA 0026e1'
);

INSERT INTO public.products (id, seller_id, title, status)
VALUES
  (
    '26000000-0000-0000-0000-000000000101',
    '26000000-0000-0000-0000-000000000001',
    'Draft product',
    'draft'
  ),
  (
    '26000000-0000-0000-0000-000000000102',
    '26000000-0000-0000-0000-000000000001',
    'Published product',
    'published'
  ),
  (
    '26000000-0000-0000-0000-000000000103',
    '26000000-0000-0000-0000-000000000001',
    'Archived product',
    'archived'
  );

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_draft_facts
    WHERE product_draft_id IN (
      '26000000-0000-0000-0000-000000000101',
      '26000000-0000-0000-0000-000000000102',
      '26000000-0000-0000-0000-000000000103'
    )
  ),
  3,
  'inserts in every product status initialize a facts row'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_draft_facts
    WHERE product_draft_id IN (
      '26000000-0000-0000-0000-000000000101',
      '26000000-0000-0000-0000-000000000102',
      '26000000-0000-0000-0000-000000000103'
    )
      AND facts_revision = 1
  ),
  3,
  'new facts rows start at revision one'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_draft_facts
    WHERE product_draft_id IN (
      '26000000-0000-0000-0000-000000000101',
      '26000000-0000-0000-0000-000000000102',
      '26000000-0000-0000-0000-000000000103'
    )
      AND facts_json = '{
        "schemaVersion": 2,
        "colors": [],
        "materialComposition": null,
        "uncertainFields": [],
        "fieldSources": {
          "colors": null,
          "materialComposition": null
        }
      }'::jsonb
  ),
  3,
  'new facts rows use the canonical empty version two document'
);

INSERT INTO public.products (id, seller_id, title, status)
VALUES (
  '26000000-0000-0000-0000-000000000104',
  '26000000-0000-0000-0000-000000000001',
  'Reviewed product',
  'draft'
);

UPDATE public.product_draft_facts
SET
  facts_json = jsonb_set(
    jsonb_set(
      facts_json,
      '{materialComposition}',
      '"60% cotton, 40% polyester"'::jsonb
    ),
    '{fieldSources,materialComposition}',
    '"human"'::jsonb
  ),
  facts_revision = 7
WHERE product_draft_id = '26000000-0000-0000-0000-000000000104';

CREATE TEMP TABLE reviewed_facts_snapshot AS
SELECT facts_json, facts_revision, created_at, updated_at
FROM public.product_draft_facts
WHERE product_draft_id = '26000000-0000-0000-0000-000000000104';

UPDATE public.products
SET status = 'published'
WHERE id = '26000000-0000-0000-0000-000000000104';

UPDATE public.products
SET status = 'draft'
WHERE id = '26000000-0000-0000-0000-000000000104';

SELECT is(
  (
    SELECT facts.facts_revision
    FROM public.product_draft_facts AS facts
    WHERE facts.product_draft_id = '26000000-0000-0000-0000-000000000104'
  ),
  7,
  'returning to draft does not replace a reviewed facts revision'
);

SELECT is(
  (
    SELECT facts.facts_json
    FROM public.product_draft_facts AS facts
    WHERE facts.product_draft_id = '26000000-0000-0000-0000-000000000104'
  ),
  (
    SELECT snapshot.facts_json
    FROM reviewed_facts_snapshot AS snapshot
  ),
  'returning to draft does not replace reviewed facts'
);

SELECT ok(
  (
    SELECT
      facts.created_at = snapshot.created_at
      AND facts.updated_at = snapshot.updated_at
    FROM public.product_draft_facts AS facts
    CROSS JOIN reviewed_facts_snapshot AS snapshot
    WHERE facts.product_draft_id = '26000000-0000-0000-0000-000000000104'
  ),
  'a conflict-safe trigger leaves reviewed facts timestamps unchanged'
);

INSERT INTO public.products (id, seller_id, title, status)
VALUES (
  '26000000-0000-0000-0000-000000000105',
  '26000000-0000-0000-0000-000000000001',
  'Repair product',
  'archived'
);

DELETE FROM public.product_draft_facts
WHERE product_draft_id = '26000000-0000-0000-0000-000000000105';

UPDATE public.products
SET status = 'draft'
WHERE id = '26000000-0000-0000-0000-000000000105';

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_draft_facts
    WHERE product_draft_id = '26000000-0000-0000-0000-000000000105'
  ),
  1,
  'a transition from archived to draft repairs a missing facts row'
);

SELECT is(
  (
    SELECT facts_revision
    FROM public.product_draft_facts
    WHERE product_draft_id = '26000000-0000-0000-0000-000000000105'
  ),
  1,
  'a repaired facts row starts at revision one'
);

SELECT * FROM finish();

ROLLBACK;
