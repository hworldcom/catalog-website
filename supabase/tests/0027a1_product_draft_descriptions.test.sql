BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(29);

SELECT has_table(
  'public',
  'product_draft_descriptions',
  'authoritative ProductDraft descriptions have a dedicated table'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.product_draft_descriptions', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.product_draft_descriptions', 'SELECT')
  AND has_table_privilege('service_role', 'public.product_draft_descriptions', 'SELECT')
  AND NOT has_table_privilege('service_role', 'public.product_draft_descriptions', 'INSERT')
  AND NOT has_table_privilege('service_role', 'public.product_draft_descriptions', 'UPDATE')
  AND NOT has_table_privilege('service_role', 'public.product_draft_descriptions', 'DELETE'),
  'only the service role can read descriptions directly and writes use atomic functions'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.apply_product_draft_description_patch(uuid,boolean,text,boolean,text,boolean,text,boolean,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.apply_product_draft_description_patch(uuid,boolean,text,boolean,text,boolean,text,boolean,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.apply_product_draft_description_patch(uuid,boolean,text,boolean,text,boolean,text,boolean,text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.apply_scoped_product_draft_description_patch(uuid,uuid,boolean,text,boolean,text,boolean,text,boolean,text)',
    'EXECUTE'
  ),
  'the service role can execute only the seller-scoped description patch function'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.save_seller_product_with_description(uuid,uuid,boolean,text,boolean,text,uuid,integer,text,numeric,text,public.stock_status,boolean,text,boolean,public.product_status)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.save_seller_product_with_description(uuid,uuid,boolean,text,boolean,text,uuid,integer,text,numeric,text,public.stock_status,boolean,text,boolean,public.product_status)',
    'EXECUTE'
  ),
  'only the service role can execute the atomic seller save function'
);

SELECT is(
  public.normalize_product_draft_description(U&'\FEFF  value  \FEFF'),
  'value',
  'database normalization trims Unicode whitespace consistently with the server'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.products AS product
    LEFT JOIN public.product_draft_descriptions AS description
      ON description.product_draft_id = product.id
     AND description.language = 'en'
    WHERE product.description IS NOT NULL
      AND (
        description.product_draft_id IS NULL
        OR description.description_text IS DISTINCT FROM product.description
      )
  ),
  0,
  'all existing English compatibility projections have authoritative rows'
);

INSERT INTO public.sellers (id, slug, name)
VALUES (
  '27000000-0000-0000-0000-000000000001',
  'qa-0027a1',
  'QA 0027a1'
);

INSERT INTO public.products (id, seller_id, title, title_source, status, category_id)
VALUES (
  '27000000-0000-0000-0000-000000000101',
  '27000000-0000-0000-0000-000000000001',
  'Description draft',
  'human',
  'draft',
  (SELECT id FROM public.categories ORDER BY sort_order, id LIMIT 1)
);

SELECT is(
  (
    SELECT facts_revision
    FROM public.product_draft_facts
    WHERE product_draft_id = '27000000-0000-0000-0000-000000000101'
  ),
  1,
  'a description draft receives its initial facts row'
);

CREATE TEMP TABLE first_description_patch AS
SELECT *
FROM public.apply_scoped_product_draft_description_patch(
  '27000000-0000-0000-0000-000000000101',
  '27000000-0000-0000-0000-000000000001',
  false, NULL,
  true, E'  English description\r\nwith two lines  ',
  true, ' Deutsche Beschreibung ',
  false, NULL
);

SELECT is(
  (SELECT result FROM first_description_patch),
  'applied',
  'a normalized human description patch is applied'
);

SELECT is(
  (
    SELECT description
    FROM public.products
    WHERE id = '27000000-0000-0000-0000-000000000101'
  ),
  E'English description\nwith two lines',
  'the authoritative English row updates the compatibility projection'
);

SELECT results_eq(
  $$
    SELECT language, description_text
    FROM public.product_draft_descriptions
    WHERE product_draft_id = '27000000-0000-0000-0000-000000000101'
    ORDER BY language
  $$,
  $$
    VALUES
      ('de'::text, 'Deutsche Beschreibung'::text),
      ('en'::text, E'English description\nwith two lines'::text)
  $$,
  'the patch stores only the submitted normalized language rows'
);

