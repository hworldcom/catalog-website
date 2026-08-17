BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
\ir helpers/approved_seller.inc

SELECT plan(12);

SELECT ok(
  position(
    'run.product_draft_id' IN pg_get_functiondef(
      'public.prepare_seller_product_draft_image_uploads(uuid,uuid,bigint,jsonb,uuid[])'::regprocedure
    )
  ) = 0,
  'prepare uses the versioned activation run product identifier'
);
SELECT ok(
  position(
    'item.product_draft_id' IN pg_get_functiondef(
      'public.prepare_seller_product_draft_image_uploads(uuid,uuid,bigint,jsonb,uuid[])'::regprocedure
    )
  ) = 0,
  'prepare uses the versioned activation item product identifier'
);
SELECT ok(
  position(
    'run.product_draft_id' IN pg_get_functiondef(
      'public.finalize_seller_product_draft_image_uploads(uuid,uuid,jsonb)'::regprocedure
    )
  ) = 0,
  'finalize uses the versioned activation run product identifier'
);
SELECT ok(
  position(
    'item.product_draft_id' IN pg_get_functiondef(
      'public.finalize_seller_product_draft_image_uploads(uuid,uuid,jsonb)'::regprocedure
    )
  ) = 0,
  'finalize uses the versioned activation item product identifier'
);
SELECT ok(
  position(
    'run.product_draft_id' IN pg_get_functiondef(
      'public.update_seller_product_draft_image_gallery(uuid,uuid,bigint,uuid[],uuid)'::regprocedure
    )
  ) = 0,
  'gallery update uses the versioned activation run product identifier'
);
SELECT ok(
  position(
    'item.product_draft_id' IN pg_get_functiondef(
      'public.update_seller_product_draft_image_gallery(uuid,uuid,bigint,uuid[],uuid)'::regprocedure
    )
  ) = 0,
  'gallery update uses the versioned activation item product identifier'
);
SELECT ok(
  position(
    'run.product_draft_id' IN pg_get_functiondef(
      'public.begin_seller_product_draft_image_removal(uuid,uuid,uuid,bigint)'::regprocedure
    )
  ) = 0,
  'removal uses the versioned activation run product identifier'
);
SELECT ok(
  position(
    'item.product_draft_id' IN pg_get_functiondef(
      'public.begin_seller_product_draft_image_removal(uuid,uuid,uuid,bigint)'::regprocedure
    )
  ) = 0,
  'removal uses the versioned activation item product identifier'
);

INSERT INTO public.sellers (id, slug, name, published, company_code)
VALUES (
  '40d3d000-0000-4000-8000-000000000001',
  'qa-0040d3d-seller',
  'QA 0040d3d Seller',
  true,
  'Q4D'
);

SELECT pg_temp.approve_fixture_seller(
  '40d3d000-0000-4000-8000-000000000001'
);

INSERT INTO public.products (
  id,
  seller_id,
  title,
  title_source,
  status
)
VALUES (
  '40d3d000-0000-4000-8000-000000000010',
  '40d3d000-0000-4000-8000-000000000001',
  'QA activation-compatible image gallery',
  'human',
  'draft'
);

CREATE TEMP TABLE prepared AS
SELECT public.prepare_initial_product_draft_image_uploads(
  '40d3d000-0000-4000-8000-000000000010',
  '40d3d000-0000-4000-8000-000000000001',
  1,
  0,
  jsonb_build_array(
    jsonb_build_object(
      'client_upload_id', '40d3d000-0000-4000-8000-000000000101',
      'original_filename', 'front.jpg',
      'content_type', 'image/jpeg',
      'size_bytes', 101
    )
  )
) AS payload;

SELECT is(
  (SELECT payload->>'result' FROM prepared),
  'prepared',
  'the current initial-product wrapper prepares an image upload'
);

CREATE TEMP TABLE selected_image AS
SELECT id
FROM public.product_draft_images
WHERE product_draft_id = '40d3d000-0000-4000-8000-000000000010'
  AND client_upload_id = '40d3d000-0000-4000-8000-000000000101';

CREATE TEMP TABLE finalized AS
SELECT public.finalize_initial_product_draft_image_uploads(
  '40d3d000-0000-4000-8000-000000000010',
  '40d3d000-0000-4000-8000-000000000001',
  1,
  jsonb_build_array(
    jsonb_build_object(
      'image_id', (SELECT id FROM selected_image),
      'outcome', 'available',
      'content_type', 'image/jpeg',
      'size_bytes', 101
    )
  )
) AS payload;

SELECT is(
  (SELECT payload->>'result' FROM finalized),
  'finalized',
  'the current initial-product wrapper finalizes an image upload'
);

SELECT ok(
  (
    public.update_initial_product_draft_image_gallery(
      '40d3d000-0000-4000-8000-000000000010',
      '40d3d000-0000-4000-8000-000000000001',
      1,
      (SELECT image_gallery_revision FROM public.products
       WHERE id = '40d3d000-0000-4000-8000-000000000010'),
      ARRAY[(SELECT id FROM selected_image)],
      (SELECT id FROM selected_image)
    )->>'result'
  ) IN ('updated', 'unchanged'),
  'the current initial-product wrapper can update the prepared gallery'
);

SELECT is(
  (
    public.begin_initial_product_draft_image_removal(
      '40d3d000-0000-4000-8000-000000000010',
      '40d3d000-0000-4000-8000-000000000001',
      1,
      (SELECT id FROM selected_image),
      (SELECT image_gallery_revision FROM public.products
       WHERE id = '40d3d000-0000-4000-8000-000000000010')
    )->>'result'
  ),
  'cleanup_required',
  'the current initial-product wrapper can begin private image removal'
);

SELECT * FROM finish();
ROLLBACK;
