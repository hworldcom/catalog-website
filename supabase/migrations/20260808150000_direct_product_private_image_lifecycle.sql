BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.product_draft_images AS image
    WHERE image.classifier_image_id IS NULL
  ) THEN
    RAISE EXCEPTION '0036a migration requires every existing ProductDraft image to have classifier identity';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_draft_images AS image
    GROUP BY image.product_draft_id, image.source_position
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION '0036a migration found duplicate ProductDraft image positions';
  END IF;
END;
$$;

UPDATE storage.buckets
SET
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE id = 'product-draft-images';

DROP POLICY IF EXISTS "Users can upload their own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own images" ON storage.objects;

ALTER TABLE public.product_draft_images
  DROP CONSTRAINT product_draft_images_source_unique,
  DROP CONSTRAINT product_draft_images_available_fields,
  ALTER COLUMN classifier_image_id DROP NOT NULL,
  ADD COLUMN source_kind text NOT NULL DEFAULT 'classifier_import',
  ADD COLUMN client_upload_id uuid,
  ADD COLUMN original_filename text,
  ADD COLUMN lifecycle_error_code text;

UPDATE public.product_draft_images
SET lifecycle_error_code = 'classifier_image_promotion_failed'
WHERE status = 'failed';

ALTER TABLE public.product_draft_images
  ADD CONSTRAINT product_draft_images_source_kind
    CHECK (source_kind IN ('classifier_import', 'seller_upload')),
  ADD CONSTRAINT product_draft_images_source_identity
    CHECK (
      (
        source_kind = 'classifier_import'
        AND classifier_image_id IS NOT NULL
        AND client_upload_id IS NULL
      )
      OR (
        source_kind = 'seller_upload'
        AND classifier_image_id IS NULL
        AND client_upload_id IS NOT NULL
      )
    ),
  ADD CONSTRAINT product_draft_images_original_filename
    CHECK (
      original_filename IS NULL
      OR (
        length(btrim(original_filename)) > 0
        AND char_length(original_filename) <= 255
      )
    ),
  ADD CONSTRAINT product_draft_images_seller_upload_metadata
    CHECK (
      source_kind <> 'seller_upload'
      OR (
        original_filename IS NOT NULL
        AND content_type IN ('image/jpeg', 'image/png', 'image/webp')
        AND size_bytes BETWEEN 1 AND 20971520
      )
    ),
  ADD CONSTRAINT product_draft_images_lifecycle_state
    CHECK (
      (
        status IN ('pending', 'available')
        AND lifecycle_error_code IS NULL
      )
      OR (
        status = 'failed'
        AND length(btrim(lifecycle_error_code)) > 0
      )
      OR (
        status = 'deleting'
        AND (
          lifecycle_error_code IS NULL
          OR lifecycle_error_code = 'product_draft_image_delete_failed'
        )
      )
    ),
  ADD CONSTRAINT product_draft_images_available_fields
    CHECK (
      status <> 'available'
      OR (
        storage_bucket = 'product-draft-images'
        AND content_type IN ('image/jpeg', 'image/png', 'image/webp')
        AND size_bytes IS NOT NULL
      )
    );

CREATE UNIQUE INDEX product_draft_images_classifier_source_unique
  ON public.product_draft_images (product_draft_id, classifier_image_id)
  WHERE source_kind = 'classifier_import';

-- Keep the historical constraint name because already-deployed classifier
-- import functions target it explicitly. PostgreSQL permits multiple NULL
-- classifier identifiers, so seller-upload rows remain unaffected.
ALTER TABLE public.product_draft_images
  ADD CONSTRAINT product_draft_images_source_unique
    UNIQUE (product_draft_id, classifier_image_id);

CREATE UNIQUE INDEX product_draft_images_seller_client_upload_unique
  ON public.product_draft_images (product_draft_id, client_upload_id)
  WHERE source_kind = 'seller_upload';

CREATE UNIQUE INDEX product_draft_images_product_position_unique
  ON public.product_draft_images (product_draft_id, source_position);

ALTER TABLE public.products
  ADD COLUMN image_gallery_revision bigint NOT NULL DEFAULT 0,
  ADD CONSTRAINT products_image_gallery_revision_nonnegative
    CHECK (image_gallery_revision >= 0);

CREATE TABLE public.direct_product_legacy_cover_allowances (
  product_draft_id uuid PRIMARY KEY
    REFERENCES public.products(id) ON DELETE CASCADE,
  recorded_cover_image_url text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT direct_product_legacy_cover_allowances_url_nonblank
    CHECK (length(btrim(recorded_cover_image_url)) > 0)
);

INSERT INTO public.direct_product_legacy_cover_allowances (
  product_draft_id,
  recorded_cover_image_url
)
SELECT product.id, product.cover_image_url
FROM public.products AS product
WHERE product.cover_image_url IS NOT NULL
  AND length(btrim(product.cover_image_url)) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.product_draft_source_memberships AS membership
    WHERE membership.product_draft_id = product.id
  );

GRANT ALL ON public.direct_product_legacy_cover_allowances TO service_role;
ALTER TABLE public.direct_product_legacy_cover_allowances ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.enforce_product_draft_image_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.product_draft_id IS DISTINCT FROM OLD.product_draft_id
    OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
    OR NEW.classifier_image_id IS DISTINCT FROM OLD.classifier_image_id
    OR NEW.client_upload_id IS DISTINCT FROM OLD.client_upload_id
    OR NEW.destination_key IS DISTINCT FROM OLD.destination_key
    OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
    OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'product_draft_image_invalid' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'available'
    AND (
      NEW.content_type IS DISTINCT FROM OLD.content_type
      OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
    )
  THEN
    RAISE EXCEPTION 'product_draft_image_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_product_draft_images_00_immutable
  BEFORE UPDATE ON public.product_draft_images
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_draft_image_immutable_fields();

