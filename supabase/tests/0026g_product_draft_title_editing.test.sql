BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(13);

SELECT ok(
  (
    SELECT bool_and(
      CASE
        WHEN btrim(regexp_replace(title, '[[:space:]]+', ' ', 'g')) = ''
          THEN title_source IS NULL
        ELSE title_source = 'human'
      END
    )
    FROM public.products
  ),
  'existing ProductDraft titles receive a source without rewriting the title'
);

SELECT throws_ok(
  $$
    INSERT INTO public.products (
      seller_id,
      title,
      title_source
    )
    SELECT id, 'Invalid source', 'classifier'
    FROM public.sellers
    ORDER BY id
    LIMIT 1
  $$,
  '23514',
  'new row for relation "products" violates check constraint "products_title_source_check"',
  'title sources are restricted to human, model, or null'
);

INSERT INTO public.sellers (id, slug, name)
VALUES (
  '26000000-0000-0000-0000-000000000021',
  'qa-0026g',
  'QA 0026g'
);

INSERT INTO public.products (
  id,
  seller_id,
  title,
  title_source,
  status
)
VALUES
  (
    '26000000-0000-0000-0000-000000000211',
    '26000000-0000-0000-0000-000000000021',
    '',
    NULL,
    'draft'
  ),
  (
    '26000000-0000-0000-0000-000000000212',
    '26000000-0000-0000-0000-000000000021',
    'Draft title',
    'human',
    'draft'
  ),
  (
    '26000000-0000-0000-0000-000000000213',
    '26000000-0000-0000-0000-000000000021',
    repeat('x', 121),
    'human',
    'draft'
  ),
  (
    '26000000-0000-0000-0000-000000000214',
    '26000000-0000-0000-0000-000000000021',
    'Archived title',
    'human',
    'archived'
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

SELECT throws_ok(
  $$
    UPDATE public.products
    SET status = 'published'
    WHERE id = '26000000-0000-0000-0000-000000000213'
  $$,
  '23514',
  'product_draft_title_invalid',
  'an overlength legacy title cannot be published'
);

UPDATE public.products
SET status = 'published'
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
