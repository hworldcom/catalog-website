BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(14);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '40b20000-0000-4000-8000-000000000001',
  'qa-0040b2-working-copy',
  'QA 0040b2 Working Copy',
  'Q42'
);
SELECT pg_temp.approve_fixture_seller('40b20000-0000-4000-8000-000000000001');

CREATE TEMP TABLE qa_product AS
SELECT * FROM public.save_initial_product_draft_with_description(
  NULL,
  '40b20000-0000-4000-8000-000000000001',
  NULL,
  true,
  'Approved cotton shirt',
  false,
  NULL,
  (SELECT id FROM public.categories WHERE slug = 't-shirts'),
  10,
  '10 pieces',
  20,
  'EUR',
  'in_stock',
  false,
  NULL,
  false,
  'draft',
  ARRAY['women']::text[]
);

UPDATE public.product_draft_facts AS facts
SET facts_json = '{
    "schemaVersion": 2,
    "colors": ["blue"],
    "materialComposition": "100% cotton",
    "uncertainFields": [],
    "fieldSources": {"colors": "human", "materialComposition": "human"}
  }'::jsonb,
  facts_revision = 1
WHERE facts.product_draft_id = (SELECT product_draft_id FROM qa_product);

INSERT INTO public.product_draft_images (
  id, product_draft_id, source_position, status, destination_key,
  content_type, size_bytes, storage_bucket, source_kind, client_upload_id,
  original_filename
)
SELECT
  '40b20000-0000-4000-8000-000000000101', product_draft_id, 0, 'available',
  'product-drafts/qa/0040b2.jpg', 'image/jpeg', 100,
  'product-draft-images', 'seller_upload',
  '40b20000-0000-4000-8000-000000000201', 'approved.jpg'
FROM qa_product;

UPDATE public.products AS product
SET cover_image_id = '40b20000-0000-4000-8000-000000000101'
WHERE product.id = (SELECT product_draft_id FROM qa_product);

SELECT public.assign_product_code_for_publication(
  (SELECT product_draft_id FROM qa_product),
  '40b20000-0000-4000-8000-000000000001'
);

CREATE TEMP TABLE qa_initial_submission AS
SELECT * FROM public.submit_initial_product_moderation(
  (SELECT product_draft_id FROM qa_product),
  '40b20000-0000-4000-8000-000000000001',
  (SELECT moderation_revision FROM public.products
    WHERE id = (SELECT product_draft_id FROM qa_product)),
  '40b20000-0000-4000-8000-000000000301',
  '40b20000-0000-4000-8000-000000000401'
);

UPDATE public.product_moderation_submissions AS submission
SET review_status = 'approved',
  administrator_user_id = '40b20000-0000-4000-8000-000000000402',
  decision_request_id = '40b20000-0000-4000-8000-000000000302',
  decided_at = now()
WHERE submission.id = (SELECT id FROM qa_initial_submission);

SET LOCAL session_replication_role = replica;
UPDATE public.products AS product
SET status = 'published',
  approved_moderation_submission_id = (SELECT id FROM qa_initial_submission),
  active_moderation_submission_id = NULL
WHERE product.id = (SELECT product_draft_id FROM qa_product);
SET LOCAL session_replication_role = origin;

SELECT is(
  (SELECT count(*)::integer FROM public.begin_product_moderation_editing(
    (SELECT product_draft_id FROM qa_product),
    '40b20000-0000-4000-8000-000000000001'
  )),
  1,
  'deliberate Begin edit creates one working copy'
);

SELECT is(
  (SELECT count(*)::integer FROM public.ensure_product_moderation_working_copy(
    (SELECT product_draft_id FROM qa_product),
    '40b20000-0000-4000-8000-000000000001'
  )),
  1,
  'reopening the editor reuses the same working copy'
);

CREATE TEMP TABLE qa_title_update AS
SELECT * FROM public.update_initial_product_draft_title(
  (SELECT product_draft_id FROM qa_product),
  '40b20000-0000-4000-8000-000000000001',
  (SELECT revision FROM public.product_moderation_working_copies
    WHERE product_id = (SELECT product_draft_id FROM qa_product)),
  'Private revised shirt',
  'human'
);

SELECT is(
  (SELECT title FROM public.products WHERE id = (SELECT product_draft_id FROM qa_product)),
  'Approved cotton shirt',
  'editing a published title leaves the approved public title unchanged'
);