CREATE FUNCTION public.product_draft_image_gallery_snapshot(
  p_product_draft_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'productDraftId', product.id,
    'galleryRevision', product.image_gallery_revision,
    'coverImageId', product.cover_image_id,
    'activeImageCount', (
      SELECT count(*)
      FROM public.product_draft_images AS counted
      WHERE counted.product_draft_id = product.id
        AND counted.status <> 'deleting'
    ),
    'images', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'imageId', image.id,
          'sourceKind', image.source_kind,
          'clientUploadId', image.client_upload_id,
          'originalFilename', image.original_filename,
          'sourcePosition', image.source_position,
          'durableStatus', image.status,
          'lifecycleErrorCode', image.lifecycle_error_code,
          'isCover', image.id = product.cover_image_id,
          'canRemove', image.source_kind = 'seller_upload' AND image.status <> 'deleting',
          'recoveryAction', CASE
            WHEN image.source_kind <> 'seller_upload' THEN NULL
            WHEN image.status = 'pending' THEN 'retry_finalize'
            WHEN image.status = 'failed'
              AND image.lifecycle_error_code = 'product_draft_image_upload_cleanup_failed'
              THEN 'retry_cleanup'
            WHEN image.status = 'failed' THEN 'retry_upload'
            WHEN image.status = 'deleting' THEN 'retry_cleanup'
            ELSE NULL
          END
        )
        ORDER BY image.source_position, image.id
      )
      FROM public.product_draft_images AS image
      WHERE image.product_draft_id = product.id
    ), '[]'::jsonb)
  )
  FROM public.products AS product
  WHERE product.id = p_product_draft_id;
$$;

CREATE FUNCTION public.prepare_seller_product_draft_image_uploads(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_expected_gallery_revision bigint,
  p_files jsonb,
  p_verified_absent_image_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  file_entry record;
  existing_image public.product_draft_images%ROWTYPE;
  file_count integer;
  active_count integer;
  new_count integer := 0;
  mutating boolean := false;
  next_position integer;
  new_image_id uuid;
  extension text;
  result_images jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_files) <> 'array'
    OR jsonb_array_length(p_files) < 1
    OR jsonb_array_length(p_files) > 20
  THEN
    RAISE EXCEPTION 'product_draft_image_upload_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND product.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;
  IF selected_product.status <> 'draft' THEN
    RETURN jsonb_build_object('result', 'not_editable');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.product_draft_source_memberships AS membership
    WHERE membership.product_draft_id = selected_product.id
  ) THEN
    RETURN jsonb_build_object('result', 'not_allowed');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.product_image_publication_runs AS run
    WHERE run.product_draft_id = selected_product.id
      AND run.status <> 'completed'
  ) OR EXISTS (
    SELECT 1
    FROM public.product_image_publication_items AS item
    WHERE item.product_draft_id = selected_product.id
  ) THEN
    RETURN jsonb_build_object('result', 'gallery_locked');
  END IF;

  SELECT count(*)::integer,
         count(DISTINCT (entry.value->>'client_upload_id'))::integer
  INTO file_count, active_count
  FROM jsonb_array_elements(p_files) AS entry(value);
  IF file_count <> active_count THEN
    RAISE EXCEPTION 'product_draft_image_upload_invalid' USING ERRCODE = '22023';
  END IF;

  FOR file_entry IN
    SELECT
      entry.ordinality,
      (entry.value->>'client_upload_id')::uuid AS client_upload_id,
      entry.value->>'original_filename' AS original_filename,
      lower(entry.value->>'content_type') AS content_type,
      (entry.value->>'size_bytes')::bigint AS size_bytes
    FROM jsonb_array_elements(p_files) WITH ORDINALITY AS entry(value, ordinality)
    ORDER BY entry.ordinality
  LOOP
    IF file_entry.original_filename IS NULL
      OR length(btrim(file_entry.original_filename)) = 0
      OR char_length(file_entry.original_filename) > 255
      OR file_entry.content_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
      OR file_entry.size_bytes NOT BETWEEN 1 AND 20971520
    THEN
      RAISE EXCEPTION 'product_draft_image_upload_invalid' USING ERRCODE = '22023';
    END IF;

    SELECT image.*
    INTO existing_image
    FROM public.product_draft_images AS image
    WHERE image.product_draft_id = selected_product.id
      AND image.source_kind = 'seller_upload'
      AND image.client_upload_id = file_entry.client_upload_id;

    IF FOUND THEN
      IF existing_image.original_filename IS DISTINCT FROM file_entry.original_filename
        OR existing_image.content_type IS DISTINCT FROM file_entry.content_type
        OR existing_image.size_bytes IS DISTINCT FROM file_entry.size_bytes
      THEN
        RETURN jsonb_build_object('result', 'upload_conflict');
      END IF;
      IF existing_image.status = 'deleting' THEN
        RETURN jsonb_build_object('result', 'gallery_locked');
      END IF;
      IF existing_image.status = 'failed' THEN
        IF NOT existing_image.id = ANY(coalesce(p_verified_absent_image_ids, ARRAY[]::uuid[])) THEN
          RETURN jsonb_build_object(
            'result',
            CASE
              WHEN existing_image.lifecycle_error_code =
                'product_draft_image_upload_cleanup_failed'
                THEN 'cleanup_required'
              ELSE 'verification_required'
            END,
            'imageId', existing_image.id
          );
        END IF;
        mutating := true;
      END IF;
    ELSE
      mutating := true;
      new_count := new_count + 1;
    END IF;
  END LOOP;

  IF mutating
    AND selected_product.image_gallery_revision IS DISTINCT FROM p_expected_gallery_revision
  THEN
    RETURN jsonb_build_object(
      'result', 'stale',
      'galleryRevision', selected_product.image_gallery_revision
    );
  END IF;

  SELECT count(*)::integer
  INTO active_count
  FROM public.product_draft_images AS image
  WHERE image.product_draft_id = selected_product.id
    AND image.status <> 'deleting';
  IF active_count + new_count > 20 THEN
    RETURN jsonb_build_object('result', 'limit_exceeded');
  END IF;

  SELECT coalesce(max(image.source_position), -1) + 1
  INTO next_position
  FROM public.product_draft_images AS image
  WHERE image.product_draft_id = selected_product.id;

  FOR file_entry IN
    SELECT
      entry.ordinality,
      (entry.value->>'client_upload_id')::uuid AS client_upload_id,
      entry.value->>'original_filename' AS original_filename,
      lower(entry.value->>'content_type') AS content_type,
      (entry.value->>'size_bytes')::bigint AS size_bytes
    FROM jsonb_array_elements(p_files) WITH ORDINALITY AS entry(value, ordinality)
    ORDER BY entry.ordinality
  LOOP
    SELECT image.*
    INTO existing_image
    FROM public.product_draft_images AS image
    WHERE image.product_draft_id = selected_product.id
      AND image.source_kind = 'seller_upload'
      AND image.client_upload_id = file_entry.client_upload_id;

    IF FOUND THEN
      IF existing_image.status = 'failed' THEN
        UPDATE public.product_draft_images AS image
        SET status = 'pending', lifecycle_error_code = NULL
        WHERE image.id = existing_image.id;
        existing_image.status := 'pending';
        existing_image.lifecycle_error_code := NULL;
      END IF;
    ELSE
      new_image_id := gen_random_uuid();
      extension := CASE file_entry.content_type
        WHEN 'image/jpeg' THEN 'jpg'
        WHEN 'image/png' THEN 'png'
        WHEN 'image/webp' THEN 'webp'
      END;
      INSERT INTO public.product_draft_images (
        id,
        product_draft_id,
        classifier_image_id,
        source_position,
        status,
        destination_key,
        content_type,
        size_bytes,
        storage_bucket,
        source_kind,
        client_upload_id,
        original_filename,
        lifecycle_error_code
      ) VALUES (
        new_image_id,
        selected_product.id,
        NULL,
        next_position,
        'pending',
        'product-drafts/' || p_seller_id::text || '/' || selected_product.id::text || '/'
          || new_image_id::text || '.' || extension,
        file_entry.content_type,
        file_entry.size_bytes,
        'product-draft-images',
        'seller_upload',
        file_entry.client_upload_id,
        file_entry.original_filename,
        NULL
      )
      RETURNING * INTO existing_image;
      next_position := next_position + 1;
    END IF;

    result_images := result_images || jsonb_build_array(jsonb_build_object(
      'imageId', existing_image.id,
      'clientUploadId', existing_image.client_upload_id,
      'originalFilename', existing_image.original_filename,
      'contentType', existing_image.content_type,
      'sizeBytes', existing_image.size_bytes,
      'destinationKey', existing_image.destination_key,
      'durableStatus', existing_image.status
    ));
  END LOOP;

  IF mutating THEN
    UPDATE public.products AS product
    SET image_gallery_revision = image_gallery_revision + 1
    WHERE product.id = selected_product.id
    RETURNING product.image_gallery_revision INTO selected_product.image_gallery_revision;
  END IF;

  RETURN jsonb_build_object(
    'result', 'prepared',
    'galleryRevision', selected_product.image_gallery_revision,
    'images', result_images
  );
