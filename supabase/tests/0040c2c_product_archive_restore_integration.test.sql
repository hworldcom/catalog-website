BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(39);

INSERT INTO public.sellers (id, slug, name, company_code)
VALUES (
  '40c2c000-0000-4000-8000-000000000001',
  'qa-0040c2c-archive-restore',
  'QA 0040c2c Archive Restore',
  'Q2C'
);
SELECT pg_temp.approve_fixture_seller('40c2c000-0000-4000-8000-000000000001');
UPDATE public.sellers
SET owner_id = '40000000-0000-4000-8000-000000000001'
WHERE id = '40c2c000-0000-4000-8000-000000000001';

SELECT is(
  has_table_privilege(
    'authenticated', 'public.product_archive_restore_operations', 'SELECT'
  ),
  false,
  'browser roles cannot read archive and restore receipts'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.list_seller_products_for_moderation(uuid,text,integer,timestamptz,uuid)',
    'EXECUTE'
  ),
  false,
  'browser roles cannot invoke the seller moderation list directly'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.archive_seller_product_with_moderation(uuid,bigint,uuid,uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'browser roles cannot archive through the protected database function'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.restore_seller_product_for_moderation(uuid,bigint,uuid,uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'browser roles cannot restore through the protected database function'
);
SELECT is(
  has_function_privilege(
    'service_role',
    'public.archive_initial_product_draft(uuid,uuid,bigint)',
    'EXECUTE'
  ),
  false,
  'the superseded archive function is no longer callable by the application role'
);

CREATE FUNCTION pg_temp.create_published_product(
  p_title text,
  p_image_id uuid,
  p_client_upload_id uuid,
  p_public_url text
)
RETURNS TABLE (
  product_id uuid,
  approved_submission_id uuid,
  run_id uuid,
  approved_revision bigint,
  product_code text
)
LANGUAGE plpgsql
AS $$
DECLARE
  draft record;
  submission record;
  approval record;
  claim jsonb;
BEGIN
  SELECT * INTO draft
  FROM public.save_initial_product_draft_with_description(
    NULL,
    '40c2c000-0000-4000-8000-000000000001',
    NULL,
    true,
    p_title,
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

  INSERT INTO public.product_draft_images (
    id, product_draft_id, source_position, status, destination_key,
    content_type, size_bytes, storage_bucket, source_kind,
    client_upload_id, original_filename
  ) VALUES (
    p_image_id,
    draft.product_draft_id,
    0,
    'available',
    'product-drafts/qa/' || p_image_id::text || '.jpg',
    'image/jpeg',
    100,
    'product-draft-images',
    'seller_upload',
    p_client_upload_id,
    p_title || '.jpg'
  );
  UPDATE public.products
  SET cover_image_id = p_image_id
  WHERE id = draft.product_draft_id;

  SELECT * INTO submission
  FROM public.submit_product_moderation(
    draft.product_draft_id,
    '40c2c000-0000-4000-8000-000000000001',
    (SELECT moderation_revision FROM public.products WHERE id = draft.product_draft_id),
    gen_random_uuid(),
    '40000000-0000-4000-8000-000000000001'
  );
  SELECT * INTO approval
  FROM public.decide_product_moderation_submission(
    submission.id,
    submission.revision,
    'approve',
    NULL,
    gen_random_uuid(),
    '40000000-0000-4000-8000-000000000099'
  );
  PERFORM public.record_product_activation_dispatch_result(
    approval.activation_run_id, approval.dispatch_generation, 'dispatched'
  );
  claim := public.claim_product_activation_run(
    approval.activation_run_id, approval.dispatch_generation, 360
  );
  PERFORM public.record_product_activation_object_created(
    approval.activation_run_id,
    approval.dispatch_generation,
    (claim ->> 'attemptToken')::uuid,
    p_image_id,
    repeat('a', 64),
    100,
    repeat('a', 64),
    '"initial-etag"',
    p_public_url
  );
  PERFORM public.verify_product_activation_item(
    approval.activation_run_id,
    approval.dispatch_generation,
    (claim ->> 'attemptToken')::uuid,
    p_image_id,
    100,
    repeat('a', 64),
    '"initial-etag"'
  );
  PERFORM public.finalize_product_activation(
    approval.activation_run_id,
    approval.dispatch_generation,
    (claim ->> 'attemptToken')::uuid
  );

  RETURN QUERY
  SELECT
    draft.product_draft_id,
    submission.id,
    approval.activation_run_id,
    submission.revision,
    product.product_code
  FROM public.products AS product
  WHERE product.id = draft.product_draft_id;
END;
$$;

CREATE TEMP TABLE base_product AS
SELECT * FROM pg_temp.create_published_product(
  'Archive restore shirt',
  '40c2c000-0000-4000-8000-000000000101',
  '40c2c000-0000-4000-8000-000000000201',
  'https://example.test/archive-restore-initial.jpg'
);

SELECT is(
  (SELECT status::text FROM public.products WHERE id = (SELECT product_id FROM base_product)),
  'published',
  'the archive fixture begins as a completely activated public product'
);
SELECT is(
  (SELECT moderation_revision FROM public.list_seller_products_for_moderation(
    '40c2c000-0000-4000-8000-000000000001', 'active', 10, NULL, NULL
  ) WHERE id = (SELECT product_id FROM base_product)),
  (SELECT approved_revision FROM base_product),
  'the seller list exposes the approved submission as the action revision'
);

CREATE TEMP TABLE archived_result AS
SELECT * FROM public.archive_seller_product_with_moderation(
  (SELECT product_id FROM base_product),
  (SELECT approved_revision FROM base_product),
  '40c2c000-0000-4000-8000-000000000301',
  '40c2c000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001'
);
SELECT is(
  (SELECT result FROM archived_result),
  'archived',
  'an inactive published product archives atomically'
);
SELECT is(
  (SELECT status::text FROM public.products WHERE id = (SELECT product_id FROM base_product)),
  'archived',
  'archive immediately hides the public product by status'
);
SELECT is(
  (SELECT approved_moderation_submission_id FROM public.products
   WHERE id = (SELECT product_id FROM base_product)),
  (SELECT approved_submission_id FROM base_product),
  'archive retains the immutable approved submission pointer'
);
SELECT is(
  (SELECT count(*)::integer FROM public.product_images
   WHERE product_id = (SELECT product_id FROM base_product)),
  1,
  'archive retains the public image projection and objects'
);
SELECT is(
  (SELECT count(*)::integer FROM public.product_archive_restore_operations
   WHERE request_id = '40c2c000-0000-4000-8000-000000000301'),
  1,
  'archive stores one durable operation receipt'
);
SELECT is(
  (SELECT result FROM public.archive_seller_product_with_moderation(
    (SELECT product_id FROM base_product),
    (SELECT approved_revision FROM base_product),
    '40c2c000-0000-4000-8000-000000000301',
    '40c2c000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  )),
  'archived',
  'an exact archive replay returns its stored result'
);
SELECT is(
  (SELECT result FROM public.restore_seller_product_for_moderation(
    (SELECT product_id FROM base_product),
    (SELECT approved_revision FROM base_product),
    '40c2c000-0000-4000-8000-000000000301',
    '40c2c000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  )),
  'product_restore_request_conflict',
  'a request identifier cannot be reused for the other action'
);

CREATE TEMP TABLE restored_result AS
SELECT * FROM public.restore_seller_product_for_moderation(
  (SELECT product_id FROM base_product),
  (SELECT approved_revision FROM base_product),
  '40c2c000-0000-4000-8000-000000000302',
  '40c2c000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001'
);
SELECT is(
  (SELECT result FROM restored_result),
  'restoration_draft',
  'restore creates a private restoration proposal'
);
SELECT is(
  (SELECT status::text FROM public.products WHERE id = (SELECT product_id FROM base_product)),
  'archived',
  'restore never republishes the retained projection'
);
SELECT is(
  (SELECT snapshot_json ->> 'title' FROM public.product_moderation_working_copies
   WHERE product_id = (SELECT product_id FROM base_product)),
  'Archive restore shirt',
  'the restoration proposal starts from the approved immutable snapshot'
);
SELECT is(
  (SELECT count(*)::integer FROM public.product_moderation_working_copy_images
   WHERE product_id = (SELECT product_id FROM base_product)),
  1,
  'restore copies the approved image membership exactly once'
);
SELECT is(
  (SELECT count(*)::integer FROM public.read_product_moderation_edit_state(
    (SELECT product_id FROM base_product),
    '40c2c000-0000-4000-8000-000000000001'
  )),
  1,
  'a restored archived product becomes available to the seller edit read'
);
SELECT is(
  (SELECT result FROM public.restore_seller_product_for_moderation(
    (SELECT product_id FROM base_product),
    (SELECT approved_revision FROM base_product),
    '40c2c000-0000-4000-8000-000000000302',
    '40c2c000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  )),
  'restoration_draft',
  'an exact restore request replays after state advances'
);
SELECT is(
  (SELECT moderation_revision FROM public.restore_seller_product_for_moderation(
    (SELECT product_id FROM base_product),
    (SELECT moderation_revision FROM restored_result),
    '40c2c000-0000-4000-8000-000000000303',
    '40c2c000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  )),
  (SELECT moderation_revision FROM restored_result),
  'a second restore request returns the same private revision'
);
SELECT results_eq(
  $$
    SELECT has_working_copy, moderation_revision
    FROM public.list_seller_products_for_moderation(
      '40c2c000-0000-4000-8000-000000000001', 'archived', 10, NULL, NULL
    )
    WHERE id = (SELECT product_id FROM base_product)
  $$,
  $$ VALUES (true, (SELECT moderation_revision FROM restored_result)) $$,
  'the archived seller list exposes restoration state and its action revision'
);
SELECT throws_ok(
  format(
    'UPDATE public.products SET status = %L WHERE id = %L',
    'published',
    (SELECT product_id FROM base_product)
  ),
  '23514',
  'product_publication_not_allowed',
  'a direct archived-to-published write remains forbidden'
);
SELECT is(
  (SELECT result FROM public.restore_seller_product_for_moderation(
    (SELECT product_id FROM base_product),
    (SELECT moderation_revision FROM restored_result),
    '40c2c000-0000-4000-8000-000000000304',
    '40c2c000-0000-4000-8000-000000000999',
    '40000000-0000-4000-8000-000000000001'
  )),
  'product_not_found',
  'restore masks seller isolation as not found'
);
SELECT is(
  (SELECT result FROM public.archive_seller_product_with_moderation(
    (SELECT product_id FROM base_product),
    (SELECT approved_revision FROM base_product),
    '40c2c000-0000-4000-8000-000000000305',
    '40c2c000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  )),
  'product_moderation_revision_conflict',
  'archive rejects an action revision made stale by restoration'
);

CREATE TEMP TABLE pending_product AS
SELECT * FROM pg_temp.create_published_product(
  'Pending update shirt',
  '40c2c000-0000-4000-8000-000000000102',
  '40c2c000-0000-4000-8000-000000000202',
  'https://example.test/pending-update-initial.jpg'
);
SELECT count(*) FROM public.ensure_product_moderation_working_copy(
  (SELECT product_id FROM pending_product),
  '40c2c000-0000-4000-8000-000000000001'
);
SELECT count(*) FROM public.update_initial_product_draft_title(
  (SELECT product_id FROM pending_product),
  '40c2c000-0000-4000-8000-000000000001',
  (SELECT revision FROM public.product_moderation_working_copies
   WHERE product_id = (SELECT product_id FROM pending_product)),
  'Unapproved pending title',
  'human'
);
CREATE TEMP TABLE pending_submission AS
SELECT * FROM public.submit_product_moderation(
  (SELECT product_id FROM pending_product),
  '40c2c000-0000-4000-8000-000000000001',
  (SELECT revision FROM public.product_moderation_working_copies
   WHERE product_id = (SELECT product_id FROM pending_product)),
  '40c2c000-0000-4000-8000-000000000306',
  '40000000-0000-4000-8000-000000000001'
);
SELECT is(
  (SELECT result FROM public.archive_seller_product_with_moderation(
    (SELECT product_id FROM pending_product),
    (SELECT revision FROM pending_submission),
    '40c2c000-0000-4000-8000-000000000307',
    '40c2c000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  )),
  'archived',
  'archive withdraws a merely pending update and hides the product atomically'
);
SELECT is(
  (SELECT review_status FROM public.product_moderation_submissions
   WHERE id = (SELECT id FROM pending_submission)),
  'withdrawn',
  'the pending submission becomes durable withdrawn history'
);
SELECT is(
  (SELECT actor_user_id FROM public.product_moderation_events
   WHERE product_id = (SELECT product_id FROM pending_product)
     AND request_id = '40c2c000-0000-4000-8000-000000000307'),
  '40000000-0000-4000-8000-000000000001'::uuid,
  'archive attributes withdrawal to the authenticated seller actor'
);
SELECT is(
  (SELECT count(*)::integer FROM public.product_moderation_working_copies
   WHERE product_id = (SELECT product_id FROM pending_product)),
  0,
  'archive removes the submitted working copy and membership proposal'
);
SELECT is(
  (SELECT count(*)::integer FROM public.product_draft_images
   WHERE product_draft_id = (SELECT product_id FROM pending_product)),
  1,
  'archive retains private image rows for later approved restoration'
);
CREATE TEMP TABLE pending_restore AS
SELECT * FROM public.restore_seller_product_for_moderation(
  (SELECT product_id FROM pending_product),
  (SELECT approved_revision FROM pending_product),
  '40c2c000-0000-4000-8000-000000000308',
  '40c2c000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001'
);
SELECT ok(
  (SELECT moderation_revision FROM pending_restore) > (SELECT revision FROM pending_submission),
  'restoration advances beyond every historical submission revision'
);
SELECT is(
  (SELECT snapshot_json ->> 'title' FROM public.product_moderation_working_copies
   WHERE product_id = (SELECT product_id FROM pending_product)),
  'Pending update shirt',
  'restoration does not revive the withdrawn unapproved title'
);

CREATE TEMP TABLE active_product AS
SELECT * FROM pg_temp.create_published_product(
  'Active activation shirt',
  '40c2c000-0000-4000-8000-000000000103',
  '40c2c000-0000-4000-8000-000000000203',
  'https://example.test/active-initial.jpg'
);
SELECT count(*) FROM public.ensure_product_moderation_working_copy(
  (SELECT product_id FROM active_product),
  '40c2c000-0000-4000-8000-000000000001'
);
CREATE TEMP TABLE active_submission AS
SELECT * FROM public.submit_product_moderation(
  (SELECT product_id FROM active_product),
  '40c2c000-0000-4000-8000-000000000001',
  (SELECT revision FROM public.product_moderation_working_copies
   WHERE product_id = (SELECT product_id FROM active_product)),
  '40c2c000-0000-4000-8000-000000000309',
  '40000000-0000-4000-8000-000000000001'
);
CREATE TEMP TABLE active_approval AS
SELECT * FROM public.decide_product_moderation_submission(
  (SELECT id FROM active_submission),
  (SELECT revision FROM active_submission),
  'approve', NULL,
  '40c2c000-0000-4000-8000-000000000310',
  '40000000-0000-4000-8000-000000000099'
);
SELECT is(
  (SELECT result FROM public.archive_seller_product_with_moderation(
    (SELECT product_id FROM active_product),
    (SELECT revision FROM active_submission),
    '40c2c000-0000-4000-8000-000000000311',
    '40c2c000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  )),
  'product_archive_moderation_active',
  'archive rejects an unresolved activation run'
);
SELECT is(
  (SELECT status::text FROM public.products WHERE id = (SELECT product_id FROM active_product)),
  'published',
  'a rejected archive leaves the public status unchanged'
);

SELECT * INTO TEMP TABLE direct_draft
FROM public.save_initial_product_draft_with_description(
  NULL,
  '40c2c000-0000-4000-8000-000000000001',
  NULL,
  true,
  'Direct archived draft',
  false,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'USD',
  'in_stock',
  false,
  NULL,
  false,
  'draft',
  ARRAY['women']::text[]
);
SELECT is(
  (SELECT result FROM public.archive_seller_product_with_moderation(
    (SELECT product_draft_id FROM direct_draft),
    (SELECT moderation_revision FROM direct_draft),
    '40c2c000-0000-4000-8000-000000000312',
    '40c2c000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  )),
  'archived',
  'the protected archive operation retains direct-draft archival'
);
SELECT is(
  (SELECT result FROM public.restore_seller_product_for_moderation(
    (SELECT product_draft_id FROM direct_draft),
    (SELECT moderation_revision FROM direct_draft),
    '40c2c000-0000-4000-8000-000000000313',
    '40c2c000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  )),
  'product_restore_not_allowed',
  'a never-approved archived direct draft cannot enter restoration'
);

CREATE TEMP TABLE republish_submission AS
SELECT * FROM public.submit_product_moderation(
  (SELECT product_id FROM base_product),
  '40c2c000-0000-4000-8000-000000000001',
  (SELECT moderation_revision FROM restored_result),
  '40c2c000-0000-4000-8000-000000000314',
  '40000000-0000-4000-8000-000000000001'
);
CREATE TEMP TABLE republish_approval AS
SELECT * FROM public.decide_product_moderation_submission(
  (SELECT id FROM republish_submission),
  (SELECT revision FROM republish_submission),
  'approve', NULL,
  '40c2c000-0000-4000-8000-000000000315',
  '40000000-0000-4000-8000-000000000099'
);
SELECT count(*) FROM public.record_product_activation_dispatch_result(
  (SELECT activation_run_id FROM republish_approval), 1, 'dispatched'
);
CREATE TEMP TABLE republish_claim AS
SELECT public.claim_product_activation_run(
  (SELECT activation_run_id FROM republish_approval), 1, 360
) AS payload;
SELECT count(*) FROM public.record_product_activation_object_created(
  (SELECT activation_run_id FROM republish_approval),
  1,
  (SELECT (payload ->> 'attemptToken')::uuid FROM republish_claim),
  '40c2c000-0000-4000-8000-000000000101',
  repeat('b', 64),
  100,
  repeat('b', 64),
  '"republish-etag"',
  'https://example.test/archive-restore-republished.jpg'
);
SELECT count(*) FROM public.verify_product_activation_item(
  (SELECT activation_run_id FROM republish_approval),
  1,
  (SELECT (payload ->> 'attemptToken')::uuid FROM republish_claim),
  '40c2c000-0000-4000-8000-000000000101',
  100,
  repeat('b', 64),
  '"republish-etag"'
);
SELECT is(
  public.finalize_product_activation(
    (SELECT activation_run_id FROM republish_approval),
    1,
    (SELECT (payload ->> 'attemptToken')::uuid FROM republish_claim)
  ),
  'cleanup_pending',
  'approved restoration activation switches and records superseded cleanup'
);
SELECT is(
  (SELECT status::text FROM public.products WHERE id = (SELECT product_id FROM base_product)),
  'published',
  'protected activation is the only path that republishes an archived product'
);
SELECT is(
  (SELECT product_code FROM public.products WHERE id = (SELECT product_id FROM base_product)),
  (SELECT product_code FROM base_product),
  'archive, restore, and republish preserve the product code'
);

SELECT * FROM finish();
ROLLBACK;