CREATE TEMP TABLE polish_only_patch AS
SELECT *
FROM public.apply_scoped_product_draft_description_patch(
  '27000000-0000-0000-0000-000000000101',
  '27000000-0000-0000-0000-000000000001',
  true, 'Polski opis',
  false, NULL,
  false, NULL,
  false, NULL
);

SELECT is(
  (
    SELECT description
    FROM public.products
    WHERE id = '27000000-0000-0000-0000-000000000101'
  ),
  E'English description\nwith two lines',
  'a non-English patch does not change the English compatibility projection'
);

SELECT is(
  (
    SELECT description_text
    FROM public.product_draft_descriptions
    WHERE product_draft_id = '27000000-0000-0000-0000-000000000101'
      AND language = 'de'
  ),
  'Deutsche Beschreibung',
  'an omitted language is preserved'
);

CREATE TEMP TABLE no_op_description_patch AS
SELECT *
FROM public.apply_scoped_product_draft_description_patch(
  '27000000-0000-0000-0000-000000000101',
  '27000000-0000-0000-0000-000000000001',
  false, NULL,
  true, E'English description\nwith two lines',
  false, NULL,
  false, NULL
);

SELECT is(
  (SELECT result FROM no_op_description_patch),
  'applied',
  'a semantic no-op description patch returns the successful applied outcome'
);

UPDATE public.product_draft_descriptions
SET
  source = 'model',
  facts_revision = 1,
  provider = 'openai',
  model = 'gpt-5.4-nano',
  pipeline_version = 'product-description-v1',
  generated_at = now(),
  backfilled_from_legacy = false
WHERE product_draft_id = '27000000-0000-0000-0000-000000000101'
  AND language = 'en';

CREATE TEMP TABLE human_replacement_patch AS
SELECT *
FROM public.apply_scoped_product_draft_description_patch(
  '27000000-0000-0000-0000-000000000101',
  '27000000-0000-0000-0000-000000000001',
  false, NULL,
  true, 'Human replacement',
  false, NULL,
  false, NULL
);

SELECT results_eq(
  $$
    SELECT source, facts_revision, provider, model, pipeline_version, generated_at
    FROM public.product_draft_descriptions
    WHERE product_draft_id = '27000000-0000-0000-0000-000000000101'
      AND language = 'en'
  $$,
  $$
    VALUES ('human'::text, 1, NULL::text, NULL::text, NULL::text, NULL::timestamptz)
  $$,
  'a human edit replaces model provenance with current human provenance'
);

UPDATE public.product_draft_facts
SET facts_revision = 2
WHERE product_draft_id = '27000000-0000-0000-0000-000000000101';

SELECT is(
  public.product_draft_description_snapshot(
    '27000000-0000-0000-0000-000000000101',
    'draft',
    2,
    NULL
  ) #>> '{descriptions,1,outdated}',
  'true',
  'a later facts revision derives staleness without rewriting the description row'
);

SELECT throws_ok(
  $$
    UPDATE public.products
    SET description = 'Independent description'
    WHERE id = '27000000-0000-0000-0000-000000000101'
  $$,
  '23514',
  'product_draft_description_projection_mismatch',
  'a direct divergent compatibility-projection write is rejected'
);

CREATE TEMP TABLE clear_english_patch AS
SELECT *
FROM public.apply_scoped_product_draft_description_patch(
  '27000000-0000-0000-0000-000000000101',
  '27000000-0000-0000-0000-000000000001',
  false, NULL,
  true, '   ',
  false, NULL,
  false, NULL
);

SELECT is(
  (
    SELECT description
    FROM public.products
    WHERE id = '27000000-0000-0000-0000-000000000101'
  ),
  NULL::text,
  'clearing English removes the compatibility projection'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_draft_descriptions
    WHERE product_draft_id = '27000000-0000-0000-0000-000000000101'
      AND language = 'en'
  ),
  0,
  'clearing English deletes the authoritative language row'
);

UPDATE public.products
SET
  status = 'published',
  cover_image_url = 'https://example.test/qa-0027a1-published.jpg'
WHERE id = '27000000-0000-0000-0000-000000000101';

CREATE TEMP TABLE published_description_patch AS
SELECT *
FROM public.apply_scoped_product_draft_description_patch(
  '27000000-0000-0000-0000-000000000101',
  '27000000-0000-0000-0000-000000000001',
  false, NULL,
  true, 'Published edit',
  false, NULL,
  false, NULL
);