END;
$$;

CREATE FUNCTION public.finalize_seller_product_draft_image_uploads(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_results jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  result_entry record;
  selected_image public.product_draft_images%ROWTYPE;
  changed boolean := false;
  new_cover_id uuid;
BEGIN
  IF jsonb_typeof(p_results) <> 'array'
    OR jsonb_array_length(p_results) < 1
    OR jsonb_array_length(p_results) > 20
  THEN
    RAISE EXCEPTION 'product_draft_image_upload_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND product.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'not_found'); END IF;
  IF selected_product.status <> 'draft' THEN
    RETURN jsonb_build_object('result', 'not_editable');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_draft_source_memberships AS membership
    WHERE membership.product_draft_id = selected_product.id
  ) THEN
    RETURN jsonb_build_object('result', 'not_allowed');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_image_publication_runs AS run
    WHERE run.product_draft_id = selected_product.id AND run.status <> 'completed'
  ) OR EXISTS (
    SELECT 1 FROM public.product_image_publication_items AS item
    WHERE item.product_draft_id = selected_product.id
  ) THEN
    RETURN jsonb_build_object('result', 'gallery_locked');
  END IF;

  IF (
    SELECT count(*) FROM jsonb_array_elements(p_results)
  ) <> (
    SELECT count(DISTINCT entry.value->>'image_id')
    FROM jsonb_array_elements(p_results) AS entry(value)
  ) THEN
    RAISE EXCEPTION 'product_draft_image_upload_invalid' USING ERRCODE = '22023';
  END IF;

  FOR result_entry IN
    SELECT
      (entry.value->>'image_id')::uuid AS image_id,
      entry.value->>'outcome' AS outcome,
      lower(entry.value->>'content_type') AS content_type,
      (entry.value->>'size_bytes')::bigint AS size_bytes,
      entry.value->>'error_code' AS error_code
    FROM jsonb_array_elements(p_results) AS entry(value)
  LOOP
    SELECT image.*
    INTO selected_image
    FROM public.product_draft_images AS image
    WHERE image.id = result_entry.image_id
      AND image.product_draft_id = selected_product.id
      AND image.source_kind = 'seller_upload'
    FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('result', 'image_not_found'); END IF;

    IF selected_image.status <> 'pending' THEN CONTINUE; END IF;
    IF result_entry.outcome = 'available' THEN
      IF result_entry.content_type IS DISTINCT FROM selected_image.content_type
        OR result_entry.size_bytes IS DISTINCT FROM selected_image.size_bytes
        OR result_entry.content_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
      THEN
        RAISE EXCEPTION 'product_draft_image_verification_failed' USING ERRCODE = '22023';
      END IF;
      UPDATE public.product_draft_images AS image
      SET status = 'available', lifecycle_error_code = NULL
      WHERE image.id = selected_image.id;
    ELSIF result_entry.outcome = 'failed'
      AND result_entry.error_code IN (
        'product_draft_image_object_missing',
        'product_draft_image_verification_failed',
        'product_draft_image_upload_cleanup_failed'
      )
    THEN
      UPDATE public.product_draft_images AS image
      SET status = 'failed', lifecycle_error_code = result_entry.error_code
      WHERE image.id = selected_image.id;
    ELSE
      RAISE EXCEPTION 'product_draft_image_upload_invalid' USING ERRCODE = '22023';
    END IF;
    changed := true;
  END LOOP;

  IF changed THEN
    IF selected_product.cover_image_id IS NULL THEN
      SELECT image.id
      INTO new_cover_id
      FROM public.product_draft_images AS image
      WHERE image.product_draft_id = selected_product.id
        AND image.source_kind = 'seller_upload'
        AND image.status = 'available'
      ORDER BY image.source_position, image.id
      LIMIT 1;
    ELSE
      new_cover_id := selected_product.cover_image_id;
    END IF;

    UPDATE public.products AS product
    SET
      cover_image_id = new_cover_id,
      cover_image_url = CASE WHEN new_cover_id IS NOT NULL THEN NULL ELSE cover_image_url END,
      image_gallery_revision = image_gallery_revision + 1
    WHERE product.id = selected_product.id
    RETURNING product.image_gallery_revision INTO selected_product.image_gallery_revision;

    IF new_cover_id IS NOT NULL THEN
      DELETE FROM public.direct_product_legacy_cover_allowances AS allowance
      WHERE allowance.product_draft_id = selected_product.id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'result', 'finalized',
    'galleryRevision', selected_product.image_gallery_revision
  );
