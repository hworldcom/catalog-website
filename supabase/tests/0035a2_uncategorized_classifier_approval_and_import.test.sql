BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(19);

SELECT col_is_null(
  'public',
  'classifier_import_group_outcomes',
  'approved_category_slug',
  'classifier import outcomes may preserve an explicit null category'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.prepare_classifier_import_group(uuid,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  'group preparation remains service-role only and callable by the worker'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.prepare_classifier_import_group(uuid,uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  'authenticated browsers cannot prepare classifier imports directly'
);

INSERT INTO public.sellers (id, slug, name, published, company_code)
VALUES (
  '35a20000-0000-0000-0000-000000000001',
  'qa-0035a2-seller',
  'QA 0035a2 Seller',
  true,
  'Q52'
);

INSERT INTO public.classifier_import_runs (
  id,
  classifier_organization_id,
  classifier_batch_id,
  seller_id
)
VALUES (
  '35a20000-0000-0000-0000-000000000010',
  '35a20000-0000-0000-0000-000000000011',
  '35a20000-0000-0000-0000-000000000012',
  '35a20000-0000-0000-0000-000000000001'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.claim_classifier_import_run(
      '35a20000-0000-0000-0000-000000000010',
      900
    )
  ),
  1,
  'the import run can be claimed for group preparation'
);

CREATE TEMP TABLE qa_0035a2_attempt AS
SELECT id AS import_id, attempt_token
FROM public.classifier_import_runs
WHERE id = '35a20000-0000-0000-0000-000000000010';

CREATE TEMP TABLE qa_0035a2_categoryless AS
SELECT *
FROM public.prepare_classifier_import_group_at_position(
  (SELECT import_id FROM qa_0035a2_attempt),
  (SELECT attempt_token FROM qa_0035a2_attempt),
  '35a20000-0000-0000-0000-000000000021',
  NULL,
  '35a20000-0000-0000-0000-000000000031',
  0
);

SELECT is(
  (SELECT result FROM qa_0035a2_categoryless),
  'prepared',
  'an explicitly categoryless classifier group is prepared successfully'
);

SELECT results_eq(
  $$
    SELECT product.category_id, product.product_code, product.title, product.status
    FROM public.products AS product
    WHERE product.id = (SELECT product_draft_id FROM qa_0035a2_categoryless)
  $$,
  $$
    VALUES (NULL::uuid, NULL::text, ''::text, 'draft'::public.product_status)
  $$,
  'a categoryless import creates the canonical incomplete ProductDraft'
);

SELECT results_eq(
  $$
    SELECT approved_category_slug, status, error_code
    FROM public.classifier_import_group_outcomes
    WHERE classifier_import_run_id = (SELECT import_id FROM qa_0035a2_attempt)
      AND classifier_group_id = '35a20000-0000-0000-0000-000000000021'
  $$,
  $$ VALUES (NULL::text, 'pending'::public.classifier_import_group_status, NULL::text) $$,
  'the successful outcome preserves the explicit null source category'
);

SELECT is(
  (
    SELECT result
    FROM public.prepare_classifier_import_group_images(
      (SELECT import_id FROM qa_0035a2_attempt),
      (SELECT attempt_token FROM qa_0035a2_attempt),
      '35a20000-0000-0000-0000-000000000021',
      '35a20000-0000-0000-0000-000000000031',
      '[{
        "image_id": "35a20000-0000-0000-0000-000000000031",
        "source_position": 0,
        "is_duplicate": false,
        "duplicate_of_image_id": null
      }]'::jsonb
    )
  ),
  'prepared',
  'the categoryless ProductDraft remains image-backed'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_draft_source_memberships
    WHERE product_draft_id = (SELECT product_draft_id FROM qa_0035a2_categoryless)
  ),
  1,
  'image preparation creates the immutable source membership'
);

SELECT is(
  (
    SELECT result
    FROM public.prepare_classifier_import_group_at_position(
      (SELECT import_id FROM qa_0035a2_attempt),
      (SELECT attempt_token FROM qa_0035a2_attempt),
      '35a20000-0000-0000-0000-000000000021',
      't-shirts',
      '35a20000-0000-0000-0000-000000000031',
      0
    )
  ),
  'prepared',
  'a retry returns the existing categoryless ProductDraft'
);

