BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT no_plan();

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.claim_product_draft_description_generation(uuid,uuid)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.claim_product_draft_description_generation(uuid,uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.finalize_product_draft_description_generation(uuid,uuid,uuid,uuid,integer,text,uuid,text,text,text,text,bigint,jsonb,text,text,text,text,timestamptz)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.finalize_product_draft_description_generation(uuid,uuid,uuid,uuid,integer,text,uuid,text,text,text,text,bigint,jsonb,text,text,text,text,timestamptz)',
    'EXECUTE'
  ),
  'only the service role can claim and finalize category-optional generation'
);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '35b00000-0000-4000-8000-000000000001',
  'qa-0035b-owner',
  'QA 0035b Owner',
  'Q35'
);

INSERT INTO public.products (
  id,
  seller_id,
  product_code,
  title,
  title_source,
  status,
  category_id,
  cover_image_url
)
VALUES
  (
    '35b00000-0000-4000-8000-000000000101',
    '35b00000-0000-4000-8000-000000000001',
    NULL,
    '',
    NULL,
    'draft',
    NULL,
    NULL
  ),
  (
    '35b00000-0000-4000-8000-000000000102',
    '35b00000-0000-4000-8000-000000000001',
    NULL,
    '',
    NULL,
    'draft',
    NULL,
    NULL
  ),
  (
    '35b00000-0000-4000-8000-000000000103',
    '35b00000-0000-4000-8000-000000000001',
    NULL,
    '',
    NULL,
    'draft',
    (SELECT id FROM public.categories WHERE slug = 't-shirts'),
    NULL
  ),
  (
    '35b00000-0000-4000-8000-000000000104',
    '35b00000-0000-4000-8000-000000000001',
    NULL,
    '',
    NULL,
    'draft',
    (SELECT id FROM public.categories WHERE slug = 't-shirts'),
    NULL
  ),
  (
    '35b00000-0000-4000-8000-000000000105',
    '35b00000-0000-4000-8000-000000000001',
    NULL,
    '',
    NULL,
    'draft',
    NULL,
    NULL
  ),
  (
    '35b00000-0000-4000-8000-000000000106',
    '35b00000-0000-4000-8000-000000000001',
    NULL,
    '',
    NULL,
    'draft',
    NULL,
    NULL
  );

CREATE TEMP TABLE legacy_covers (product_draft_id uuid, cover_image_url text) ON COMMIT DROP;

INSERT INTO legacy_covers (product_draft_id, cover_image_url)
VALUES
  ('35b00000-0000-4000-8000-000000000101', 'https://example.supabase.co/storage/v1/object/public/product-images/qa/0035b-null.jpg'),
  ('35b00000-0000-4000-8000-000000000102', 'https://example.supabase.co/storage/v1/object/public/product-images/qa/0035b-null-to-value.jpg'),
  ('35b00000-0000-4000-8000-000000000103', 'https://example.supabase.co/storage/v1/object/public/product-images/qa/0035b-value-to-null.jpg'),
  ('35b00000-0000-4000-8000-000000000104', 'https://example.supabase.co/storage/v1/object/public/product-images/qa/0035b-value-to-value.jpg'),
  ('35b00000-0000-4000-8000-000000000105', 'https://example.supabase.co/storage/v1/object/public/product-images/qa/0035b-human-title.jpg'),
  ('35b00000-0000-4000-8000-000000000106', 'https://example.supabase.co/storage/v1/object/public/product-images/qa/0035b-missing-facts.jpg');

INSERT INTO public.direct_product_legacy_cover_allowances (
  product_draft_id,
  recorded_cover_image_url
)
SELECT product_draft_id, cover_image_url
FROM legacy_covers;

UPDATE public.products AS product
SET cover_image_url = legacy.cover_image_url
FROM legacy_covers AS legacy
WHERE product.id = legacy.product_draft_id;

CREATE TEMP TABLE categoryless_claim AS
SELECT *
FROM public.claim_product_draft_description_generation(
  '35b00000-0000-4000-8000-000000000101',
  '35b00000-0000-4000-8000-000000000001'
);

SELECT results_eq(
  $$
    SELECT
      result,
      category_id,
      category_slug,
      category_name,
      facts_json ->> 'schemaVersion',
      title_blank
    FROM categoryless_claim
  $$,
  $$
    VALUES (
      'claimed'::text,
      NULL::uuid,
      NULL::text,
      NULL::text,
      '2'::text,
      true
    )
  $$,
  'an uncategorized draft with valid facts is claimed with explicit null category context'
);

