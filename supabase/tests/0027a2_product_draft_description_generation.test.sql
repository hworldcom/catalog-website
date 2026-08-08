BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT no_plan();

SELECT has_table(
  'public',
  'product_draft_description_generation_attempts',
  'description generation attempts have a durable table'
);

SELECT ok(
  NOT has_table_privilege(
    'anon',
    'public.product_draft_description_generation_attempts',
    'SELECT'
  )
  AND NOT has_table_privilege(
    'authenticated',
    'public.product_draft_description_generation_attempts',
    'SELECT'
  )
  AND has_table_privilege(
    'service_role',
    'public.product_draft_description_generation_attempts',
    'SELECT'
  )
  AND NOT has_table_privilege(
    'service_role',
    'public.product_draft_description_generation_attempts',
    'INSERT'
  ),
  'attempt rows are readable only by the service role and writable only through functions'
);

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
  AND has_function_privilege(
    'service_role',
    'public.finalize_product_draft_description_generation(uuid,uuid,uuid,uuid,integer,text,uuid,text,text,text,text,bigint,jsonb,text,text,text,text,timestamptz)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.fail_product_draft_description_generation(uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  'only the service role can coordinate description generation'
);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES
  (
    '27a20000-0000-4000-8000-000000000001',
    'qa-0027a2-owner',
    'QA 0027a2 Owner',
    'Q27'
  ),
  (
    '27a20000-0000-4000-8000-000000000002',
    'qa-0027a2-other',
    'QA 0027a2 Other',
    'Q28'
  );

CREATE FUNCTION pg_temp.qa_product_code(p_product_id uuid, p_seller_id uuid)
RETURNS text
LANGUAGE sql
AS $$
  SELECT public.reserve_product_code(
    p_product_id,
    p_seller_id,
    (SELECT id FROM public.categories WHERE slug = 't-shirts')
  );
$$;

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
VALUES (
  '27a20000-0000-4000-8000-000000000101',
  '27a20000-0000-4000-8000-000000000001',
  pg_temp.qa_product_code(
    '27a20000-0000-4000-8000-000000000101',
    '27a20000-0000-4000-8000-000000000001'
  ),
  '',
  NULL,
  'draft',
  (SELECT id FROM public.categories WHERE slug = 't-shirts'),
  NULL
);

INSERT INTO public.direct_product_legacy_cover_allowances (
  product_draft_id,
  recorded_cover_image_url
)
VALUES (
  '27a20000-0000-4000-8000-000000000101',
  'https://example.supabase.co/storage/v1/object/public/product-images/qa/0027a2-cover.jpg'
);

UPDATE public.products
SET cover_image_url =
  'https://example.supabase.co/storage/v1/object/public/product-images/qa/0027a2-cover.jpg'
WHERE id = '27a20000-0000-4000-8000-000000000101';

SELECT lives_ok(
  format(
    $sql$
      SELECT * FROM public.apply_scoped_product_draft_description_patch(
        %L, %L,
        false, NULL,
        true, 'Human English description',
        false, NULL,
        false, NULL
      )
    $sql$,
    '27a20000-0000-4000-8000-000000000101',
    '27a20000-0000-4000-8000-000000000001'
  ),
  'a human English description is prepared before generation'
);

CREATE TEMP TABLE first_claim AS
SELECT *
FROM public.claim_product_draft_description_generation(
  '27a20000-0000-4000-8000-000000000101',
  '27a20000-0000-4000-8000-000000000001'
);

SELECT is((SELECT result FROM first_claim), 'claimed', 'the owning seller can claim generation');

SELECT is(
  (SELECT category_slug FROM first_claim),
  't-shirts',
  'the claim returns the assigned category'
);

SELECT is(
  (SELECT facts_json ->> 'schemaVersion' FROM first_claim),
  '2',
  'the claim returns valid version 2 facts'
);

SELECT results_eq(
  $$ SELECT unnest(human_languages) FROM first_claim $$,
  $$ VALUES ('en'::text) $$,
  'the claim reports current human languages'
);

SELECT is(
  (SELECT title_blank FROM first_claim),
  true,
  'the claim reports that a title proposal is allowed'
);

SELECT is(
  (
    SELECT result
    FROM public.claim_product_draft_description_generation(
      '27a20000-0000-4000-8000-000000000101',
      '27a20000-0000-4000-8000-000000000001'
    )
  ),
  'in_progress',
  'a second request cannot take an active claim'
);

