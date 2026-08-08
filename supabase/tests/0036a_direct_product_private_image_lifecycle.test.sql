BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(34);

SELECT enum_has_labels(
  'public',
  'product_draft_image_status',
  ARRAY['pending', 'available', 'failed', 'deleting'],
  'ProductDraft image status includes the durable deletion state'
);

SELECT columns_are(
  'public',
  'product_draft_images',
  ARRAY[
    'id',
    'product_draft_id',
    'classifier_image_id',
    'source_position',
    'status',
    'destination_key',
    'content_type',
    'size_bytes',
    'created_at',
    'updated_at',
    'storage_bucket',
    'source_kind',
    'client_upload_id',
    'original_filename',
    'lifecycle_error_code'
  ],
  'ProductDraft images expose the generalized source and lifecycle columns'
);

SELECT has_column(
  'public',
  'products',
  'image_gallery_revision',
  'products have a gallery revision fence'
);

SELECT results_eq(
  $$
    SELECT file_size_limit, allowed_mime_types
    FROM storage.buckets
    WHERE id = 'product-draft-images'
  $$,
  $$
    VALUES (
      20971520::bigint,
      ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    )
  $$,
  'the private draft bucket accepts the supported image contract'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.prepare_seller_product_draft_image_uploads(uuid,uuid,bigint,jsonb,uuid[])',
    'EXECUTE'
  ),
  'the service role can prepare private image rows'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.prepare_seller_product_draft_image_uploads(uuid,uuid,bigint,jsonb,uuid[])',
    'EXECUTE'
  ),
  'browser database roles cannot prepare private image rows directly'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
        'Users can upload their own images',
        'Users can update their own images',
        'Users can delete their own images'
      )
  ),
  0,
  'authenticated users cannot bypass private drafts with public bucket writes'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.fail_seller_product_draft_image_upload_cleanup(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'the service role can persist an upload cleanup failure'
);

INSERT INTO public.sellers (id, slug, name, published, company_code)
VALUES (
  '36a00000-0000-0000-0000-000000000001',
  'qa-0036a-seller',
  'QA 0036a Seller',
  true,
  'Q36'
);

INSERT INTO public.products (
  id,
  seller_id,
  title,
  title_source,
  status
)
VALUES (
  '36a00000-0000-0000-0000-000000000010',
  '36a00000-0000-0000-0000-000000000001',
  'QA private gallery',
  'human',
  'draft'
);

CREATE TEMP TABLE prepared AS
SELECT public.prepare_seller_product_draft_image_uploads(
  '36a00000-0000-0000-0000-000000000010',
  '36a00000-0000-0000-0000-000000000001',
  0,
  jsonb_build_array(
    jsonb_build_object(
      'client_upload_id', '36a00000-0000-0000-0000-000000000101',
      'original_filename', 'front.jpg',
      'content_type', 'image/jpeg',
      'size_bytes', 101
    ),
    jsonb_build_object(
      'client_upload_id', '36a00000-0000-0000-0000-000000000102',
      'original_filename', 'detail.png',
      'content_type', 'image/png',
      'size_bytes', 102
    ),
    jsonb_build_object(
      'client_upload_id', '36a00000-0000-0000-0000-000000000103',
      'original_filename', 'back.webp',
      'content_type', 'image/webp',
      'size_bytes', 103
    )
  )
) AS payload;

SELECT is(
  (SELECT payload->>'result' FROM prepared),
  'prepared',
  'prepare creates a direct private gallery'
);

SELECT is(
  (SELECT (payload->>'galleryRevision')::bigint FROM prepared),
  1::bigint,
  'prepare increments the gallery revision once'
);

SELECT results_eq(
  $$
    SELECT source_kind, status::text, source_position, content_type
    FROM public.product_draft_images
    WHERE product_draft_id = '36a00000-0000-0000-0000-000000000010'
    ORDER BY source_position
  $$,
  $$
    VALUES
      ('seller_upload'::text, 'pending'::text, 0, 'image/jpeg'::text),
      ('seller_upload'::text, 'pending'::text, 1, 'image/png'::text),
      ('seller_upload'::text, 'pending'::text, 2, 'image/webp'::text)
  $$,
  'prepare preserves request order and verified metadata expectations'
);

