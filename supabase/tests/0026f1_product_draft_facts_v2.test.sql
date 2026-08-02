BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(18);

SELECT ok(
  (
    SELECT
      count(*) FILTER (
        WHERE facts_json -> 'schemaVersion' = '2'::jsonb
          AND ARRAY(
            SELECT key
            FROM jsonb_object_keys(facts_json) AS entry(key)
            ORDER BY key
          ) = ARRAY[
            'colors',
            'fieldSources',
            'materialComposition',
            'schemaVersion',
            'uncertainFields'
          ]::text[]
      ) = count(*)
    FROM public.product_draft_facts
  ),
  'the migration converts every pre-existing facts row to the exact version two shape'
);

SELECT ok(
  (
    SELECT coalesce(bool_and(facts_revision >= 2), true)
    FROM public.product_draft_facts
  ),
  'the migration increments every pre-existing facts revision'
);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '26000000-0000-0000-0000-000000000011',
  'qa-0026f1',
  'QA 0026f1',
  'Q02'
);

CREATE FUNCTION pg_temp.qa_product_code(p_product_id uuid)
RETURNS text
LANGUAGE sql
AS $$
  SELECT public.reserve_product_code(
    p_product_id,
    '26000000-0000-0000-0000-000000000011',
    (SELECT id FROM public.categories WHERE slug = 't-shirts')
  );
$$;

INSERT INTO public.products (id, seller_id, category_id, product_code, title, status)
VALUES
  (
    '26000000-0000-0000-0000-000000000111',
    '26000000-0000-0000-0000-000000000011',
    (SELECT id FROM public.categories WHERE slug = 't-shirts'),
    pg_temp.qa_product_code('26000000-0000-0000-0000-000000000111'),
    'Draft product',
    'draft'
  ),
  (
    '26000000-0000-0000-0000-000000000112',
    '26000000-0000-0000-0000-000000000011',
    (SELECT id FROM public.categories WHERE slug = 't-shirts'),
    pg_temp.qa_product_code('26000000-0000-0000-0000-000000000112'),
    'Archived product',
    'archived'
  );

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_draft_facts
    WHERE product_draft_id IN (
      '26000000-0000-0000-0000-000000000111',
      '26000000-0000-0000-0000-000000000112'
    )
  ),
  2,
  'new products in every status receive facts rows'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_draft_facts
    WHERE product_draft_id IN (
      '26000000-0000-0000-0000-000000000111',
      '26000000-0000-0000-0000-000000000112'
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
  2,
  'new facts rows use the canonical version two document'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_draft_facts
    WHERE product_draft_id IN (
      '26000000-0000-0000-0000-000000000111',
      '26000000-0000-0000-0000-000000000112'
    )
      AND facts_revision = 1
  ),
  2,
  'new facts rows start at revision one'
);

CREATE TEMP TABLE first_patch AS
SELECT *
FROM public.apply_product_draft_facts_patch(
  '26000000-0000-0000-0000-000000000111',
  '{
    "colors": ["black", "red"],
    "materialComposition": "60% cotton, 40% polyester",
    "uncertainFields": ["materialComposition"]
  }'::jsonb,
  '26000000-0000-0000-0000-000000000011'
);

SELECT is(
  (SELECT result FROM first_patch),
  'updated',
  'the version two patch function updates supported fields'
);

SELECT is(
  (SELECT facts_json FROM first_patch),
  '{
    "schemaVersion": 2,
    "colors": ["black", "red"],
    "materialComposition": "60% cotton, 40% polyester",
    "uncertainFields": ["materialComposition"],
    "fieldSources": {
      "colors": "human",
      "materialComposition": "human"
    }
  }'::jsonb,
  'a version two patch derives human sources and returns the complete document'
);

SELECT is(
  (SELECT facts_revision FROM first_patch),
  2,
  'the first semantic version two patch increments the revision once'
);

CREATE TEMP TABLE clear_patch AS
SELECT *
FROM public.apply_product_draft_facts_patch(
  '26000000-0000-0000-0000-000000000111',
  '{"materialComposition": null}'::jsonb,
  '26000000-0000-0000-0000-000000000011'
);

SELECT is(
  (SELECT result FROM clear_patch),
  'updated',
  'material composition can be explicitly cleared'
);

SELECT is(
  (SELECT facts_json -> 'colors' FROM clear_patch),
  '["black", "red"]'::jsonb,
  'clearing material composition preserves colors'
);

SELECT is(
  (SELECT facts_json -> 'materialComposition' FROM clear_patch),
  'null'::jsonb,
  'an explicit material-composition clear stores JSON null'
);

SELECT is(
  (SELECT facts_json #> '{fieldSources,materialComposition}' FROM clear_patch),
  '"human"'::jsonb,
  'an explicit clear records a human source'
);

SELECT is(
  (SELECT facts_revision FROM clear_patch),
  3,
  'the explicit clear increments the revision once'
);

CREATE TEMP TABLE unchanged_patch AS
SELECT *
FROM public.apply_product_draft_facts_patch(
  '26000000-0000-0000-0000-000000000111',
  '{"materialComposition": null}'::jsonb,
  '26000000-0000-0000-0000-000000000011'
);

SELECT is(
  (SELECT result FROM unchanged_patch),
  'unchanged',
  'a semantic no-op remains unchanged'
);

SELECT is(
  (SELECT facts_revision FROM unchanged_patch),
  3,
  'a semantic no-op preserves the revision'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.apply_product_draft_facts_patch(
      '26000000-0000-0000-0000-000000000111',
      '{"material": "cotton"}'::jsonb,
      '26000000-0000-0000-0000-000000000011'
    )
  $$,
  'P0001',
  'Normalized ProductDraft facts patch contains an unsupported field',
  'the legacy material key is rejected'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.apply_product_draft_facts_patch(
      '26000000-0000-0000-0000-000000000111',
      '{"fit": "regular"}'::jsonb,
      '26000000-0000-0000-0000-000000000011'
    )
  $$,
  'P0001',
  'Normalized ProductDraft facts patch contains an unsupported field',
  'a removed version one field is rejected'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.apply_product_draft_facts_patch(uuid,jsonb,uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.apply_product_draft_facts_patch(uuid,jsonb,uuid)',
    'EXECUTE'
  ),
  'browser database roles cannot execute the patch function'
);

SELECT * FROM finish();

ROLLBACK;