END;
$$;

CREATE FUNCTION public.complete_seller_product_draft_image_upload_cleanup(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_product_draft_image_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_image public.product_draft_images%ROWTYPE;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id AND product.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'not_found'); END IF;

  SELECT image.* INTO selected_image
  FROM public.product_draft_images AS image
  WHERE image.id = p_product_draft_image_id
    AND image.product_draft_id = selected_product.id
    AND image.source_kind = 'seller_upload'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'image_not_found'); END IF;
  IF selected_image.status <> 'failed'
    OR selected_image.lifecycle_error_code <>
      'product_draft_image_upload_cleanup_failed'
  THEN
    RETURN jsonb_build_object(
      'result', 'noop',
      'galleryRevision', selected_product.image_gallery_revision
    );
  END IF;

  UPDATE public.product_draft_images AS image
  SET lifecycle_error_code = 'product_draft_image_verification_failed'
  WHERE image.id = selected_image.id;
  UPDATE public.products AS product
  SET image_gallery_revision = image_gallery_revision + 1
  WHERE product.id = selected_product.id
  RETURNING product.image_gallery_revision INTO selected_product.image_gallery_revision;

  RETURN jsonb_build_object(
    'result', 'cleanup_completed',
    'galleryRevision', selected_product.image_gallery_revision
  );
END;
$$;

CREATE FUNCTION public.fail_seller_product_draft_image_upload_cleanup(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_product_draft_image_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id AND product.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'not_found'); END IF;

  UPDATE public.product_draft_images AS image
  SET lifecycle_error_code = 'product_draft_image_upload_cleanup_failed'
  WHERE image.id = p_product_draft_image_id
    AND image.product_draft_id = selected_product.id
    AND image.source_kind = 'seller_upload'
    AND image.status = 'failed';
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'image_not_found'); END IF;

  UPDATE public.products AS product
  SET image_gallery_revision = image_gallery_revision + 1
  WHERE product.id = selected_product.id
  RETURNING product.image_gallery_revision INTO selected_product.image_gallery_revision;

  RETURN jsonb_build_object(
    'result', 'cleanup_failed',
    'galleryRevision', selected_product.image_gallery_revision
  );
END;
$$;