SELECT results_eq(
  $$
    SELECT outcome.approved_category_slug, product.category_id, product.product_code
    FROM public.classifier_import_group_outcomes AS outcome
    JOIN public.products AS product ON product.id = outcome.product_draft_id
    WHERE outcome.classifier_import_run_id = (SELECT import_id FROM qa_0035a2_attempt)
      AND outcome.classifier_group_id = '35a20000-0000-0000-0000-000000000021'
  $$,
  $$ VALUES (NULL::text, NULL::uuid, NULL::text) $$,
  'a retry cannot replace the original source slug or re-resolve the draft category'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.products
    WHERE classifier_organization_id = '35a20000-0000-0000-0000-000000000011'
      AND classifier_group_id = '35a20000-0000-0000-0000-000000000021'
  ),
  1,
  'retry creates no second ProductDraft'
);

SELECT is(
  (
    SELECT result
    FROM public.prepare_classifier_import_group_at_position(
      (SELECT import_id FROM qa_0035a2_attempt),
      (SELECT attempt_token FROM qa_0035a2_attempt),
      '35a20000-0000-0000-0000-000000000022',
      'taxonomy-drifted-category',
      '35a20000-0000-0000-0000-000000000032',
      1
    )
  ),
  'prepared',
  'an unmapped classifier slug creates review work instead of a group failure'
);

SELECT results_eq(
  $$
    SELECT outcome.approved_category_slug, product.category_id, product.product_code
    FROM public.classifier_import_group_outcomes AS outcome
    JOIN public.products AS product ON product.id = outcome.product_draft_id
    WHERE outcome.classifier_import_run_id = (SELECT import_id FROM qa_0035a2_attempt)
      AND outcome.classifier_group_id = '35a20000-0000-0000-0000-000000000022'
  $$,
  $$ VALUES ('taxonomy-drifted-category'::text, NULL::uuid, NULL::text) $$,
  'an unmapped source slug remains observable without becoming a Bazoria category'
);

SELECT is(
  (
    SELECT result
    FROM public.prepare_classifier_import_group_at_position(
      (SELECT import_id FROM qa_0035a2_attempt),
      (SELECT attempt_token FROM qa_0035a2_attempt),
      '35a20000-0000-0000-0000-000000000023',
      'fashion',
      '35a20000-0000-0000-0000-000000000033',
      2
    )
  ),
  'prepared',
  'an unsupported parent category also creates an uncategorized draft'
);

SELECT results_eq(
  $$
    SELECT product.category_id, product.product_code
    FROM public.classifier_import_group_outcomes AS outcome
    JOIN public.products AS product ON product.id = outcome.product_draft_id
    WHERE outcome.classifier_import_run_id = (SELECT import_id FROM qa_0035a2_attempt)
      AND outcome.classifier_group_id = '35a20000-0000-0000-0000-000000000023'
  $$,
  $$ VALUES (NULL::uuid, NULL::text) $$,
  'an unsupported category is not assigned to the ProductDraft'
);

SELECT is(
  (
    SELECT result
    FROM public.prepare_classifier_import_group_at_position(
      (SELECT import_id FROM qa_0035a2_attempt),
      (SELECT attempt_token FROM qa_0035a2_attempt),
      '35a20000-0000-0000-0000-000000000024',
      't-shirts',
      '35a20000-0000-0000-0000-000000000034',
      3
    )
  ),
  'prepared',
  'a supported Fashion leaf remains mapped during import'
);

SELECT results_eq(
  $$
    SELECT category.slug, product.product_code
    FROM public.classifier_import_group_outcomes AS outcome
    JOIN public.products AS product ON product.id = outcome.product_draft_id
    JOIN public.categories AS category ON category.id = product.category_id
    WHERE outcome.classifier_import_run_id = (SELECT import_id FROM qa_0035a2_attempt)
      AND outcome.classifier_group_id = '35a20000-0000-0000-0000-000000000024'
  $$,
  $$ VALUES ('t-shirts'::text, NULL::text) $$,
  'a supported category is assigned without allocating a product code'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_code_allocations AS allocation
    JOIN public.products AS product ON product.id = allocation.product_id
    WHERE product.classifier_organization_id =
      '35a20000-0000-0000-0000-000000000011'
  ),
  0,
  'classifier import never allocates product codes before publication'
);

SELECT * FROM finish();
ROLLBACK;