SELECT is(
  (
    SELECT result
    FROM public.claim_product_draft_description_generation(
      '27a20000-0000-4000-8000-000000000101',
      '27a20000-0000-4000-8000-000000000002'
    )
  ),
  'not_found',
  'a cross-seller claim is indistinguishable from an unknown ProductDraft'
);

SELECT is(
  (
    SELECT result
    FROM public.finalize_product_draft_description_generation(
      '27a20000-0000-4000-8000-000000000101',
      '27a20000-0000-4000-8000-000000000001',
      gen_random_uuid(),
      (SELECT category_id FROM first_claim),
      (SELECT facts_revision FROM first_claim),
      (SELECT cover_source FROM first_claim),
      (SELECT cover_image_id FROM first_claim),
      (SELECT cover_image_url FROM first_claim),
      (SELECT cover_storage_bucket FROM first_claim),
      (SELECT cover_object_key FROM first_claim),
      (SELECT cover_content_type FROM first_claim),
      (SELECT cover_size_bytes FROM first_claim),
      '{"pl":"Polski opis","en":"Generated English","de":"Deutsche Beschreibung","vi":"Mo ta tieng Viet"}'::jsonb,
      'Generated cotton shirt',
      'openai',
      'gpt-5.4-nano',
      'product-description-v2',
      now()
    )
  ),
  'superseded',
  'a non-owning token cannot finalize'
);

SELECT lives_ok(
  format(
    $sql$
      SELECT * FROM public.apply_scoped_product_draft_description_patch(
        %L, %L,
        false, NULL,
        false, NULL,
        true, 'Human German description',
        false, NULL
      )
    $sql$,
    '27a20000-0000-4000-8000-000000000101',
    '27a20000-0000-4000-8000-000000000001'
  ),
  'a concurrent human edit can be committed while provider work is running'
);

CREATE TEMP TABLE first_finalization AS
SELECT *
FROM public.finalize_product_draft_description_generation(
  '27a20000-0000-4000-8000-000000000101',
  '27a20000-0000-4000-8000-000000000001',
  (SELECT attempt_token FROM first_claim),
  (SELECT category_id FROM first_claim),
  (SELECT facts_revision FROM first_claim),
  (SELECT cover_source FROM first_claim),
  (SELECT cover_image_id FROM first_claim),
  (SELECT cover_image_url FROM first_claim),
  (SELECT cover_storage_bucket FROM first_claim),
  (SELECT cover_object_key FROM first_claim),
  (SELECT cover_content_type FROM first_claim),
  (SELECT cover_size_bytes FROM first_claim),
  '{"pl":"Polski opis","en":"Generated English","de":"Deutsche Beschreibung","vi":"Mo ta tieng Viet"}'::jsonb,
  'Generated cotton shirt',
  'openai',
  'gpt-5.4-nano',
  'product-description-v2',
  now()
);

SELECT is(
  (SELECT result FROM first_finalization),
  'completed',
  'the owning token finalizes all generated output atomically'
);

SELECT results_eq(
  $$
    SELECT language, source, description_text
    FROM public.product_draft_descriptions
    WHERE product_draft_id = '27a20000-0000-4000-8000-000000000101'
    ORDER BY language
  $$,
  $$
    VALUES
      ('de'::text, 'human'::text, 'Human German description'::text),
      ('en'::text, 'human'::text, 'Human English description'::text),
      ('pl'::text, 'model'::text, 'Polski opis'::text),
      ('vi'::text, 'model'::text, 'Mo ta tieng Viet'::text)
  $$,
  'finalization preserves human English and writes only eligible model rows'
);

SELECT results_eq(
  $$
    SELECT title, title_source, description
    FROM public.products
    WHERE id = '27a20000-0000-4000-8000-000000000101'
  $$,
  $$ VALUES ('Generated cotton shirt'::text, 'model'::text, 'Human English description'::text) $$,
  'a valid title proposal fills a blank title and English remains projected'
);

SELECT results_eq(
  $$
    SELECT status, attempt_count, attempt_token, error_code
    FROM public.product_draft_description_generation_attempts
    WHERE product_draft_id = '27a20000-0000-4000-8000-000000000101'
  $$,
  $$ VALUES ('completed'::text, 1, NULL::uuid, NULL::text) $$,
  'successful finalization releases claim ownership'
);

CREATE TEMP TABLE regeneration_claim AS
SELECT *
FROM public.claim_product_draft_description_generation(
  '27a20000-0000-4000-8000-000000000101',
  '27a20000-0000-4000-8000-000000000001'
);