CREATE FUNCTION public.update_seller_product_draft_image_gallery(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_expected_gallery_revision bigint,
  p_ordered_available_image_ids uuid[],
  p_cover_image_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  current_order uuid[];
  requested_count integer;
  available_count integer;
  temporary_base integer;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id AND product.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'not_found'); END IF;
  IF selected_product.status <> 'draft' THEN
    RETURN jsonb_build_object('result', 'not_editable');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_draft_source_memberships AS membership
    WHERE membership.product_draft_id = selected_product.id
  ) THEN
    RETURN jsonb_build_object('result', 'not_allowed');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_image_publication_runs AS run
    WHERE run.product_draft_id = selected_product.id AND run.status <> 'completed'
  ) OR EXISTS (
    SELECT 1 FROM public.product_image_publication_items AS item
    WHERE item.product_draft_id = selected_product.id
  ) THEN
    RETURN jsonb_build_object('result', 'gallery_locked');
  END IF;
  IF selected_product.image_gallery_revision IS DISTINCT FROM p_expected_gallery_revision THEN
    RETURN jsonb_build_object(
      'result', 'stale',
      'galleryRevision', selected_product.image_gallery_revision
    );
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_draft_images AS image
    WHERE image.product_draft_id = selected_product.id
      AND image.source_kind = 'seller_upload'
      AND image.status <> 'available'
  ) THEN
    RETURN jsonb_build_object('result', 'gallery_incomplete');
  END IF;

  requested_count := coalesce(cardinality(p_ordered_available_image_ids), 0);
  SELECT count(*)::integer, array_agg(image.id ORDER BY image.source_position, image.id)
  INTO available_count, current_order
  FROM public.product_draft_images AS image
  WHERE image.product_draft_id = selected_product.id
    AND image.source_kind = 'seller_upload'
    AND image.status = 'available';

  IF requested_count = 0
    OR requested_count <> available_count
    OR p_cover_image_id IS NULL
    OR NOT p_cover_image_id = ANY(p_ordered_available_image_ids)
    OR (
      SELECT count(DISTINCT image_id)
      FROM unnest(p_ordered_available_image_ids) AS image_id
    ) <> requested_count
    OR EXISTS (
      SELECT 1
      FROM unnest(p_ordered_available_image_ids) AS requested(image_id)
      LEFT JOIN public.product_draft_images AS image
        ON image.id = requested.image_id
        AND image.product_draft_id = selected_product.id
        AND image.source_kind = 'seller_upload'
        AND image.status = 'available'
      WHERE image.id IS NULL
    )
  THEN
    RAISE EXCEPTION 'product_draft_image_upload_invalid' USING ERRCODE = '22023';
  END IF;

  IF current_order = p_ordered_available_image_ids
    AND selected_product.cover_image_id = p_cover_image_id
  THEN
    RETURN jsonb_build_object(
      'result', 'unchanged',
      'galleryRevision', selected_product.image_gallery_revision
    );
  END IF;

  SELECT coalesce(max(image.source_position), -1) + available_count + 1
  INTO temporary_base
  FROM public.product_draft_images AS image
  WHERE image.product_draft_id = selected_product.id;

  UPDATE public.product_draft_images AS image
  SET source_position = temporary_base + image.source_position
  WHERE image.product_draft_id = selected_product.id
    AND image.source_kind = 'seller_upload';

  UPDATE public.product_draft_images AS image
  SET source_position = array_position(p_ordered_available_image_ids, image.id) - 1
  WHERE image.product_draft_id = selected_product.id
    AND image.source_kind = 'seller_upload';

  UPDATE public.products AS product
  SET
    cover_image_id = p_cover_image_id,
    image_gallery_revision = image_gallery_revision + 1
  WHERE product.id = selected_product.id
  RETURNING product.image_gallery_revision INTO selected_product.image_gallery_revision;

  RETURN jsonb_build_object(
    'result', 'updated',
    'galleryRevision', selected_product.image_gallery_revision
  );
END;
$$;

CREATE FUNCTION public.begin_seller_product_draft_image_removal(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_product_draft_image_id uuid,
  p_expected_gallery_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_image public.product_draft_images%ROWTYPE;
  ordered_image record;
  temporary_base integer;
  next_position integer := 0;
  replacement_cover_id uuid;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id AND product.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'not_found'); END IF;
  IF selected_product.status <> 'draft' THEN
    RETURN jsonb_build_object('result', 'not_editable');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_draft_source_memberships AS membership
    WHERE membership.product_draft_id = selected_product.id
  ) THEN
    RETURN jsonb_build_object('result', 'not_allowed');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_image_publication_runs AS run
    WHERE run.product_draft_id = selected_product.id AND run.status <> 'completed'
  ) OR EXISTS (
    SELECT 1 FROM public.product_image_publication_items AS item
    WHERE item.product_draft_id = selected_product.id
  ) THEN
    RETURN jsonb_build_object('result', 'gallery_locked');
  END IF;

  SELECT image.* INTO selected_image
  FROM public.product_draft_images AS image
  WHERE image.id = p_product_draft_image_id
    AND image.product_draft_id = selected_product.id
    AND image.source_kind = 'seller_upload'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'image_not_found'); END IF;

  IF selected_image.status = 'deleting' THEN
    RETURN jsonb_build_object(
      'result', 'cleanup_required',
      'galleryRevision', selected_product.image_gallery_revision,
      'destinationKey', selected_image.destination_key
    );
  END IF;
  IF selected_product.image_gallery_revision IS DISTINCT FROM p_expected_gallery_revision THEN
    RETURN jsonb_build_object(
      'result', 'stale',
      'galleryRevision', selected_product.image_gallery_revision
    );
  END IF;

  SELECT coalesce(max(image.source_position), -1) + 21
  INTO temporary_base
  FROM public.product_draft_images AS image
  WHERE image.product_draft_id = selected_product.id;

  UPDATE public.product_draft_images AS image
  SET source_position = temporary_base + image.source_position
  WHERE image.product_draft_id = selected_product.id;

  FOR ordered_image IN
    SELECT image.id
    FROM public.product_draft_images AS image
    WHERE image.product_draft_id = selected_product.id
      AND image.id <> selected_image.id
      AND image.status <> 'deleting'
    ORDER BY image.source_position, image.id
  LOOP
    UPDATE public.product_draft_images AS image
    SET source_position = next_position
    WHERE image.id = ordered_image.id;
    next_position := next_position + 1;
  END LOOP;

  UPDATE public.product_draft_images AS image
  SET status = 'deleting', lifecycle_error_code = NULL, source_position = next_position
  WHERE image.id = selected_image.id;

  UPDATE public.product_draft_images AS image
  SET source_position = next_position + 1 + row_number_value.position
  FROM (
    SELECT
      remaining.id,
      row_number() OVER (ORDER BY remaining.source_position, remaining.id) - 1 AS position
    FROM public.product_draft_images AS remaining
    WHERE remaining.product_draft_id = selected_product.id
      AND remaining.status = 'deleting'
      AND remaining.id <> selected_image.id
  ) AS row_number_value
  WHERE image.id = row_number_value.id;

  replacement_cover_id := selected_product.cover_image_id;
  IF selected_product.cover_image_id = selected_image.id THEN
    SELECT image.id INTO replacement_cover_id
    FROM public.product_draft_images AS image
    WHERE image.product_draft_id = selected_product.id
      AND image.status = 'available'
      AND image.id <> selected_image.id
    ORDER BY image.source_position, image.id
    LIMIT 1;
  END IF;

  UPDATE public.products AS product
  SET
    cover_image_id = replacement_cover_id,
    image_gallery_revision = image_gallery_revision + 1
  WHERE product.id = selected_product.id
  RETURNING product.image_gallery_revision INTO selected_product.image_gallery_revision;

  RETURN jsonb_build_object(
    'result', 'cleanup_required',
    'galleryRevision', selected_product.image_gallery_revision,
    'destinationKey', selected_image.destination_key
  );
