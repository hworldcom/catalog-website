BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT no_plan();

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '27c00000-0000-4000-8000-000000000001',
  'qa-0027c-owner',
  'QA 0027c Owner',
  'Q2C'
);

CREATE FUNCTION pg_temp.qa_product_code(p_product_id uuid)
RETURNS text
LANGUAGE sql
AS $$
  SELECT public.reserve_product_code(
    p_product_id,
    '27c00000-0000-4000-8000-000000000001',
    (SELECT id FROM public.categories WHERE slug = 't-shirts')
  );
$$;

INSERT INTO public.products (
  id,
  seller_id,
  product_code,
  title,
  status,
  category_id
)
VALUES
  (
    '27c00000-0000-4000-8000-000000000101',
    '27c00000-0000-4000-8000-000000000001',
    pg_temp.qa_product_code('27c00000-0000-4000-8000-000000000101'),
    '',
    'draft',
    (SELECT id FROM public.categories WHERE slug = 't-shirts')
  ),
  (
    '27c00000-0000-4000-8000-000000000102',
    '27c00000-0000-4000-8000-000000000001',
    pg_temp.qa_product_code('27c00000-0000-4000-8000-000000000102'),
    '',
    'draft',
    (SELECT id FROM public.categories WHERE slug = 't-shirts')
  ),
  (
    '27c00000-0000-4000-8000-000000000103',
    '27c00000-0000-4000-8000-000000000001',
    pg_temp.qa_product_code('27c00000-0000-4000-8000-000000000103'),
    '',
    'draft',
    (SELECT id FROM public.categories WHERE slug = 't-shirts')
  );

SELECT is(
  (
    SELECT result
    FROM public.claim_product_draft_description_generation(
      '27c00000-0000-4000-8000-000000000101',
      '27c00000-0000-4000-8000-000000000001'
    )
  ),
  'cover_missing',
  'a draft without a persisted selected cover is not claimed'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_draft_description_generation_attempts
    WHERE product_draft_id = '27c00000-0000-4000-8000-000000000101'
  ),
  0,
  'a missing cover creates no generation attempt'
);

INSERT INTO public.product_draft_images (
  id,
  product_draft_id,
  classifier_image_id,
  source_position,
  status,
  destination_key,
  storage_bucket
)
VALUES (
  '27c00000-0000-4000-8000-000000000201',
  '27c00000-0000-4000-8000-000000000102',
  '27c00000-0000-4000-8000-000000000301',
  0,
  'pending',
  'qa/0027c/pending.jpg',
  'product-draft-images'
);

UPDATE public.products
SET cover_image_id = '27c00000-0000-4000-8000-000000000201'
WHERE id = '27c00000-0000-4000-8000-000000000102';

SELECT is(
  (
    SELECT result
    FROM public.claim_product_draft_description_generation(
      '27c00000-0000-4000-8000-000000000102',
      '27c00000-0000-4000-8000-000000000001'
    )
  ),
  'cover_not_ready',
  'a pending private selected cover is not claimed'
);

INSERT INTO public.product_draft_images (
  id,
  product_draft_id,
  classifier_image_id,
  source_position,
  status,
  destination_key,
  content_type,
  size_bytes,
  storage_bucket
)
VALUES
  (
    '27c00000-0000-4000-8000-000000000202',
    '27c00000-0000-4000-8000-000000000103',
    '27c00000-0000-4000-8000-000000000302',
    0,
    'available',
    'qa/0027c/first.jpg',
    'image/jpeg',
    4,
    'product-draft-images'
  ),
  (
    '27c00000-0000-4000-8000-000000000203',
    '27c00000-0000-4000-8000-000000000103',
    '27c00000-0000-4000-8000-000000000303',
    1,
    'available',
    'qa/0027c/replacement.jpg',
    'image/jpeg',
    4,
    'product-draft-images'
  );

UPDATE public.products
SET cover_image_id = '27c00000-0000-4000-8000-000000000202'
WHERE id = '27c00000-0000-4000-8000-000000000103';

CREATE TEMP TABLE private_cover_claim AS
SELECT *
FROM public.claim_product_draft_description_generation(
  '27c00000-0000-4000-8000-000000000103',
  '27c00000-0000-4000-8000-000000000001'
);

SELECT results_eq(
  $$
    SELECT
      result,
      cover_source,
      cover_image_id,
      cover_storage_bucket,
      cover_object_key,
      cover_content_type,
      cover_size_bytes
    FROM private_cover_claim
  $$,
  $$
    VALUES (
      'claimed'::text,
      'private_draft'::text,
      '27c00000-0000-4000-8000-000000000202'::uuid,
      'product-draft-images'::text,
      'qa/0027c/first.jpg'::text,
      'image/jpeg'::text,
      4::bigint
    )
  $$,
  'a claim captures the immutable selected private-cover identity'
);

UPDATE public.products
SET cover_image_id = '27c00000-0000-4000-8000-000000000203'
WHERE id = '27c00000-0000-4000-8000-000000000103';

SELECT is(
  (
    SELECT result
    FROM public.finalize_product_draft_description_generation(
      '27c00000-0000-4000-8000-000000000103',
      '27c00000-0000-4000-8000-000000000001',
      (SELECT attempt_token FROM private_cover_claim),
      (SELECT category_id FROM private_cover_claim),
      (SELECT facts_revision FROM private_cover_claim),
      (SELECT cover_source FROM private_cover_claim),
      (SELECT cover_image_id FROM private_cover_claim),
      (SELECT cover_image_url FROM private_cover_claim),
      (SELECT cover_storage_bucket FROM private_cover_claim),
      (SELECT cover_object_key FROM private_cover_claim),
      (SELECT cover_content_type FROM private_cover_claim),
      (SELECT cover_size_bytes FROM private_cover_claim),
      '{"pl":"Polski opis","en":"English description","de":"Deutsche Beschreibung","vi":"Mo ta tieng Viet"}'::jsonb,
      'Blue cotton shirt',
      'openai',
      'gpt-5.4-nano',
      'product-description-v2',
      now()
    )
  ),
  'input_changed',
  'changing the selected cover rejects a complete late result'
);

SELECT results_eq(
  $$
    SELECT status, error_code
    FROM public.product_draft_description_generation_attempts
    WHERE product_draft_id = '27c00000-0000-4000-8000-000000000103'
  $$,
  $$
    VALUES (
      'failed'::text,
      'product_description_generation_input_changed'::text
    )
  $$,
  'a stale-cover finalization records the stable terminal error'
);

CREATE TEMP TABLE unusable_cover_claim AS
SELECT *
FROM public.claim_product_draft_description_generation(
  '27c00000-0000-4000-8000-000000000103',
  '27c00000-0000-4000-8000-000000000001'
);

SELECT is(
  public.fail_product_draft_description_generation(
    '27c00000-0000-4000-8000-000000000103',
    '27c00000-0000-4000-8000-000000000001',
    (SELECT attempt_token FROM unusable_cover_claim),
    'product_description_generation_image_not_usable'
  ),
  'failed',
  'an unusable image is accepted as a documented terminal attempt outcome'
);

SELECT * FROM finish();
ROLLBACK;