SELECT is(
  (
    SELECT result
    FROM public.finalize_product_draft_description_generation(
      '27a20000-0000-4000-8000-000000000101',
      '27a20000-0000-4000-8000-000000000001',
      (SELECT attempt_token FROM regeneration_claim),
      (SELECT category_id FROM regeneration_claim),
      (SELECT facts_revision FROM regeneration_claim),
      (SELECT cover_source FROM regeneration_claim),
      (SELECT cover_image_id FROM regeneration_claim),
      (SELECT cover_image_url FROM regeneration_claim),
      (SELECT cover_storage_bucket FROM regeneration_claim),
      (SELECT cover_object_key FROM regeneration_claim),
      (SELECT cover_content_type FROM regeneration_claim),
      (SELECT cover_size_bytes FROM regeneration_claim),
      '{"pl":"Nowy polski opis","en":"New generated English","de":"Neue deutsche Beschreibung","vi":"Mo ta tieng Viet moi"}'::jsonb,
      NULL,
      'openai',
      'gpt-5.4-nano',
      'product-description-v2',
      now()
    )
  ),
  'completed',
  'an explicit regeneration can replace existing model descriptions'
);

SELECT results_eq(
  $$
    SELECT language, source, description_text
    FROM public.product_draft_descriptions
    WHERE product_draft_id = '27a20000-0000-4000-8000-000000000101'
    ORDER BY language
  $$,
  $$
    VALUES
      ('de'::text, 'human'::text, 'Human German description'::text),
      ('en'::text, 'human'::text, 'Human English description'::text),
      ('pl'::text, 'model'::text, 'Nowy polski opis'::text),
      ('vi'::text, 'model'::text, 'Mo ta tieng Viet moi'::text)
  $$,
  'regeneration preserves human rows and replaces only model rows'
);

CREATE TEMP TABLE stale_claim AS
SELECT *
FROM public.claim_product_draft_description_generation(
  '27a20000-0000-4000-8000-000000000101',
  '27a20000-0000-4000-8000-000000000001'
);

UPDATE public.product_draft_facts
SET facts_revision = facts_revision + 1
WHERE product_draft_id = '27a20000-0000-4000-8000-000000000101';

SELECT is(
  (
    SELECT result
    FROM public.finalize_product_draft_description_generation(
      '27a20000-0000-4000-8000-000000000101',
      '27a20000-0000-4000-8000-000000000001',
      (SELECT attempt_token FROM stale_claim),
      (SELECT category_id FROM stale_claim),
      (SELECT facts_revision FROM stale_claim),
      (SELECT cover_source FROM stale_claim),
      (SELECT cover_image_id FROM stale_claim),
      (SELECT cover_image_url FROM stale_claim),
      (SELECT cover_storage_bucket FROM stale_claim),
      (SELECT cover_object_key FROM stale_claim),
      (SELECT cover_content_type FROM stale_claim),
      (SELECT cover_size_bytes FROM stale_claim),
      '{"pl":"Nowy opis","en":"New English","de":"Neue Beschreibung","vi":"Mo ta moi"}'::jsonb,
      NULL,
      'openai',
      'gpt-5.4-nano',
      'product-description-v2',
      now()
    )
  ),
  'input_changed',
  'a facts revision change rejects the complete stale result'
);

SELECT results_eq(
  $$
    SELECT status, error_code
    FROM public.product_draft_description_generation_attempts
    WHERE product_draft_id = '27a20000-0000-4000-8000-000000000101'
  $$,
  $$ VALUES ('failed'::text, 'product_description_generation_input_changed'::text) $$,
  'a stale finalization records a terminal failure and releases ownership'
);

CREATE TEMP TABLE failed_claim AS
SELECT *
FROM public.claim_product_draft_description_generation(
  '27a20000-0000-4000-8000-000000000101',
  '27a20000-0000-4000-8000-000000000001'
);

SELECT is(
  public.fail_product_draft_description_generation(
    '27a20000-0000-4000-8000-000000000101',
    '27a20000-0000-4000-8000-000000000001',
    (SELECT attempt_token FROM failed_claim),
    'product_description_generation_provider_failed'
  ),
  'failed',
  'a handled provider failure releases the owning claim'
);

SELECT results_eq(
  $$
    SELECT status, attempt_count, error_code
    FROM public.product_draft_description_generation_attempts
    WHERE product_draft_id = '27a20000-0000-4000-8000-000000000101'
  $$,
  $$ VALUES ('failed'::text, 4, 'product_description_generation_provider_failed'::text) $$,
  'each new claim increments attempt_count and stores stable failure metadata'
);