CREATE TEMP TABLE categoryless_finalization AS
SELECT *
FROM public.finalize_product_draft_description_generation(
  '35b00000-0000-4000-8000-000000000101',
  '35b00000-0000-4000-8000-000000000001',
  (SELECT attempt_token FROM categoryless_claim),
  NULL,
  (SELECT facts_revision FROM categoryless_claim),
  (SELECT cover_source FROM categoryless_claim),
  (SELECT cover_image_id FROM categoryless_claim),
  (SELECT cover_image_url FROM categoryless_claim),
  (SELECT cover_storage_bucket FROM categoryless_claim),
  (SELECT cover_object_key FROM categoryless_claim),
  (SELECT cover_content_type FROM categoryless_claim),
  (SELECT cover_size_bytes FROM categoryless_claim),
  '{"pl":"Polski opis","en":"English description","de":"Deutsche Beschreibung","vi":"Mo ta tieng Viet"}'::jsonb,
  NULL,
  'openai',
  'gpt-5.4-nano',
  'product-description-v3',
  now()
);

SELECT is(
  (SELECT result FROM categoryless_finalization),
  'completed',
  'valid descriptions finalize without a category or title proposal'
);

SELECT results_eq(
  $$
    SELECT title, title_source, category_id, product_code
    FROM public.products
    WHERE id = '35b00000-0000-4000-8000-000000000101'
  $$,
  $$ VALUES (''::text, NULL::text, NULL::uuid, NULL::text) $$,
  'generation leaves the incomplete title, category, and code unchanged'
);

SELECT results_eq(
  $$
    SELECT language, source, pipeline_version
    FROM public.product_draft_descriptions
    WHERE product_draft_id = '35b00000-0000-4000-8000-000000000101'
    ORDER BY language
  $$,
  $$
    VALUES
      ('de'::text, 'model'::text, 'product-description-v3'::text),
      ('en'::text, 'model'::text, 'product-description-v3'::text),
      ('pl'::text, 'model'::text, 'product-description-v3'::text),
      ('vi'::text, 'model'::text, 'product-description-v3'::text)
  $$,
  'all generated descriptions record version 3 provenance'
);

CREATE TEMP TABLE null_to_value_claim AS
SELECT *
FROM public.claim_product_draft_description_generation(
  '35b00000-0000-4000-8000-000000000102',
  '35b00000-0000-4000-8000-000000000001'
);

UPDATE public.products
SET category_id = (SELECT id FROM public.categories WHERE slug = 't-shirts')
WHERE id = '35b00000-0000-4000-8000-000000000102';

SELECT is(
  (
    SELECT result
    FROM public.finalize_product_draft_description_generation(
      '35b00000-0000-4000-8000-000000000102',
      '35b00000-0000-4000-8000-000000000001',
      (SELECT attempt_token FROM null_to_value_claim),
      (SELECT category_id FROM null_to_value_claim),
      (SELECT facts_revision FROM null_to_value_claim),
      (SELECT cover_source FROM null_to_value_claim),
      (SELECT cover_image_id FROM null_to_value_claim),
      (SELECT cover_image_url FROM null_to_value_claim),
      (SELECT cover_storage_bucket FROM null_to_value_claim),
      (SELECT cover_object_key FROM null_to_value_claim),
      (SELECT cover_content_type FROM null_to_value_claim),
      (SELECT cover_size_bytes FROM null_to_value_claim),
      '{"pl":"Polski opis","en":"English description","de":"Deutsche Beschreibung","vi":"Mo ta tieng Viet"}'::jsonb,
      'Model title',
      'openai',
      'gpt-5.4-nano',
      'product-description-v3',
      now()
    )
  ),
  'input_changed',
  'a null-to-category change rejects a stale result'
);

CREATE TEMP TABLE value_to_null_claim AS
SELECT *
FROM public.claim_product_draft_description_generation(
  '35b00000-0000-4000-8000-000000000103',
  '35b00000-0000-4000-8000-000000000001'
);

UPDATE public.products
SET category_id = NULL
WHERE id = '35b00000-0000-4000-8000-000000000103';

SELECT is(
  (
    SELECT result
    FROM public.finalize_product_draft_description_generation(
      '35b00000-0000-4000-8000-000000000103',
      '35b00000-0000-4000-8000-000000000001',
      (SELECT attempt_token FROM value_to_null_claim),
      (SELECT category_id FROM value_to_null_claim),
      (SELECT facts_revision FROM value_to_null_claim),
      (SELECT cover_source FROM value_to_null_claim),
      (SELECT cover_image_id FROM value_to_null_claim),
      (SELECT cover_image_url FROM value_to_null_claim),
      (SELECT cover_storage_bucket FROM value_to_null_claim),
      (SELECT cover_object_key FROM value_to_null_claim),
      (SELECT cover_content_type FROM value_to_null_claim),
      (SELECT cover_size_bytes FROM value_to_null_claim),
      '{"pl":"Polski opis","en":"English description","de":"Deutsche Beschreibung","vi":"Mo ta tieng Viet"}'::jsonb,
      'Model title',
      'openai',
      'gpt-5.4-nano',
      'product-description-v3',
      now()
    )
  ),
  'input_changed',
  'a category-to-null change rejects a stale result'
);