CREATE TEMP TABLE replay AS
SELECT public.prepare_seller_product_draft_image_uploads(
  '36a00000-0000-0000-0000-000000000010',
  '36a00000-0000-0000-0000-000000000001',
  0,
  jsonb_build_array(
    jsonb_build_object(
      'client_upload_id', '36a00000-0000-0000-0000-000000000101',
      'original_filename', 'front.jpg',
      'content_type', 'image/jpeg',
      'size_bytes', 101
    ),
    jsonb_build_object(
      'client_upload_id', '36a00000-0000-0000-0000-000000000102',
      'original_filename', 'detail.png',
      'content_type', 'image/png',
      'size_bytes', 102
    ),
    jsonb_build_object(
      'client_upload_id', '36a00000-0000-0000-0000-000000000103',
      'original_filename', 'back.webp',
      'content_type', 'image/webp',
      'size_bytes', 103
    )
  )
) AS payload;

SELECT is(
  (SELECT (payload->>'galleryRevision')::bigint FROM replay),
  1::bigint,
  'an exact replay accepts the pre-response revision without another mutation'
);

SELECT is(
  (
    public.prepare_seller_product_draft_image_uploads(
      '36a00000-0000-0000-0000-000000000010',
      '36a00000-0000-0000-0000-000000000001',
      0,
      jsonb_build_array(
        jsonb_build_object(
          'client_upload_id', '36a00000-0000-0000-0000-000000000101',
          'original_filename', 'front.jpg',
          'content_type', 'image/jpeg',
          'size_bytes', 101
        ),
        jsonb_build_object(
          'client_upload_id', '36a00000-0000-0000-0000-000000000104',
          'original_filename', 'new.jpg',
          'content_type', 'image/jpeg',
          'size_bytes', 104
        )
      )
    )->>'result'
  ),
  'stale',
  'a mixed replay and new request remains revision fenced'
);

SELECT is(
  (
    public.prepare_seller_product_draft_image_uploads(
      '36a00000-0000-0000-0000-000000000010',
      '36a00000-0000-0000-0000-000000000001',
      1,
      jsonb_build_array(
        jsonb_build_object(
          'client_upload_id', '36a00000-0000-0000-0000-000000000101',
          'original_filename', 'different.jpg',
          'content_type', 'image/jpeg',
          'size_bytes', 101
        )
      )
    )->>'result'
  ),
  'upload_conflict',
  'a client identifier cannot be reused with different metadata'
);

SELECT is(
  (
    public.prepare_seller_product_draft_image_uploads(
      '36a00000-0000-0000-0000-000000000010',
      '36a00000-0000-0000-0000-000000000099',
      1,
      jsonb_build_array(
        jsonb_build_object(
          'client_upload_id', '36a00000-0000-0000-0000-000000000104',
          'original_filename', 'hidden.jpg',
          'content_type', 'image/jpeg',
          'size_bytes', 104
        )
      )
    )->>'result'
  ),
  'not_found',
  'cross-seller prepare uses non-disclosing not-found behavior'
);

CREATE TEMP TABLE image_ids AS
SELECT
  (array_agg(id) FILTER (
    WHERE client_upload_id = '36a00000-0000-0000-0000-000000000101'
  ))[1] AS jpeg_id,
  (array_agg(id) FILTER (
    WHERE client_upload_id = '36a00000-0000-0000-0000-000000000102'
  ))[1] AS png_id,
  (array_agg(id) FILTER (
    WHERE client_upload_id = '36a00000-0000-0000-0000-000000000103'
  ))[1] AS failed_webp_id
FROM public.product_draft_images
WHERE product_draft_id = '36a00000-0000-0000-0000-000000000010';

CREATE TEMP TABLE finalized AS
SELECT public.finalize_seller_product_draft_image_uploads(
  '36a00000-0000-0000-0000-000000000010',
  '36a00000-0000-0000-0000-000000000001',
  jsonb_build_array(
    jsonb_build_object(
      'image_id', (SELECT jpeg_id FROM image_ids),
      'outcome', 'available',
      'content_type', 'image/jpeg',
      'size_bytes', 101
    ),
    jsonb_build_object(
      'image_id', (SELECT png_id FROM image_ids),
      'outcome', 'available',
      'content_type', 'image/png',
      'size_bytes', 102
    ),
    jsonb_build_object(
      'image_id', (SELECT failed_webp_id FROM image_ids),
      'outcome', 'failed',
      'error_code', 'product_draft_image_verification_failed'
    )
  )
) AS payload;

