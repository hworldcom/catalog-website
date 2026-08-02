BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(12);

SELECT ok(
  (
    SELECT coalesce(bool_and(
      CASE
        WHEN btrim(regexp_replace(title, '[[:space:]]+', ' ', 'g')) = ''
          THEN title_source IS NULL
        ELSE title_source = 'human'
      END
    ), true)
    FROM public.products
  ),
  'existing ProductDraft titles receive a source without rewriting the title'
);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '26000000-0000-0000-0000-000000000021',
  'qa-0026g',
  'QA 0026g',
  'Q03'
);

CREATE FUNCTION pg_temp.qa_product_code(p_product_id uuid)
RETURNS text
LANGUAGE sql
AS $$
  SELECT public.reserve_product_code(
    p_product_id,
    '26000000-0000-0000-0000-000000000021',
    (SELECT id FROM public.categories WHERE slug = 't-shirts')
  );
$$;

SELECT throws_ok(
  $$
    INSERT INTO public.products (
      id,
      seller_id,
      category_id,
      product_code,
      title,
      title_source
    )
    VALUES (
      '26000000-0000-0000-0000-000000000210',
      '26000000-0000-0000-0000-000000000021',
      (SELECT id FROM public.categories WHERE slug = 't-shirts'),
      pg_temp.qa_product_code('26000000-0000-0000-0000-000000000210'),
      'Invalid source',
      'classifier'
    )
  $$,
  '23514',
  'new row for relation "products" violates check constraint "products_title_source_check"',
  'title sources are restricted to human, model, or null'
);

INSERT INTO public.products (
  id,
  seller_id,
  product_code,
  title,
  title_source,
  status,
  category_id
)
VALUES
  (
    '26000000-0000-0000-0000-000000000211',
    '26000000-0000-0000-0000-000000000021',
    pg_temp.qa_product_code('26000000-0000-0000-0000-000000000211'),
    '',
    NULL,
    'draft',
    (SELECT id FROM public.categories WHERE slug = 't-shirts')
  ),
  (
    '26000000-0000-0000-0000-000000000212',
    '26000000-0000-0000-0000-000000000021',
    pg_temp.qa_product_code('26000000-0000-0000-0000-000000000212'),
    'Draft title',
    'human',
    'draft',
    (SELECT id FROM public.categories WHERE slug = 't-shirts')
  ),
  (
    '26000000-0000-0000-0000-000000000214',
    '26000000-0000-0000-0000-000000000021',
    pg_temp.qa_product_code('26000000-0000-0000-0000-000000000214'),
    'Archived title',
    'human',
    'archived',
    (SELECT id FROM public.categories WHERE slug = 't-shirts')
  );

SELECT is(
  (
    SELECT title
    FROM public.products
    WHERE id = '26000000-0000-0000-0000-000000000211'
  ),
  '',
  'a draft may store a blank title'
);

SELECT is(
  (
    SELECT title_source
    FROM public.products
    WHERE id = '26000000-0000-0000-0000-000000000211'
  ),
  NULL,
  'a blank draft title may have no source'
);

SELECT throws_ok(
  $$
    UPDATE public.products
    SET status = 'published'
    WHERE id = '26000000-0000-0000-0000-000000000211'
  $$,
  '23514',
  'product_draft_title_invalid',
  'a blank title cannot be published'
);

UPDATE public.products
SET
  status = 'published',
  cover_image_url = 'https://example.test/qa-0026g-published.jpg'
WHERE id = '26000000-0000-0000-0000-000000000212';

SELECT is(
  (
    SELECT status::text
    FROM public.products
    WHERE id = '26000000-0000-0000-0000-000000000212'
  ),
  'published',
  'a valid title may be published'
);

SELECT throws_ok(
  $$
    UPDATE public.products
    SET title = 'Changed published title'
    WHERE id = '26000000-0000-0000-0000-000000000212'
  $$,
  '23514',
  'product_draft_title_not_editable',
  'a published title is read-only'
);

SELECT throws_ok(
  $$
    UPDATE public.products
    SET title_source = 'model'
    WHERE id = '26000000-0000-0000-0000-000000000212'
  $$,
  '23514',
  'product_draft_title_not_editable',
  'a published title source is read-only'
);

SELECT throws_ok(
  $$
    UPDATE public.products
    SET title = 'Changed archived title'
    WHERE id = '26000000-0000-0000-0000-000000000214'
  $$,
  '23514',
  'product_draft_title_not_editable',
  'an archived title is read-only'
);

UPDATE public.products
SET
  title = 'Human title',
  title_source = 'human'
WHERE id = '26000000-0000-0000-0000-000000000211';

SELECT results_eq(
  $$
    SELECT title, title_source
    FROM public.products
    WHERE id = '26000000-0000-0000-0000-000000000211'
  $$,
  $$
    VALUES ('Human title'::text, 'human'::text)
  $$,
  'a draft title and source can be changed together'
);

UPDATE public.products
SET
  title = '',
  title_source = NULL
WHERE id = '26000000-0000-0000-0000-000000000211';

SELECT results_eq(
  $$
    SELECT title, title_source
    FROM public.products
    WHERE id = '26000000-0000-0000-0000-000000000211'
  $$,
  $$
    VALUES (''::text, NULL::text)
  $$,
  'a human clear stores a blank title and null source'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.enforce_product_draft_title()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.enforce_product_draft_title()',
    'EXECUTE'
  ),
  'browser database roles cannot execute the title trigger function'
);

SELECT * FROM finish();

ROLLBACK;