SELECT is(
  (SELECT snapshot_json ->> 'title' FROM public.product_moderation_working_copies
    WHERE product_id = (SELECT product_draft_id FROM qa_product)),
  'Private revised shirt',
  'the revised title is stored only in the private working copy'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.update_initial_product_draft_title(%L,%L,%s,%L,%L)',
    (SELECT product_draft_id FROM qa_product),
    '40b20000-0000-4000-8000-000000000001',
    (SELECT moderation_revision - 1 FROM qa_title_update),
    'Stale title',
    'human'
  ),
  '40001',
  'product_moderation_working_revision_conflict',
  'a stale working revision cannot overwrite a newer proposal'
);

CREATE TEMP TABLE qa_facts_update AS
SELECT * FROM public.apply_initial_product_draft_facts_patch(
  (SELECT product_draft_id FROM qa_product),
  '{"colors":["red"]}'::jsonb,
  '40b20000-0000-4000-8000-000000000001',
  (SELECT moderation_revision FROM qa_title_update)
);

SELECT is(
  (SELECT facts_json -> 'colors' FROM public.product_draft_facts
    WHERE product_draft_id = (SELECT product_draft_id FROM qa_product)),
  '["blue"]'::jsonb,
  'working facts edits leave the approved facts baseline unchanged'
);

SELECT is(
  (SELECT snapshot_json #> '{facts,facts,colors}'
    FROM public.product_moderation_working_copies
    WHERE product_id = (SELECT product_draft_id FROM qa_product)),
  '["red"]'::jsonb,
  'working facts edits update the private complete snapshot'
);

CREATE TEMP TABLE qa_update_submission AS
SELECT * FROM public.submit_product_moderation(
  (SELECT product_draft_id FROM qa_product),
  '40b20000-0000-4000-8000-000000000001',
  (SELECT moderation_revision FROM qa_facts_update),
  '40b20000-0000-4000-8000-000000000303',
  '40b20000-0000-4000-8000-000000000401'
);

SELECT is(
  (SELECT submission_kind FROM qa_update_submission),
  'update',
  'a published working copy creates an update submission'
);

SELECT is(
  (SELECT snapshot_json ->> 'title' FROM qa_update_submission),
  'Private revised shirt',
  'the immutable update submission contains the complete private proposal'
);

SELECT is(
  (SELECT count(*)::integer FROM public.product_moderation_submission_images
    WHERE submission_id = (SELECT id FROM qa_update_submission)),
  1,
  'the update submission freezes its ordered private image membership'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.update_initial_product_draft_title(%L,%L,%s,%L,%L)',
    (SELECT product_draft_id FROM qa_product),
    '40b20000-0000-4000-8000-000000000001',
    (SELECT revision FROM qa_update_submission),
    'Edit during review',
    'human'
  ),
  '55000',
  'product_moderation_submission_conflict',
  'an active update submission locks the working copy'
);

CREATE TEMP TABLE qa_withdrawn AS
SELECT * FROM public.withdraw_product_moderation(
  (SELECT product_draft_id FROM qa_product),
  '40b20000-0000-4000-8000-000000000001',
  (SELECT id FROM qa_update_submission),
  (SELECT revision FROM qa_update_submission),
  '40b20000-0000-4000-8000-000000000304',
  '40b20000-0000-4000-8000-000000000401'
);

SELECT is(
  (SELECT review_status FROM qa_withdrawn),
  'withdrawn',
  'the seller can withdraw the pending update submission'
);

SELECT ok(
  (SELECT revision FROM public.product_moderation_working_copies
    WHERE product_id = (SELECT product_draft_id FROM qa_product))
    > (SELECT revision FROM qa_update_submission)
  AND (SELECT active_moderation_submission_id IS NULL FROM public.products
    WHERE id = (SELECT product_draft_id FROM qa_product)),
  'withdrawal unlocks a newer private revision without changing the public product'
);

SELECT throws_ok(
  format(
    'UPDATE public.products SET price = %s WHERE id = %L',
    999,
    (SELECT product_draft_id FROM qa_product)
  ),
  '55000',
  'product_moderation_product_not_editable',
  'the database rejects direct writes to an approved public projection'
);

SELECT * FROM finish();
ROLLBACK;