END;
$$;

CREATE FUNCTION public.complete_seller_product_draft_image_removal(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_product_draft_image_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id AND product.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'not_found'); END IF;

  DELETE FROM public.product_draft_images AS image
  WHERE image.id = p_product_draft_image_id
    AND image.product_draft_id = selected_product.id
    AND image.source_kind = 'seller_upload'
    AND image.status = 'deleting';
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'image_not_found'); END IF;

  RETURN jsonb_build_object(
    'result', 'removed',
    'galleryRevision', selected_product.image_gallery_revision
  );
END;
$$;

CREATE FUNCTION public.fail_seller_product_draft_image_removal(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_product_draft_image_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id AND product.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'not_found'); END IF;

  UPDATE public.product_draft_images AS image
  SET lifecycle_error_code = 'product_draft_image_delete_failed'
  WHERE image.id = p_product_draft_image_id
    AND image.product_draft_id = selected_product.id
    AND image.source_kind = 'seller_upload'
    AND image.status = 'deleting';
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'image_not_found'); END IF;

  RETURN jsonb_build_object(
    'result', 'cleanup_failed',
    'galleryRevision', selected_product.image_gallery_revision
  );
END;
$$;

ALTER TABLE public.product_image_publication_items
  DROP CONSTRAINT product_image_publication_items_source_fields,
  ADD CONSTRAINT product_image_publication_items_source_fields
    CHECK (
      source_bucket = 'product-draft-images'
      AND length(btrim(source_object_key)) > 0
      AND length(btrim(destination_key)) > 0
      AND source_position >= 0
      AND publication_order >= 0
      AND expected_source_size_bytes > 0
      AND expected_content_type IN ('image/jpeg', 'image/png', 'image/webp')
    );

CREATE FUNCTION public.enforce_direct_product_cover_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.cover_image_url IS NULL
    OR (TG_OP = 'UPDATE' AND NEW.cover_image_url IS NOT DISTINCT FROM OLD.cover_image_url)
  THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_image_publication_runs AS run
    JOIN public.product_image_publication_items AS item
      ON item.product_draft_id = run.product_draft_id
      AND item.is_cover
      AND item.status = 'completed'
      AND item.public_url = NEW.cover_image_url
    WHERE run.product_draft_id = NEW.id
      AND run.seller_id = NEW.seller_id
      AND run.status = 'completed'
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.direct_product_legacy_cover_allowances AS allowance
    WHERE allowance.product_draft_id = NEW.id
      AND allowance.recorded_cover_image_url = NEW.cover_image_url
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'product_draft_manual_cover_not_allowed'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER trg_products_04_direct_cover_write
  BEFORE INSERT OR UPDATE OF cover_image_url ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_direct_product_cover_write();