CREATE TEMP TABLE expired_claim AS
SELECT *
FROM public.claim_product_draft_description_generation(
  '27a20000-0000-4000-8000-000000000101',
  '27a20000-0000-4000-8000-000000000001'
);

UPDATE public.product_draft_description_generation_attempts
SET claim_started_at = now() - interval '181 seconds'
WHERE product_draft_id = '27a20000-0000-4000-8000-000000000101';

SELECT is(
  public.fail_product_draft_description_generation(
    '27a20000-0000-4000-8000-000000000101',
    '27a20000-0000-4000-8000-000000000001',
    (SELECT attempt_token FROM expired_claim),
    'product_description_generation_provider_timeout'
  ),
  'superseded',
  'an expired token cannot record a late failure'
);

CREATE TEMP TABLE replacement_claim AS
SELECT *
FROM public.claim_product_draft_description_generation(
  '27a20000-0000-4000-8000-000000000101',
  '27a20000-0000-4000-8000-000000000001'
);

SELECT is(
  (SELECT result FROM replacement_claim),
  'claimed',
  'a new request can replace an expired running claim'
);

SELECT is(
  (
    SELECT result
    FROM public.finalize_product_draft_description_generation(
      '27a20000-0000-4000-8000-000000000101',
      '27a20000-0000-4000-8000-000000000001',
      (SELECT attempt_token FROM expired_claim),
      (SELECT category_id FROM expired_claim),
      (SELECT facts_revision FROM expired_claim),
      (SELECT cover_source FROM expired_claim),
      (SELECT cover_image_id FROM expired_claim),
      (SELECT cover_image_url FROM expired_claim),
      (SELECT cover_storage_bucket FROM expired_claim),
      (SELECT cover_object_key FROM expired_claim),
      (SELECT cover_content_type FROM expired_claim),
      (SELECT cover_size_bytes FROM expired_claim),
      '{}'::jsonb,
      NULL,
      '',
      '',
      '',
      now()
    )
  ),
  'superseded',
  'a superseded token is rejected before late output is interpreted'
);

SELECT throws_ok(
  format(
    $sql$
    SELECT public.fail_product_draft_description_generation(
      '27a20000-0000-4000-8000-000000000101',
      '27a20000-0000-4000-8000-000000000001',
      %L,
      'arbitrary_error'
    )
    $sql$,
    (SELECT attempt_token FROM replacement_claim)
  ),
  '22023',
  'product_description_generation_invalid',
  'failure finalization rejects undocumented error codes'
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
VALUES (
  '27a20000-0000-4000-8000-000000000103',
  '27a20000-0000-4000-8000-000000000001',
  pg_temp.qa_product_code(
    '27a20000-0000-4000-8000-000000000103',
    '27a20000-0000-4000-8000-000000000001'
  ),
  'Fully human',
  'human',
  'draft',
  (SELECT id FROM public.categories WHERE slug = 't-shirts'),
  NULL
);

INSERT INTO public.direct_product_legacy_cover_allowances (
  product_draft_id,
  recorded_cover_image_url
)
VALUES (
  '27a20000-0000-4000-8000-000000000103',
  'https://example.supabase.co/storage/v1/object/public/product-images/qa/0027a2-human-cover.jpg'
);

UPDATE public.products
SET cover_image_url =
  'https://example.supabase.co/storage/v1/object/public/product-images/qa/0027a2-human-cover.jpg'
WHERE id = '27a20000-0000-4000-8000-000000000103';

SELECT lives_ok(
  format(
    $sql$
      SELECT * FROM public.apply_scoped_product_draft_description_patch(
        %L, %L,
        true, 'Polski opis',
        true, 'English description',
        true, 'Deutsche Beschreibung',
        true, 'Mo ta tieng Viet'
      )
    $sql$,
    '27a20000-0000-4000-8000-000000000103',
    '27a20000-0000-4000-8000-000000000001'
  ),
  'all four human descriptions are prepared'
);

SELECT is(
  (
    SELECT result
    FROM public.claim_product_draft_description_generation(
      '27a20000-0000-4000-8000-000000000103',
      '27a20000-0000-4000-8000-000000000001'
    )
  ),
  'no_writable_targets',
  'generation does not claim work when every language and title are human-owned'
);

SELECT * FROM finish();
ROLLBACK;