SELECT is(
  (SELECT result FROM published_description_patch),
  'not_editable',
  'published ProductDraft descriptions are read-only'
);

SELECT throws_ok(
  $$
    INSERT INTO public.product_draft_descriptions (
      product_draft_id,
      language,
      description_text,
      source,
      facts_revision,
      backfilled_from_legacy
    )
    VALUES (
      '27000000-0000-0000-0000-000000000101',
      'vi',
      'Mo ta',
      'model',
      1,
      false
    )
  $$,
  '23514',
  'new row for relation "product_draft_descriptions" violates check constraint "product_draft_descriptions_provenance_check"',
  'a model description requires complete model provenance'
);

CREATE TEMP TABLE seller_create AS
SELECT *
FROM public.save_seller_product_with_description(
  NULL,
  '27000000-0000-0000-0000-000000000001',
  true,
  'Seller-created draft',
  true,
  ' Seller English description ',
  (SELECT id FROM public.categories ORDER BY sort_order, id LIMIT 1),
  NULL,
  NULL,
  NULL,
  'USD',
  'in_stock',
  false,
  NULL,
  false,
  'draft'
);

SELECT is(
  (SELECT result FROM seller_create),
  'created',
  'the seller save function creates a ProductDraft atomically'
);

SELECT is(
  (SELECT english_description FROM seller_create),
  'Seller English description',
  'the seller create result returns the authoritative English projection'
);

SELECT is(
  (
    SELECT description_text
    FROM public.product_draft_descriptions
    WHERE product_draft_id = (SELECT product_draft_id FROM seller_create)
      AND language = 'en'
  ),
  'Seller English description',
  'the seller create stores English through the authoritative row'
);

CREATE TEMP TABLE seller_untouched_update AS
SELECT *
FROM public.save_seller_product_with_description(
  (SELECT product_draft_id FROM seller_create),
  '27000000-0000-0000-0000-000000000001',
  false,
  NULL,
  false,
  NULL,
  (SELECT id FROM public.categories ORDER BY sort_order, id LIMIT 1),
  12,
  NULL,
  NULL,
  'USD',
  'in_stock',
  false,
  NULL,
  false,
  'draft'
);

SELECT is(
  (
    SELECT description_text
    FROM public.product_draft_descriptions
    WHERE product_draft_id = (SELECT product_draft_id FROM seller_create)
      AND language = 'en'
  ),
  'Seller English description',
  'an untouched seller description is preserved during another product update'
);

CREATE TEMP TABLE seller_clear AS
SELECT *
FROM public.save_seller_product_with_description(
  (SELECT product_draft_id FROM seller_create),
  '27000000-0000-0000-0000-000000000001',
  false,
  NULL,
  true,
  '   ',
  (SELECT id FROM public.categories ORDER BY sort_order, id LIMIT 1),
  12,
  NULL,
  NULL,
  'USD',
  'in_stock',
  false,
  NULL,
  false,
  'draft'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_draft_descriptions
    WHERE product_draft_id = (SELECT product_draft_id FROM seller_create)
      AND language = 'en'
  ),
  0,
  'an explicit seller clear deletes the authoritative English row'
);

SELECT is(
  (SELECT english_description FROM seller_clear),
  NULL::text,
  'an explicit seller clear returns the cleared English projection'
);

CREATE TEMP TABLE seller_publish AS
SELECT *
FROM public.save_seller_product_with_description(
  (SELECT product_draft_id FROM seller_create),
  '27000000-0000-0000-0000-000000000001',
  false,
  NULL,
  true,
  ' Publication description ',
  (SELECT id FROM public.categories ORDER BY sort_order, id LIMIT 1),
  12,
  NULL,
  NULL,
  'USD',
  'in_stock',
  true,
  'https://example.test/qa-0027a1-seller-published.jpg',
  false,
  'published'
);

SELECT is(
  (SELECT product_status FROM seller_publish),
  'published'::public.product_status,
  'a draft can apply an English description and publish atomically'
);

SELECT is(
  (SELECT english_description FROM seller_publish),
  'Publication description',
  'the publish transition returns the normalized authoritative projection'
);

DELETE FROM public.products
WHERE id = (SELECT product_draft_id FROM seller_create);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_draft_descriptions
    WHERE product_draft_id = (SELECT product_draft_id FROM seller_create)
  ),
  0,
  'deleting a ProductDraft cascades to its description rows'
);

SELECT * FROM finish();
ROLLBACK;