CREATE OR REPLACE FUNCTION public.authorize_seller_product_publication(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_title_patch_present boolean,
  p_title text,
  p_description_patch_present boolean,
  p_description text,
  p_category_id uuid,
  p_moq integer,
  p_pack_size text,
  p_price numeric,
  p_currency text,
  p_stock public.stock_status,
  p_cover_image_url_patch_present boolean,
  p_cover_image_url text,
  p_trending boolean
)
RETURNS TABLE (
  result text,
  product_draft_id uuid,
  publication_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_run public.product_image_publication_runs%ROWTYPE;
  save_result record;
  image_count integer;
  cover_count integer;
  imported_product boolean;
  direct_private_product boolean;
  title_validation_result text;
  description_validation_result text;
  stable_error text;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id AND product.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;
  IF selected_product.status <> 'draft' THEN
    RETURN QUERY SELECT 'not_allowed'::text, selected_product.id, NULL::text;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.product_draft_source_memberships AS membership
    WHERE membership.product_draft_id = selected_product.id
  ) INTO imported_product;
  SELECT EXISTS (
    SELECT 1 FROM public.product_draft_images AS image
    WHERE image.product_draft_id = selected_product.id
      AND image.source_kind = 'seller_upload'
  ) INTO direct_private_product;

  IF NOT imported_product AND NOT direct_private_product THEN
    IF EXISTS (
      SELECT 1 FROM public.direct_product_legacy_cover_allowances AS allowance
      WHERE allowance.product_draft_id = selected_product.id
        AND allowance.recorded_cover_image_url = selected_product.cover_image_url
    ) THEN
      RETURN QUERY SELECT 'direct_product'::text, selected_product.id, NULL::text;
    ELSE
      RETURN QUERY SELECT 'image_required'::text, selected_product.id, NULL::text;
    END IF;
    RETURN;
  END IF;
  IF imported_product = direct_private_product
    OR (imported_product AND EXISTS (
      SELECT 1 FROM public.product_draft_images AS image
      WHERE image.product_draft_id = selected_product.id
        AND image.source_kind <> 'classifier_import'
    ))
    OR (direct_private_product AND EXISTS (
      SELECT 1 FROM public.product_draft_images AS image
      WHERE image.product_draft_id = selected_product.id
        AND image.source_kind <> 'seller_upload'
    ))
  THEN
    RETURN QUERY SELECT 'not_allowed'::text, selected_product.id, NULL::text;
    RETURN;
  END IF;

  SELECT run.* INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.product_draft_id = selected_product.id
  FOR UPDATE;

  IF FOUND AND selected_run.status IN ('pending', 'running') THEN
    IF selected_product.product_code IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.product_code_allocations AS allocation
      WHERE allocation.product_code = selected_product.product_code
        AND allocation.product_id = selected_product.id
        AND allocation.seller_id = selected_product.seller_id
    ) THEN
      RETURN QUERY SELECT
        'product_code_allocation_failed'::text,
        selected_product.id,
        selected_run.status;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'in_progress'::text, selected_product.id, selected_run.status;
    RETURN;
  END IF;

  IF FOUND AND (
    selected_run.status = 'cleanup_required'
    OR EXISTS (
      SELECT 1 FROM public.product_image_publication_items AS item
      WHERE item.product_draft_id = selected_product.id
        AND item.object_created_by_attempt_token IS NOT NULL
    )
  ) THEN
    RETURN QUERY SELECT 'not_allowed'::text, selected_product.id, selected_run.status;
    RETURN;
  END IF;

  SELECT validation.result INTO title_validation_result
  FROM public.validate_product_publication_title(
    CASE WHEN coalesce(p_title_patch_present, false) THEN p_title ELSE selected_product.title END
  ) AS validation;
  IF title_validation_result <> 'valid' THEN
    RETURN QUERY SELECT title_validation_result, selected_product.id, NULL::text;
    RETURN;
  END IF;

  description_validation_result := public.validate_product_publication_descriptions(
    selected_product.id,
    p_description_patch_present,
    p_description
  );
  IF description_validation_result <> 'valid' THEN
    RETURN QUERY SELECT description_validation_result, selected_product.id, NULL::text;
    RETURN;
  END IF;
  IF p_category_id IS NULL THEN
    RETURN QUERY SELECT
      'product_publication_category_required'::text,
      selected_product.id,
      NULL::text;
    RETURN;
  END IF;
  IF coalesce(p_cover_image_url_patch_present, false) THEN
    RETURN QUERY SELECT 'cover_not_allowed'::text, selected_product.id, NULL::text;
    RETURN;
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE image.id = selected_product.cover_image_id)::integer
  INTO image_count, cover_count
  FROM public.product_draft_images AS image
  WHERE image.product_draft_id = selected_product.id;

  IF image_count = 0 THEN
    RETURN QUERY SELECT 'image_required'::text, selected_product.id, NULL::text;
    RETURN;
  END IF;
  IF image_count > 20 OR selected_product.cover_image_id IS NULL OR cover_count <> 1 THEN
    RETURN QUERY SELECT 'not_allowed'::text, selected_product.id, NULL::text;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_draft_images AS image
    WHERE image.product_draft_id = selected_product.id
      AND (
        image.status <> 'available'
        OR image.storage_bucket <> 'product-draft-images'
        OR image.content_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
        OR image.size_bytes IS NULL
        OR image.size_bytes <= 0
      )
  ) THEN
    RETURN QUERY SELECT 'images_not_ready'::text, selected_product.id, NULL::text;
    RETURN;
  END IF;

  BEGIN
    SELECT * INTO save_result
    FROM public.save_seller_product_with_description(
      selected_product.id,
      p_seller_id,
      p_title_patch_present,
      p_title,
      p_description_patch_present,
      p_description,
      p_category_id,
      p_moq,
      p_pack_size,
      p_price,
      p_currency,
      p_stock,
      false,
      NULL,
      p_trending,
      'draft'
    );
    IF save_result.result <> 'updated' THEN
      RAISE EXCEPTION '%', save_result.result USING ERRCODE = 'P0001';
    END IF;

    PERFORM public.assign_product_code_for_publication(
      selected_product.id,
      selected_product.seller_id
    );

    DELETE FROM public.product_image_publication_items AS item
    WHERE item.product_draft_id = selected_product.id;

    INSERT INTO public.product_image_publication_runs AS run (
      product_draft_id,
      seller_id,
      status,
      attempt_count,
      attempt_token,
      claim_started_at,
      error_code,
      completed_at
    ) VALUES (
      selected_product.id,
      p_seller_id,
      'pending',
      coalesce(selected_run.attempt_count, 0),
      NULL,
      NULL,
      NULL,
      NULL
    )
    ON CONFLICT ON CONSTRAINT product_image_publication_runs_pkey DO UPDATE
    SET
      seller_id = EXCLUDED.seller_id,
      status = 'pending',
      attempt_token = NULL,
      claim_started_at = NULL,
      error_code = NULL,
      completed_at = NULL;

    INSERT INTO public.product_image_publication_items (
      product_draft_id,
      product_draft_image_id,
      source_bucket,
      source_object_key,
      destination_key,
      source_position,
      publication_order,
      is_cover,
      expected_source_size_bytes,
      expected_content_type
    )
    SELECT
      selected_product.id,
      image.id,
      image.storage_bucket,
      image.destination_key,
      'published-products/' || selected_product.id::text || '/' || image.id::text || '.' ||
        CASE image.content_type
          WHEN 'image/jpeg' THEN 'jpg'
          WHEN 'image/png' THEN 'png'
          WHEN 'image/webp' THEN 'webp'
        END,
      image.source_position,
      row_number() OVER (ORDER BY image.source_position, image.id) - 1,
      image.id = selected_product.cover_image_id,
      image.size_bytes,
      image.content_type
    FROM public.product_draft_images AS image
    WHERE image.product_draft_id = selected_product.id
    ORDER BY image.source_position, image.id;
  EXCEPTION
    WHEN OTHERS THEN
      stable_error := SQLERRM;
      IF stable_error NOT IN (
        'facts_missing',
        'title_required',
        'title_invalid',
        'description_invalid',
        'product_draft_description_invalid',
        'product_publication_category_required',
        'product_category_not_supported',
        'product_code_company_unconfigured',
        'product_code_category_unconfigured',
        'product_code_allocation_failed'
      ) THEN
        RAISE;
      END IF;
  END;

  IF stable_error IS NOT NULL THEN
    RETURN QUERY SELECT stable_error, selected_product.id, NULL::text;
    RETURN;
  END IF;
  RETURN QUERY SELECT 'pending'::text, selected_product.id, 'pending'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_product_image_publication()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  manifest_count integer;
  linked_count integer;
  completed_count integer;
  cover_url text;
  durable_publication_required boolean;