SELECT is(
  (SELECT (payload->>'galleryRevision')::bigint FROM finalized),
  2::bigint,
  'partial finalization increments the revision once'
);

SELECT results_eq(
  $$
    SELECT status::text, count(*)::integer
    FROM public.product_draft_images
    WHERE product_draft_id = '36a00000-0000-0000-0000-000000000010'
    GROUP BY status
    ORDER BY status::text
  $$,
  $$
    VALUES ('available'::text, 2), ('failed'::text, 1)
  $$,
  'partial finalization preserves healthy sibling images'
);

SELECT is(
  (
    SELECT cover_image_id
    FROM public.products
    WHERE id = '36a00000-0000-0000-0000-000000000010'
  ),
  (SELECT jpeg_id FROM image_ids),
  'the earliest available image becomes the initial cover'
);

SELECT is(
  (
    public.update_seller_product_draft_image_gallery(
      '36a00000-0000-0000-0000-000000000010',
      '36a00000-0000-0000-0000-000000000001',
      2,
      ARRAY[(SELECT jpeg_id FROM image_ids), (SELECT png_id FROM image_ids)],
      (SELECT jpeg_id FROM image_ids)
    )->>'result'
  ),
  'gallery_incomplete',
  'failed image rows block cover and order mutation'
);

CREATE TEMP TABLE removal AS
SELECT public.begin_seller_product_draft_image_removal(
  '36a00000-0000-0000-0000-000000000010',
  '36a00000-0000-0000-0000-000000000001',
  (SELECT failed_webp_id FROM image_ids),
  2
) AS payload;

SELECT is(
  (SELECT payload->>'result' FROM removal),
  'cleanup_required',
  'removal first enters durable cleanup state'
);

SELECT results_eq(
  $$
    SELECT status::text, lifecycle_error_code
    FROM public.product_draft_images
    WHERE id = (SELECT failed_webp_id FROM image_ids)
  $$,
  $$
    VALUES ('deleting'::text, NULL::text)
  $$,
  'a removing image is visible as deleting until storage cleanup completes'
);

SELECT is(
  (
    public.product_draft_image_gallery_snapshot(
      '36a00000-0000-0000-0000-000000000010'
    )#>>'{images,2,recoveryAction}'
  ),
  'retry_cleanup',
  'the durable read model derives deletion recovery'
);

SELECT is(
  (
    public.complete_seller_product_draft_image_removal(
      '36a00000-0000-0000-0000-000000000010',
      '36a00000-0000-0000-0000-000000000001',
      (SELECT failed_webp_id FROM image_ids)
    )->>'result'
  ),
  'removed',
  'successful storage cleanup permits durable row removal'
);

SELECT is(
  (
    SELECT image_gallery_revision
    FROM public.products
    WHERE id = '36a00000-0000-0000-0000-000000000010'
  ),
  3::bigint,
  'beginning removal increments the revision once'
);

CREATE TEMP TABLE replacement_prepare AS
SELECT public.prepare_seller_product_draft_image_uploads(
  '36a00000-0000-0000-0000-000000000010',
  '36a00000-0000-0000-0000-000000000001',
  3,
  jsonb_build_array(
    jsonb_build_object(
      'client_upload_id', '36a00000-0000-0000-0000-000000000105',
      'original_filename', 'replacement.webp',
      'content_type', 'image/webp',
      'size_bytes', 105
    )
  )
) AS payload;

CREATE TEMP TABLE replacement_id AS
SELECT id AS webp_id
FROM public.product_draft_images
WHERE product_draft_id = '36a00000-0000-0000-0000-000000000010'
  AND client_upload_id = '36a00000-0000-0000-0000-000000000105';

SELECT is(
  (SELECT (payload->>'galleryRevision')::bigint FROM replacement_prepare),
  4::bigint,
  'a replacement upload reserves one new position and revision'
);

