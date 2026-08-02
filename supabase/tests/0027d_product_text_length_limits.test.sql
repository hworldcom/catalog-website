BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(15);

SELECT is(
  (SELECT result FROM public.validate_product_publication_title(repeat('x', 50))),
  'valid',
  'a 50-character title is valid for publication'
);

SELECT is(
  (SELECT result FROM public.validate_product_publication_title(repeat('x', 51))),
  'title_invalid',
  'a 51-character title is invalid for publication'
);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '27d00000-0000-4000-8000-000000000001',
  'qa-0027d',
  'QA 0027d',
  'Q7D'
);

CREATE FUNCTION pg_temp.qa_product_code(p_product_id uuid)
RETURNS text
LANGUAGE sql
AS $$
  SELECT public.reserve_product_code(
    p_product_id,
    '27d00000-0000-4000-8000-000000000001',
    (SELECT id FROM public.categories WHERE slug = 't-shirts')
  );
$$;

SELECT throws_ok(
  $$
    INSERT INTO public.products (
      id,
      seller_id,
      product_code,
      title,
      title_source,
      status,
      category_id
    )
    VALUES (
      '27d00000-0000-4000-8000-000000000101',
      '27d00000-0000-4000-8000-000000000001',
      pg_temp.qa_product_code('27d00000-0000-4000-8000-000000000101'),
      repeat('x', 51),
      'human',
      'draft',
      (SELECT id FROM public.categories WHERE slug = 't-shirts')
    )
  $$,
  '23514',
  'product_draft_title_invalid',
  'a direct database write rejects a 51-character title'
);

SELECT lives_ok(
  $$
    INSERT INTO public.products (
      id,
      seller_id,
      product_code,
      title,
      title_source,
      status,
      category_id
    )
    VALUES (
      '27d00000-0000-4000-8000-000000000102',
      '27d00000-0000-4000-8000-000000000001',
      pg_temp.qa_product_code('27d00000-0000-4000-8000-000000000102'),
      repeat('x', 50),
      'human',
      'draft',
      (SELECT id FROM public.categories WHERE slug = 't-shirts')
    )
  $$,
  'a direct database write accepts a 50-character title'
);

ALTER TABLE public.products DISABLE TRIGGER trg_products_00_title;
INSERT INTO public.products (
  id,
  seller_id,
  product_code,
  title,
  title_source,
  status,
  category_id
)
VALUES (
  '27d00000-0000-4000-8000-000000000103',
  '27d00000-0000-4000-8000-000000000001',
  pg_temp.qa_product_code('27d00000-0000-4000-8000-000000000103'),
  repeat('x', 51),
  'human',
  'draft',
  (SELECT id FROM public.categories WHERE slug = 't-shirts')
);
ALTER TABLE public.products ENABLE TRIGGER trg_products_00_title;

SELECT is(
  (
    SELECT char_length(title)
    FROM public.products
    WHERE id = '27d00000-0000-4000-8000-000000000103'
  ),
  51,
  'an existing overlong title remains readable after the tighter rule is installed'
);

SELECT throws_ok(
  $$
    UPDATE public.products
    SET status = 'draft'
    WHERE id = '27d00000-0000-4000-8000-000000000103'
  $$,
  '23514',
  'product_draft_title_invalid',
  'an existing overlong title must be corrected on an explicit product save'
);

SELECT is(
  (
    SELECT result
    FROM public.apply_scoped_product_draft_description_patch(
      '27d00000-0000-4000-8000-000000000102',
      '27d00000-0000-4000-8000-000000000001',
      false, NULL,
      true, repeat('x', 300),
      false, NULL,
      false, NULL
    )
  ),
  'applied',
  'a 300-character localized description is accepted'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.apply_scoped_product_draft_description_patch(
      '27d00000-0000-4000-8000-000000000102',
      '27d00000-0000-4000-8000-000000000001',
      false, NULL,
      true, repeat('x', 301),
      false, NULL,
      false, NULL
    )
  $$,
  '23514',
  'product_draft_description_invalid',
  'a 301-character localized description is rejected'
);

SELECT ok(
  NOT (
    SELECT constraint_record.convalidated
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conname = 'product_draft_descriptions_text_check'
      AND constraint_record.conrelid = 'public.product_draft_descriptions'::regclass
  ),
  'the tighter description constraint preserves readable legacy rows without validating them'
);

SELECT is(
  public.validate_product_publication_descriptions(
    '27d00000-0000-4000-8000-000000000102',
    true,
    repeat('x', 301)
  ),
  'description_invalid',
  'publication preflight rejects an overlong English patch'
);

INSERT INTO public.product_draft_source_memberships (
  product_draft_id,
  classifier_organization_id,
  classifier_batch_id,
  classifier_group_id,
  classifier_image_id,
  source_position,
  is_duplicate,
  duplicate_of_classifier_image_id,
  promotion_required
)
VALUES (
  '27d00000-0000-4000-8000-000000000102',
  '27d00000-0000-4000-8000-000000000201',
  '27d00000-0000-4000-8000-000000000202',
  '27d00000-0000-4000-8000-000000000203',
  '27d00000-0000-4000-8000-000000000204',
  0,
  false,
  NULL,
  true
);

SELECT is(
  (
    SELECT result
    FROM public.authorize_seller_product_publication(
      '27d00000-0000-4000-8000-000000000102',
      '27d00000-0000-4000-8000-000000000001',
      false,
      NULL,
      true,
      repeat('x', 301),
      (SELECT id FROM public.categories WHERE slug = 't-shirts'),
      NULL,
      NULL,
      NULL,
      'USD',
      'in_stock',
      false,
      NULL,
      false
    )
  ),
  'description_invalid',
  'seller publication returns a stable description-invalid result before dispatch'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.finalize_product_draft_description_generation(
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL,
      jsonb_build_object(
        'pl', 'Opis',
        'en', repeat('x', 301),
        'de', 'Beschreibung',
        'vi', 'Mo ta'
      ),
      NULL, NULL, NULL, NULL, NULL
    )
  $$,
  '22023',
  'product_description_generation_output_invalid',
  'generation finalization rejects a 301-character description atomically'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.finalize_product_draft_description_generation(
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL,
      NULL,
      repeat('x', 51),
      NULL, NULL, NULL, NULL
    )
  $$,
  '22023',
  'product_description_generation_output_invalid',
  'generation finalization rejects a 51-character title proposal atomically'
);

SELECT ok(
  NOT has_function_privilege(
    'service_role',
    'public.finalize_product_draft_description_generation_0027d_legacy(uuid,uuid,uuid,uuid,integer,text,uuid,text,text,text,text,bigint,jsonb,text,text,text,text,timestamptz)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.finalize_product_draft_description_generation(uuid,uuid,uuid,uuid,integer,text,uuid,text,text,text,text,bigint,jsonb,text,text,text,text,timestamptz)',
    'EXECUTE'
  ),
  'only the constrained generation finalizer remains callable by the service role'
);

SELECT ok(
  NOT has_function_privilege(
    'service_role',
    'public.authorize_seller_product_publication_0027d_legacy(uuid,uuid,boolean,text,boolean,text,uuid,integer,text,numeric,text,public.stock_status,boolean,text,boolean)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.authorize_seller_product_publication(uuid,uuid,boolean,text,boolean,text,uuid,integer,text,numeric,text,public.stock_status,boolean,text,boolean)',
    'EXECUTE'
  ),
  'only the constrained publication authorizer remains callable by the service role'
);

SELECT * FROM finish();
ROLLBACK;