BEGIN
  IF NEW.status = 'published'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published')
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.product_draft_source_memberships AS membership
      WHERE membership.product_draft_id = NEW.id
    ) OR EXISTS (
      SELECT 1 FROM public.product_draft_images AS draft_image
      WHERE draft_image.product_draft_id = NEW.id
    ) OR EXISTS (
      SELECT 1 FROM public.product_image_publication_items AS item
      WHERE item.product_draft_id = NEW.id
    ) INTO durable_publication_required;

    IF durable_publication_required THEN
      SELECT
        count(*)::integer,
        count(*) FILTER (WHERE item.status = 'completed')::integer,
        max(item.public_url) FILTER (WHERE item.is_cover)
      INTO manifest_count, completed_count, cover_url
      FROM public.product_image_publication_items AS item
      WHERE item.product_draft_id = NEW.id;

      SELECT count(*)::integer INTO linked_count
      FROM public.product_images AS image
      JOIN public.product_image_publication_items AS item
        ON item.product_draft_id = NEW.id
        AND item.product_draft_image_id = image.source_product_draft_image_id
      WHERE image.product_id = NEW.id
        AND image.sort_order = item.publication_order
        AND image.url = item.public_url;

      IF manifest_count = 0
        OR completed_count <> manifest_count
        OR linked_count <> manifest_count
        OR cover_url IS NULL
        OR NEW.cover_image_url IS DISTINCT FROM cover_url
        OR NOT EXISTS (
          SELECT 1 FROM public.product_image_publication_runs AS run
          WHERE run.product_draft_id = NEW.id
            AND run.seller_id = NEW.seller_id
            AND run.status = 'completed'
            AND run.completed_at IS NOT NULL
        )
        OR EXISTS (
          SELECT 1 FROM public.product_images AS image
          WHERE image.product_id = NEW.id
            AND image.source_product_draft_image_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM public.product_image_publication_items AS item
              WHERE item.product_draft_id = NEW.id
                AND item.product_draft_image_id = image.source_product_draft_image_id
            )
        )
      THEN
        RAISE EXCEPTION 'product_publication_not_allowed' USING ERRCODE = '23514';
      END IF;
    ELSIF NULLIF(btrim(coalesce(NEW.cover_image_url, '')), '') IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.direct_product_legacy_cover_allowances AS allowance
        WHERE allowance.product_draft_id = NEW.id
          AND allowance.recorded_cover_image_url = NEW.cover_image_url
      )
    THEN
      RAISE EXCEPTION 'product_publication_not_allowed' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.finalize_seller_product_publication(uuid, uuid, uuid)
  RENAME TO finalize_seller_product_publication_0036a_legacy;
REVOKE ALL ON FUNCTION public.finalize_seller_product_publication_0036a_legacy(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.finalize_seller_product_publication(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_attempt_token uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  finalize_result text;
  direct_private_product boolean;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id AND product.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF selected_product.category_id IS NULL
    OR selected_product.product_code IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.product_code_allocations AS allocation
      WHERE allocation.product_code = selected_product.product_code
        AND allocation.product_id = selected_product.id
        AND allocation.seller_id = selected_product.seller_id
    )
  THEN
    RETURN 'not_allowed';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.product_draft_images AS image
    WHERE image.product_draft_id = selected_product.id
      AND image.source_kind = 'seller_upload'
  ) INTO direct_private_product;

  finalize_result := public.finalize_seller_product_publication_0036a_legacy(
    p_product_draft_id,
    p_seller_id,
    p_attempt_token
  );

  IF finalize_result = 'completed' AND direct_private_product THEN
    DELETE FROM public.product_images AS image
    WHERE image.product_id = selected_product.id
      AND image.source_product_draft_image_id IS NULL;
    DELETE FROM public.direct_product_legacy_cover_allowances AS allowance
    WHERE allowance.product_draft_id = selected_product.id;
  END IF;
  RETURN finalize_result;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_product_draft_image_immutable_fields()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.product_draft_image_gallery_snapshot(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_direct_product_cover_write()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.prepare_seller_product_draft_image_uploads(
  uuid, uuid, bigint, jsonb, uuid[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_seller_product_draft_image_uploads(
  uuid, uuid, bigint, jsonb, uuid[]
) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_seller_product_draft_image_uploads(
  uuid, uuid, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_seller_product_draft_image_uploads(
  uuid, uuid, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_seller_product_draft_image_upload_cleanup(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_seller_product_draft_image_upload_cleanup(
  uuid, uuid, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.fail_seller_product_draft_image_upload_cleanup(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_seller_product_draft_image_upload_cleanup(
  uuid, uuid, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.update_seller_product_draft_image_gallery(
  uuid, uuid, bigint, uuid[], uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_seller_product_draft_image_gallery(
  uuid, uuid, bigint, uuid[], uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.begin_seller_product_draft_image_removal(
  uuid, uuid, uuid, bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_seller_product_draft_image_removal(
  uuid, uuid, uuid, bigint
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_seller_product_draft_image_removal(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_seller_product_draft_image_removal(
  uuid, uuid, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.fail_seller_product_draft_image_removal(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_seller_product_draft_image_removal(
  uuid, uuid, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.authorize_seller_product_publication(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_seller_product_publication(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean
) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_seller_product_publication(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_seller_product_publication(uuid, uuid, uuid)
  TO service_role;

COMMIT;