SELECT is(
  (
    public.finalize_seller_product_draft_image_uploads(
      '36a00000-0000-0000-0000-000000000010',
      '36a00000-0000-0000-0000-000000000001',
      jsonb_build_array(
        jsonb_build_object(
          'image_id', (SELECT webp_id FROM replacement_id),
          'outcome', 'available',
          'content_type', 'image/webp',
          'size_bytes', 105
        )
      )
    )->>'result'
  ),
  'finalized',
  'WebP finalization is accepted'
);

CREATE TEMP TABLE reordered AS
SELECT public.update_seller_product_draft_image_gallery(
  '36a00000-0000-0000-0000-000000000010',
  '36a00000-0000-0000-0000-000000000001',
  5,
  ARRAY[
    (SELECT webp_id FROM replacement_id),
    (SELECT png_id FROM image_ids),
    (SELECT jpeg_id FROM image_ids)
  ],
  (SELECT webp_id FROM replacement_id)
) AS payload;

SELECT is(
  (SELECT (payload->>'galleryRevision')::bigint FROM reordered),
  6::bigint,
  'an atomic reorder and cover change increments the revision once'
);

SELECT results_eq(
  $$
    SELECT client_upload_id, source_position
    FROM public.product_draft_images
    WHERE product_draft_id = '36a00000-0000-0000-0000-000000000010'
    ORDER BY source_position
  $$,
  $$
    VALUES
      ('36a00000-0000-0000-0000-000000000105'::uuid, 0),
      ('36a00000-0000-0000-0000-000000000102'::uuid, 1),
      ('36a00000-0000-0000-0000-000000000101'::uuid, 2)
  $$,
  'gallery order is compact and deterministic'
);

SELECT is(
  (
    public.update_seller_product_draft_image_gallery(
      '36a00000-0000-0000-0000-000000000010',
      '36a00000-0000-0000-0000-000000000001',
      6,
      ARRAY[
        (SELECT webp_id FROM replacement_id),
        (SELECT png_id FROM image_ids),
        (SELECT jpeg_id FROM image_ids)
      ],
      (SELECT webp_id FROM replacement_id)
    )->>'result'
  ),
  'unchanged',
  'an exact gallery replay is a no-op'
);

CREATE TEMP TABLE publication_authorization AS
SELECT *
FROM public.authorize_seller_product_publication(
  '36a00000-0000-0000-0000-000000000010',
  '36a00000-0000-0000-0000-000000000001',
  false,
  NULL,
  false,
  NULL,
  (SELECT id FROM public.categories WHERE slug = 't-shirts'),
  1,
  '1',
  10,
  'EUR',
  'in_stock',
  false,
  NULL,
  false
);

SELECT is(
  (SELECT result FROM publication_authorization),
  'pending',
  'a complete direct private gallery enters durable publication'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.product_image_publication_items
    WHERE product_draft_id = '36a00000-0000-0000-0000-000000000010'
  ),
  3,
  'publication freezes every available direct image'
);

SELECT results_eq(
  $$
    SELECT
      expected_content_type,
      substring(destination_key from '\.[^.]+$'),
      publication_order
    FROM public.product_image_publication_items
    WHERE product_draft_id = '36a00000-0000-0000-0000-000000000010'
    ORDER BY publication_order
  $$,
  $$
    VALUES
      ('image/webp'::text, '.webp'::text, 0),
      ('image/png'::text, '.png'::text, 1),
      ('image/jpeg'::text, '.jpg'::text, 2)
  $$,
  'the frozen manifest preserves MIME type, extension, and order'
);

SELECT is(
  (
    public.update_seller_product_draft_image_gallery(
      '36a00000-0000-0000-0000-000000000010',
      '36a00000-0000-0000-0000-000000000001',
      6,
      ARRAY[
        (SELECT webp_id FROM replacement_id),
        (SELECT png_id FROM image_ids),
        (SELECT jpeg_id FROM image_ids)
      ],
      (SELECT webp_id FROM replacement_id)
    )->>'result'
  ),
  'gallery_locked',
  'publication authorization freezes later gallery mutation'
);

SELECT throws_ok(
  $$
    UPDATE public.products
    SET cover_image_url = 'https://public.example/manual.jpg'
    WHERE id = '36a00000-0000-0000-0000-000000000010'
  $$,
  '23514',
  'product_draft_manual_cover_not_allowed',
  'new direct drafts cannot bypass private publication with a public cover URL'
);

SELECT * FROM finish();
ROLLBACK;