CREATE TEMP TABLE value_to_value_claim AS
SELECT *
FROM public.claim_product_draft_description_generation(
  '35b00000-0000-4000-8000-000000000104',
  '35b00000-0000-4000-8000-000000000001'
);

UPDATE public.products
SET category_id = (SELECT id FROM public.categories WHERE slug = 'trousers')
WHERE id = '35b00000-0000-4000-8000-000000000104';

SELECT is(
  (
    SELECT result
    FROM public.finalize_product_draft_description_generation(
      '35b00000-0000-4000-8000-000000000104',
      '35b00000-0000-4000-8000-000000000001',
      (SELECT attempt_token FROM value_to_value_claim),
      (SELECT category_id FROM value_to_value_claim),
      (SELECT facts_revision FROM value_to_value_claim),
      (SELECT cover_source FROM value_to_value_claim),
      (SELECT cover_image_id FROM value_to_value_claim),
      (SELECT cover_image_url FROM value_to_value_claim),
      (SELECT cover_storage_bucket FROM value_to_value_claim),
      (SELECT cover_object_key FROM value_to_value_claim),
      (SELECT cover_content_type FROM value_to_value_claim),
      (SELECT cover_size_bytes FROM value_to_value_claim),
      '{"pl":"Polski opis","en":"English description","de":"Deutsche Beschreibung","vi":"Mo ta tieng Viet"}'::jsonb,
      'Model title',
      'openai',
      'gpt-5.4-nano',
      'product-description-v3',
      now()
    )
  ),
  'input_changed',
  'a category-to-category change rejects a stale result'
);

CREATE TEMP TABLE human_title_claim AS
SELECT *
FROM public.claim_product_draft_description_generation(
  '35b00000-0000-4000-8000-000000000105',
  '35b00000-0000-4000-8000-000000000001'
);

UPDATE public.products
SET title = 'Human title', title_source = 'human'
WHERE id = '35b00000-0000-4000-8000-000000000105';

SELECT is(
  (
    SELECT result
    FROM public.finalize_product_draft_description_generation(
      '35b00000-0000-4000-8000-000000000105',
      '35b00000-0000-4000-8000-000000000001',
      (SELECT attempt_token FROM human_title_claim),
      (SELECT category_id FROM human_title_claim),
      (SELECT facts_revision FROM human_title_claim),
      (SELECT cover_source FROM human_title_claim),
      (SELECT cover_image_id FROM human_title_claim),
      (SELECT cover_image_url FROM human_title_claim),
      (SELECT cover_storage_bucket FROM human_title_claim),
      (SELECT cover_object_key FROM human_title_claim),
      (SELECT cover_content_type FROM human_title_claim),
      (SELECT cover_size_bytes FROM human_title_claim),
      '{"pl":"Polski opis","en":"English description","de":"Deutsche Beschreibung","vi":"Mo ta tieng Viet"}'::jsonb,
      'Model title',
      'openai',
      'gpt-5.4-nano',
      'product-description-v3',
      now()
    )
  ),
  'completed',
  'a concurrent human title does not block otherwise valid descriptions'
);

SELECT results_eq(
  $$
    SELECT title, title_source
    FROM public.products
    WHERE id = '35b00000-0000-4000-8000-000000000105'
  $$,
  $$ VALUES ('Human title'::text, 'human'::text) $$,
  'a human title saved during generation is not overwritten'
);

DELETE FROM public.product_draft_facts
WHERE product_draft_id = '35b00000-0000-4000-8000-000000000106';

SELECT is(
  (
    SELECT result
    FROM public.claim_product_draft_description_generation(
      '35b00000-0000-4000-8000-000000000106',
      '35b00000-0000-4000-8000-000000000001'
    )
  ),
  'facts_missing',
  'a missing facts record fails before a generation attempt is created'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_draft_description_generation_attempts
    WHERE product_draft_id = '35b00000-0000-4000-8000-000000000106'
  ),
  0,
  'a missing facts record creates no provider claim'
);

SELECT * FROM finish();
ROLLBACK;
