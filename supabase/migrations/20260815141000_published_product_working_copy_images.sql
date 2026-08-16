BEGIN;

CREATE FUNCTION public.refresh_product_moderation_working_image_snapshot(
  p_product_id uuid,
  p_increment_revision boolean
)
RETURNS public.product_moderation_working_copies
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  image_ids jsonb;
  cover_id uuid;
  selected_copy public.product_moderation_working_copies%ROWTYPE;
BEGIN
  SELECT
    COALESCE(jsonb_agg(to_jsonb(membership.product_draft_image_id) ORDER BY membership.position), '[]'::jsonb),
    (min(membership.product_draft_image_id::text) FILTER (WHERE membership.is_cover))::uuid
  INTO image_ids, cover_id
  FROM public.product_moderation_working_copy_images AS membership
  WHERE membership.product_id = p_product_id;

  UPDATE public.product_moderation_working_copies AS working_copy
  SET
    snapshot_json = jsonb_set(
      jsonb_set(working_copy.snapshot_json, '{imageIds}', image_ids, true),
      '{coverImageId}', COALESCE(to_jsonb(cover_id), 'null'::jsonb), true
    ),
    revision = revision + CASE WHEN p_increment_revision THEN 1 ELSE 0 END,
    updated_at = CASE WHEN p_increment_revision THEN now() ELSE updated_at END
  WHERE working_copy.product_id = p_product_id
  RETURNING * INTO selected_copy;
  RETURN selected_copy;
END;
$$;

CREATE FUNCTION public.enforce_product_moderation_private_image_mutation()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product_id uuid;
  approved_submission_id uuid;
  selected_image_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    selected_product_id := OLD.product_draft_id;
    selected_image_id := OLD.id;
  ELSE
    selected_product_id := NEW.product_draft_id;
    selected_image_id := NEW.id;
  END IF;
  SELECT product.approved_moderation_submission_id INTO approved_submission_id
  FROM public.products AS product WHERE product.id = selected_product_id;
  IF approved_submission_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' AND EXISTS (
    SELECT 1 FROM public.product_moderation_submission_images AS membership
    WHERE membership.product_id = selected_product_id
      AND membership.product_draft_image_id = selected_image_id
  ) THEN
    RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
  END IF;
  IF NOT public.product_moderation_registry_contains(
    'bazoria.product_moderation_working_image_ids', selected_product_id
  ) THEN
    RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_product_draft_images_01_moderation_private
  BEFORE INSERT OR UPDATE OR DELETE ON public.product_draft_images
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_moderation_private_image_mutation();

CREATE FUNCTION public.prepare_product_moderation_working_image_uploads(
  p_product_id uuid,
  p_seller_id uuid,
  p_expected_revision bigint,
  p_files jsonb,
  p_verified_absent_image_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  file_entry record;
  selected_image public.product_draft_images%ROWTYPE;
  file_count integer;
  distinct_count integer;
  active_count integer;
  new_count integer := 0;
  changed boolean := false;
  next_position integer;
  next_source_position integer;
  next_image_id uuid;
  extension text;
  result_images jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_files) <> 'array'
    OR jsonb_array_length(p_files) NOT BETWEEN 1 AND 20
  THEN
    RAISE EXCEPTION 'product_draft_image_upload_invalid' USING ERRCODE = '22023';
  END IF;
  selected_copy := public.assert_product_moderation_working_revision(
    p_product_id, p_seller_id, p_expected_revision
  );
  SELECT count(*)::integer, count(DISTINCT entry.value ->> 'client_upload_id')::integer
  INTO file_count, distinct_count
  FROM jsonb_array_elements(p_files) AS entry(value);
  IF file_count <> distinct_count THEN
    RAISE EXCEPTION 'product_draft_image_upload_invalid' USING ERRCODE = '22023';
  END IF;

  FOR file_entry IN
    SELECT
      (entry.value ->> 'client_upload_id')::uuid AS client_upload_id,
      entry.value ->> 'original_filename' AS original_filename,
      lower(entry.value ->> 'content_type') AS content_type,
      (entry.value ->> 'size_bytes')::bigint AS size_bytes
    FROM jsonb_array_elements(p_files) WITH ORDINALITY AS entry(value, ordinality)
    ORDER BY entry.ordinality
  LOOP
    IF file_entry.original_filename IS NULL OR btrim(file_entry.original_filename) = ''
      OR char_length(file_entry.original_filename) > 255
      OR file_entry.content_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
      OR file_entry.size_bytes NOT BETWEEN 1 AND 20971520
    THEN
      RAISE EXCEPTION 'product_draft_image_upload_invalid' USING ERRCODE = '22023';
    END IF;
    SELECT image.* INTO selected_image
    FROM public.product_draft_images AS image
    WHERE image.product_draft_id = p_product_id
      AND image.source_kind = 'seller_upload'
      AND image.client_upload_id = file_entry.client_upload_id
    FOR UPDATE;
    IF FOUND THEN
      IF selected_image.original_filename IS DISTINCT FROM file_entry.original_filename
        OR selected_image.content_type IS DISTINCT FROM file_entry.content_type
        OR selected_image.size_bytes IS DISTINCT FROM file_entry.size_bytes
      THEN
        RETURN jsonb_build_object('result', 'upload_conflict');
      END IF;
      IF selected_image.status = 'deleting' THEN
        RETURN jsonb_build_object('result', 'gallery_locked');
      END IF;
      IF selected_image.status = 'failed' THEN
        IF NOT selected_image.id = ANY(COALESCE(p_verified_absent_image_ids, ARRAY[]::uuid[])) THEN
          RETURN jsonb_build_object(
            'result', CASE
              WHEN selected_image.lifecycle_error_code = 'product_draft_image_upload_cleanup_failed'
                THEN 'cleanup_required'
              ELSE 'verification_required'
            END,
            'imageId', selected_image.id
          );
        END IF;
        changed := true;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.product_moderation_working_copy_images AS membership
        WHERE membership.product_id = p_product_id
          AND membership.product_draft_image_id = selected_image.id
      ) THEN
        changed := true;
        new_count := new_count + 1;
      END IF;
    ELSE
      changed := true;
      new_count := new_count + 1;
    END IF;
  END LOOP;

  SELECT count(*)::integer INTO active_count
  FROM public.product_moderation_working_copy_images AS membership
  WHERE membership.product_id = p_product_id;
  IF active_count + new_count > 20 THEN
    RETURN jsonb_build_object('result', 'limit_exceeded');
  END IF;
  SELECT COALESCE(max(membership.position), -1) + 1 INTO next_position
  FROM public.product_moderation_working_copy_images AS membership
  WHERE membership.product_id = p_product_id;
  SELECT COALESCE(max(image.source_position), -1) + 1 INTO next_source_position
  FROM public.product_draft_images AS image
  WHERE image.product_draft_id = p_product_id;

  PERFORM public.product_moderation_registry_add(
    'bazoria.product_moderation_working_image_ids', p_product_id
  );
  FOR file_entry IN
    SELECT
      (entry.value ->> 'client_upload_id')::uuid AS client_upload_id,
      entry.value ->> 'original_filename' AS original_filename,
      lower(entry.value ->> 'content_type') AS content_type,
      (entry.value ->> 'size_bytes')::bigint AS size_bytes
    FROM jsonb_array_elements(p_files) WITH ORDINALITY AS entry(value, ordinality)
    ORDER BY entry.ordinality
  LOOP
    SELECT image.* INTO selected_image
    FROM public.product_draft_images AS image
    WHERE image.product_draft_id = p_product_id
      AND image.source_kind = 'seller_upload'
      AND image.client_upload_id = file_entry.client_upload_id
    FOR UPDATE;
    IF FOUND THEN
      IF selected_image.status = 'failed' THEN
        UPDATE public.product_draft_images AS image
        SET status = 'pending', lifecycle_error_code = NULL
        WHERE image.id = selected_image.id;
        selected_image.status := 'pending';
      END IF;
    ELSE
      next_image_id := gen_random_uuid();
      extension := CASE file_entry.content_type
        WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' ELSE 'webp' END;
      INSERT INTO public.product_draft_images (
        id, product_draft_id, classifier_image_id, source_position, status,
        destination_key, content_type, size_bytes, storage_bucket, source_kind,
        client_upload_id, original_filename, lifecycle_error_code
      ) VALUES (
        next_image_id, p_product_id, NULL, next_source_position, 'pending',
        'product-drafts/' || p_seller_id::text || '/' || p_product_id::text || '/'
          || next_image_id::text || '.' || extension,
        file_entry.content_type, file_entry.size_bytes, 'product-draft-images',
        'seller_upload', file_entry.client_upload_id, file_entry.original_filename, NULL
      ) RETURNING * INTO selected_image;
      next_source_position := next_source_position + 1;
    END IF;
    INSERT INTO public.product_moderation_working_copy_images (
      product_id, product_draft_image_id, position, is_cover
    ) VALUES (p_product_id, selected_image.id, next_position, false)
    ON CONFLICT (product_id, product_draft_image_id) DO NOTHING;
    IF FOUND THEN next_position := next_position + 1; END IF;
    result_images := result_images || jsonb_build_array(jsonb_build_object(
      'imageId', selected_image.id,
      'clientUploadId', selected_image.client_upload_id,
      'originalFilename', selected_image.original_filename,
      'contentType', selected_image.content_type,
      'sizeBytes', selected_image.size_bytes,
      'destinationKey', selected_image.destination_key,
      'durableStatus', selected_image.status
    ));
  END LOOP;

  IF changed THEN
    selected_copy := public.refresh_product_moderation_working_image_snapshot(
      p_product_id, true
    );
  END IF;
  RETURN jsonb_build_object(
    'result', 'prepared',
    'galleryRevision', selected_copy.revision,
    'moderationRevision', selected_copy.revision,
    'images', result_images
  );
END;
$$;

CREATE FUNCTION public.finalize_product_moderation_working_image_uploads(
  p_product_id uuid,
  p_seller_id uuid,
  p_expected_revision bigint,
  p_results jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  result_entry record;
  selected_image public.product_draft_images%ROWTYPE;
  changed boolean := false;
BEGIN
  IF jsonb_typeof(p_results) <> 'array' OR jsonb_array_length(p_results) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'product_draft_image_upload_invalid' USING ERRCODE = '22023';
  END IF;
  selected_copy := public.assert_product_moderation_working_revision(
    p_product_id, p_seller_id, p_expected_revision
  );
  PERFORM public.product_moderation_registry_add(
    'bazoria.product_moderation_working_image_ids', p_product_id
  );
  FOR result_entry IN
    SELECT (entry.value ->> 'image_id')::uuid AS image_id,
      entry.value ->> 'outcome' AS outcome,
      lower(entry.value ->> 'content_type') AS content_type,
      (entry.value ->> 'size_bytes')::bigint AS size_bytes,
      entry.value ->> 'error_code' AS error_code
    FROM jsonb_array_elements(p_results) AS entry(value)
  LOOP
    SELECT image.* INTO selected_image
    FROM public.product_draft_images AS image
    JOIN public.product_moderation_working_copy_images AS membership
      ON membership.product_id = image.product_draft_id
     AND membership.product_draft_image_id = image.id
    WHERE image.id = result_entry.image_id
      AND image.product_draft_id = p_product_id
      AND image.source_kind = 'seller_upload'
    FOR UPDATE OF image;
    IF NOT FOUND THEN RETURN jsonb_build_object('result', 'image_not_found'); END IF;
    IF selected_image.status <> 'pending' THEN CONTINUE; END IF;
    IF result_entry.outcome = 'available' THEN
      IF result_entry.content_type IS DISTINCT FROM selected_image.content_type
        OR result_entry.size_bytes IS DISTINCT FROM selected_image.size_bytes
      THEN
        RAISE EXCEPTION 'product_draft_image_verification_failed' USING ERRCODE = '22023';
      END IF;
      UPDATE public.product_draft_images SET status = 'available', lifecycle_error_code = NULL
      WHERE id = selected_image.id;
    ELSIF result_entry.outcome = 'failed' AND result_entry.error_code IN (
      'product_draft_image_object_missing', 'product_draft_image_verification_failed',
      'product_draft_image_upload_cleanup_failed'
    ) THEN
      UPDATE public.product_draft_images SET status = 'failed',
        lifecycle_error_code = result_entry.error_code WHERE id = selected_image.id;
    ELSE
      RAISE EXCEPTION 'product_draft_image_upload_invalid' USING ERRCODE = '22023';
    END IF;
    changed := true;
  END LOOP;
  IF changed THEN
    selected_copy := public.refresh_product_moderation_working_image_snapshot(p_product_id, true);
  END IF;
  RETURN jsonb_build_object(
    'result', 'finalized',
    'galleryRevision', selected_copy.revision,
    'moderationRevision', selected_copy.revision
  );
END;
$$;

CREATE FUNCTION public.complete_product_moderation_working_image_upload_cleanup(
  p_product_id uuid,
  p_seller_id uuid,
  p_expected_revision bigint,
  p_image_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  selected_image public.product_draft_images%ROWTYPE;
BEGIN
  selected_copy := public.assert_product_moderation_working_revision(
    p_product_id, p_seller_id, p_expected_revision
  );
  SELECT image.* INTO selected_image
  FROM public.product_draft_images AS image
  JOIN public.product_moderation_working_copy_images AS membership
    ON membership.product_id = image.product_draft_id
   AND membership.product_draft_image_id = image.id
  WHERE image.product_draft_id = p_product_id
    AND image.id = p_image_id
    AND image.source_kind = 'seller_upload'
  FOR UPDATE OF image;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'image_not_found');
  END IF;
  IF selected_image.status <> 'failed'
    OR selected_image.lifecycle_error_code <>
      'product_draft_image_upload_cleanup_failed'
  THEN
    RETURN jsonb_build_object(
      'result', 'noop',
      'galleryRevision', selected_copy.revision,
      'moderationRevision', selected_copy.revision
    );
  END IF;
  PERFORM public.product_moderation_registry_add(
    'bazoria.product_moderation_working_image_ids', p_product_id
  );
  UPDATE public.product_draft_images AS image
  SET lifecycle_error_code = 'product_draft_image_verification_failed'
  WHERE image.id = selected_image.id;
  selected_copy := public.refresh_product_moderation_working_image_snapshot(
    p_product_id, true
  );
  RETURN jsonb_build_object(
    'result', 'cleanup_completed',
    'galleryRevision', selected_copy.revision,
    'moderationRevision', selected_copy.revision
  );
END;
$$;

CREATE FUNCTION public.fail_product_moderation_working_image_upload_cleanup(
  p_product_id uuid,
  p_seller_id uuid,
  p_expected_revision bigint,
  p_image_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_copy public.product_moderation_working_copies%ROWTYPE;
BEGIN
  selected_copy := public.assert_product_moderation_working_revision(
    p_product_id, p_seller_id, p_expected_revision
  );
  PERFORM public.product_moderation_registry_add(
    'bazoria.product_moderation_working_image_ids', p_product_id
  );
  UPDATE public.product_draft_images AS image
  SET lifecycle_error_code = 'product_draft_image_upload_cleanup_failed'
  WHERE image.product_draft_id = p_product_id
    AND image.id = p_image_id
    AND image.source_kind = 'seller_upload'
    AND image.status = 'failed';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'image_not_found');
  END IF;
  selected_copy := public.refresh_product_moderation_working_image_snapshot(
    p_product_id, true
  );
  RETURN jsonb_build_object(
    'result', 'cleanup_failed',
    'galleryRevision', selected_copy.revision,
    'moderationRevision', selected_copy.revision
  );
END;
$$;

CREATE FUNCTION public.update_product_moderation_working_gallery(
  p_product_id uuid,
  p_seller_id uuid,
  p_expected_revision bigint,
  p_ordered_available_image_ids uuid[],
  p_cover_image_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  current_order uuid[];
  current_cover uuid;
  requested_count integer;
BEGIN
  selected_copy := public.assert_product_moderation_working_revision(
    p_product_id, p_seller_id, p_expected_revision
  );
  requested_count := COALESCE(cardinality(p_ordered_available_image_ids), 0);
  SELECT array_agg(membership.product_draft_image_id ORDER BY membership.position),
    (min(membership.product_draft_image_id::text) FILTER (WHERE membership.is_cover))::uuid
  INTO current_order, current_cover
  FROM public.product_moderation_working_copy_images AS membership
  WHERE membership.product_id = p_product_id;
  IF requested_count < 1 OR p_cover_image_id IS NULL
    OR NOT p_cover_image_id = ANY(p_ordered_available_image_ids)
    OR requested_count <> (SELECT count(DISTINCT image_id) FROM unnest(p_ordered_available_image_ids) AS image_id)
    OR requested_count <> COALESCE(cardinality(current_order), 0)
    OR EXISTS (
      SELECT 1 FROM unnest(p_ordered_available_image_ids) AS requested(image_id)
      LEFT JOIN public.product_moderation_working_copy_images AS membership
        ON membership.product_id = p_product_id
       AND membership.product_draft_image_id = requested.image_id
      LEFT JOIN public.product_draft_images AS image
        ON image.product_draft_id = membership.product_id
       AND image.id = membership.product_draft_image_id
      WHERE membership.product_draft_image_id IS NULL OR image.status <> 'available'
    )
  THEN
    RAISE EXCEPTION 'product_draft_image_upload_invalid' USING ERRCODE = '22023';
  END IF;
  IF current_order = p_ordered_available_image_ids AND current_cover = p_cover_image_id THEN
    RETURN jsonb_build_object('result', 'unchanged',
      'galleryRevision', selected_copy.revision, 'moderationRevision', selected_copy.revision);
  END IF;
  UPDATE public.product_moderation_working_copy_images AS membership
  SET position = position + 1000
  WHERE membership.product_id = p_product_id;
  UPDATE public.product_moderation_working_copy_images AS membership
  SET position = array_position(p_ordered_available_image_ids, membership.product_draft_image_id) - 1,
      is_cover = membership.product_draft_image_id = p_cover_image_id
  WHERE membership.product_id = p_product_id;
  selected_copy := public.refresh_product_moderation_working_image_snapshot(p_product_id, true);
  RETURN jsonb_build_object('result', 'updated',
    'galleryRevision', selected_copy.revision, 'moderationRevision', selected_copy.revision);
END;
$$;

CREATE FUNCTION public.begin_product_moderation_working_image_removal(
  p_product_id uuid,
  p_seller_id uuid,
  p_expected_revision bigint,
  p_image_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  selected_image public.product_draft_images%ROWTYPE;
  referenced boolean;
  replacement_cover uuid;
BEGIN
  selected_copy := public.assert_product_moderation_working_revision(
    p_product_id, p_seller_id, p_expected_revision
  );
  SELECT image.* INTO selected_image
  FROM public.product_draft_images AS image
  JOIN public.product_moderation_working_copy_images AS membership
    ON membership.product_id = image.product_draft_id
   AND membership.product_draft_image_id = image.id
  WHERE image.product_draft_id = p_product_id AND image.id = p_image_id
  FOR UPDATE OF image;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'image_not_found'); END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.product_moderation_submission_images AS membership
    WHERE membership.product_id = p_product_id
      AND membership.product_draft_image_id = p_image_id
  ) INTO referenced;
  DELETE FROM public.product_moderation_working_copy_images AS membership
  WHERE membership.product_id = p_product_id
    AND membership.product_draft_image_id = p_image_id;
  UPDATE public.product_moderation_working_copy_images AS membership
  SET position = normalized.position
  FROM (
    SELECT product_draft_image_id,
      (row_number() OVER (ORDER BY position) - 1)::integer AS position
    FROM public.product_moderation_working_copy_images
    WHERE product_id = p_product_id
  ) AS normalized
  WHERE membership.product_id = p_product_id
    AND membership.product_draft_image_id = normalized.product_draft_image_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.product_moderation_working_copy_images AS membership
    WHERE membership.product_id = p_product_id AND membership.is_cover
  ) THEN
    SELECT membership.product_draft_image_id INTO replacement_cover
    FROM public.product_moderation_working_copy_images AS membership
    WHERE membership.product_id = p_product_id
    ORDER BY membership.position LIMIT 1;
    UPDATE public.product_moderation_working_copy_images AS membership
    SET is_cover = true
    WHERE membership.product_id = p_product_id
      AND membership.product_draft_image_id = replacement_cover;
  END IF;

  IF NOT referenced AND selected_image.source_kind = 'seller_upload' THEN
    PERFORM public.product_moderation_registry_add(
      'bazoria.product_moderation_working_image_ids', p_product_id
    );
    UPDATE public.product_draft_images AS image
    SET status = 'deleting', lifecycle_error_code = NULL
    WHERE image.id = selected_image.id;
  END IF;
  selected_copy := public.refresh_product_moderation_working_image_snapshot(p_product_id, true);
  IF referenced OR selected_image.source_kind <> 'seller_upload' THEN
    RETURN jsonb_build_object('result', 'removed',
      'galleryRevision', selected_copy.revision, 'moderationRevision', selected_copy.revision);
  END IF;
  RETURN jsonb_build_object('result', 'cleanup_required',
    'galleryRevision', selected_copy.revision, 'moderationRevision', selected_copy.revision,
    'destinationKey', selected_image.destination_key);
END;
$$;

CREATE FUNCTION public.complete_product_moderation_working_image_removal(
  p_product_id uuid, p_seller_id uuid, p_expected_revision bigint, p_image_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE selected_copy public.product_moderation_working_copies%ROWTYPE;
BEGIN
  selected_copy := public.assert_product_moderation_working_revision(
    p_product_id, p_seller_id, p_expected_revision
  );
  PERFORM public.product_moderation_registry_add(
    'bazoria.product_moderation_working_image_ids', p_product_id
  );
  DELETE FROM public.product_draft_images AS image
  WHERE image.product_draft_id = p_product_id AND image.id = p_image_id
    AND image.source_kind = 'seller_upload' AND image.status = 'deleting'
    AND NOT EXISTS (
      SELECT 1 FROM public.product_moderation_submission_images AS membership
      WHERE membership.product_id = p_product_id
        AND membership.product_draft_image_id = image.id
    );
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'image_not_found'); END IF;
  RETURN jsonb_build_object('result', 'removed',
    'galleryRevision', selected_copy.revision, 'moderationRevision', selected_copy.revision);
END;
$$;

CREATE FUNCTION public.fail_product_moderation_working_image_removal(
  p_product_id uuid, p_seller_id uuid, p_expected_revision bigint, p_image_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE selected_copy public.product_moderation_working_copies%ROWTYPE;
BEGIN
  selected_copy := public.assert_product_moderation_working_revision(
    p_product_id, p_seller_id, p_expected_revision
  );
  PERFORM public.product_moderation_registry_add(
    'bazoria.product_moderation_working_image_ids', p_product_id
  );
  UPDATE public.product_draft_images AS image
  SET lifecycle_error_code = 'product_draft_image_delete_failed'
  WHERE image.product_draft_id = p_product_id AND image.id = p_image_id
    AND image.source_kind = 'seller_upload' AND image.status = 'deleting';
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'image_not_found'); END IF;
  RETURN jsonb_build_object('result', 'cleanup_failed',
    'galleryRevision', selected_copy.revision, 'moderationRevision', selected_copy.revision);
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_initial_product_draft_image_uploads(
  p_product_draft_id uuid, p_seller_id uuid, p_expected_moderation_revision bigint,
  p_expected_gallery_revision bigint, p_files jsonb,
  p_verified_absent_image_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE selected_status public.product_status; operation_result jsonb; resulting_revision bigint;
BEGIN
  SELECT status INTO selected_status FROM public.products
  WHERE id = p_product_draft_id AND seller_id = p_seller_id;
  IF selected_status IN ('published', 'archived') THEN
    IF p_expected_gallery_revision IS DISTINCT FROM p_expected_moderation_revision THEN
      RETURN jsonb_build_object('result', 'stale');
    END IF;
    RETURN public.prepare_product_moderation_working_image_uploads(
      p_product_draft_id, p_seller_id, p_expected_moderation_revision,
      p_files, p_verified_absent_image_ids
    );
  END IF;
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id, p_seller_id, p_expected_moderation_revision
  );
  operation_result := public.prepare_seller_product_draft_image_uploads(
    p_product_draft_id, p_seller_id, p_expected_gallery_revision,
    p_files, p_verified_absent_image_ids
  );
  SELECT moderation_revision INTO resulting_revision FROM public.products
  WHERE id = p_product_draft_id;
  RETURN operation_result || jsonb_build_object('moderationRevision', resulting_revision);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_initial_product_draft_image_uploads(
  p_product_draft_id uuid, p_seller_id uuid, p_expected_moderation_revision bigint,
  p_results jsonb
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE selected_status public.product_status; operation_result jsonb; resulting_revision bigint;
BEGIN
  SELECT status INTO selected_status FROM public.products
  WHERE id = p_product_draft_id AND seller_id = p_seller_id;
  IF selected_status IN ('published', 'archived') THEN
    RETURN public.finalize_product_moderation_working_image_uploads(
      p_product_draft_id, p_seller_id, p_expected_moderation_revision, p_results
    );
  END IF;
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id, p_seller_id, p_expected_moderation_revision
  );
  operation_result := public.finalize_seller_product_draft_image_uploads(
    p_product_draft_id, p_seller_id, p_results
  );
  SELECT moderation_revision INTO resulting_revision FROM public.products WHERE id = p_product_draft_id;
  RETURN operation_result || jsonb_build_object('moderationRevision', resulting_revision);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_initial_product_draft_image_upload_cleanup(
  p_product_draft_id uuid, p_seller_id uuid, p_expected_moderation_revision bigint,
  p_product_draft_image_id uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE selected_status public.product_status; operation_result jsonb; resulting_revision bigint;
BEGIN
  SELECT status INTO selected_status FROM public.products
  WHERE id = p_product_draft_id AND seller_id = p_seller_id;
  IF selected_status IN ('published', 'archived') THEN
    RETURN public.complete_product_moderation_working_image_upload_cleanup(
      p_product_draft_id, p_seller_id, p_expected_moderation_revision,
      p_product_draft_image_id
    );
  END IF;
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id, p_seller_id, p_expected_moderation_revision
  );
  operation_result := public.complete_seller_product_draft_image_upload_cleanup(
    p_product_draft_id, p_seller_id, p_product_draft_image_id
  );
  SELECT moderation_revision INTO resulting_revision FROM public.products
  WHERE id = p_product_draft_id;
  RETURN operation_result || jsonb_build_object('moderationRevision', resulting_revision);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_initial_product_draft_image_upload_cleanup(
  p_product_draft_id uuid, p_seller_id uuid, p_expected_moderation_revision bigint,
  p_product_draft_image_id uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE selected_status public.product_status; operation_result jsonb; resulting_revision bigint;
BEGIN
  SELECT status INTO selected_status FROM public.products
  WHERE id = p_product_draft_id AND seller_id = p_seller_id;
  IF selected_status IN ('published', 'archived') THEN
    RETURN public.fail_product_moderation_working_image_upload_cleanup(
      p_product_draft_id, p_seller_id, p_expected_moderation_revision,
      p_product_draft_image_id
    );
  END IF;
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id, p_seller_id, p_expected_moderation_revision
  );
  operation_result := public.fail_seller_product_draft_image_upload_cleanup(
    p_product_draft_id, p_seller_id, p_product_draft_image_id
  );
  SELECT moderation_revision INTO resulting_revision FROM public.products
  WHERE id = p_product_draft_id;
  RETURN operation_result || jsonb_build_object('moderationRevision', resulting_revision);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_initial_product_draft_image_gallery(
  p_product_draft_id uuid, p_seller_id uuid, p_expected_moderation_revision bigint,
  p_expected_gallery_revision bigint, p_ordered_available_image_ids uuid[],
  p_cover_image_id uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE selected_status public.product_status; operation_result jsonb; resulting_revision bigint;
BEGIN
  SELECT status INTO selected_status FROM public.products
  WHERE id = p_product_draft_id AND seller_id = p_seller_id;
  IF selected_status IN ('published', 'archived') THEN
    IF p_expected_gallery_revision IS DISTINCT FROM p_expected_moderation_revision THEN
      RETURN jsonb_build_object('result', 'stale');
    END IF;
    RETURN public.update_product_moderation_working_gallery(
      p_product_draft_id, p_seller_id, p_expected_moderation_revision,
      p_ordered_available_image_ids, p_cover_image_id
    );
  END IF;
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id, p_seller_id, p_expected_moderation_revision
  );
  operation_result := public.update_seller_product_draft_image_gallery(
    p_product_draft_id, p_seller_id, p_expected_gallery_revision,
    p_ordered_available_image_ids, p_cover_image_id
  );
  SELECT moderation_revision INTO resulting_revision FROM public.products WHERE id = p_product_draft_id;
  RETURN operation_result || jsonb_build_object('moderationRevision', resulting_revision);
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_initial_product_draft_image_removal(
  p_product_draft_id uuid, p_seller_id uuid, p_expected_moderation_revision bigint,
  p_product_draft_image_id uuid, p_expected_gallery_revision bigint
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE selected_status public.product_status; operation_result jsonb; resulting_revision bigint;
BEGIN
  SELECT status INTO selected_status FROM public.products
  WHERE id = p_product_draft_id AND seller_id = p_seller_id;
  IF selected_status IN ('published', 'archived') THEN
    IF p_expected_gallery_revision IS DISTINCT FROM p_expected_moderation_revision THEN
      RETURN jsonb_build_object('result', 'stale');
    END IF;
    RETURN public.begin_product_moderation_working_image_removal(
      p_product_draft_id, p_seller_id, p_expected_moderation_revision,
      p_product_draft_image_id
    );
  END IF;
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id, p_seller_id, p_expected_moderation_revision
  );
  operation_result := public.begin_seller_product_draft_image_removal(
    p_product_draft_id, p_seller_id, p_product_draft_image_id, p_expected_gallery_revision
  );
  SELECT moderation_revision INTO resulting_revision FROM public.products WHERE id = p_product_draft_id;
  RETURN operation_result || jsonb_build_object('moderationRevision', resulting_revision);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_initial_product_draft_image_removal(
  p_product_draft_id uuid, p_seller_id uuid, p_expected_moderation_revision bigint,
  p_product_draft_image_id uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE selected_status public.product_status; operation_result jsonb; resulting_revision bigint;
BEGIN
  SELECT status INTO selected_status FROM public.products
  WHERE id = p_product_draft_id AND seller_id = p_seller_id;
  IF selected_status IN ('published', 'archived') THEN
    RETURN public.complete_product_moderation_working_image_removal(
      p_product_draft_id, p_seller_id, p_expected_moderation_revision,
      p_product_draft_image_id
    );
  END IF;
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id, p_seller_id, p_expected_moderation_revision
  );
  operation_result := public.complete_seller_product_draft_image_removal(
    p_product_draft_id, p_seller_id, p_product_draft_image_id
  );
  SELECT moderation_revision INTO resulting_revision FROM public.products WHERE id = p_product_draft_id;
  RETURN operation_result || jsonb_build_object('moderationRevision', resulting_revision);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_initial_product_draft_image_removal(
  p_product_draft_id uuid, p_seller_id uuid, p_expected_moderation_revision bigint,
  p_product_draft_image_id uuid
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE selected_status public.product_status; operation_result jsonb; resulting_revision bigint;
BEGIN
  SELECT status INTO selected_status FROM public.products
  WHERE id = p_product_draft_id AND seller_id = p_seller_id;
  IF selected_status IN ('published', 'archived') THEN
    RETURN public.fail_product_moderation_working_image_removal(
      p_product_draft_id, p_seller_id, p_expected_moderation_revision,
      p_product_draft_image_id
    );
  END IF;
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id, p_seller_id, p_expected_moderation_revision
  );
  operation_result := public.fail_seller_product_draft_image_removal(
    p_product_draft_id, p_seller_id, p_product_draft_image_id
  );
  SELECT moderation_revision INTO resulting_revision FROM public.products WHERE id = p_product_draft_id;
  RETURN operation_result || jsonb_build_object('moderationRevision', resulting_revision);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_product_moderation_working_image_snapshot(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_product_moderation_private_image_mutation()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_product_moderation_working_image_uploads(
  uuid, uuid, bigint, jsonb, uuid[]
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_product_moderation_working_image_uploads(
  uuid, uuid, bigint, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_product_moderation_working_image_upload_cleanup(
  uuid, uuid, bigint, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_product_moderation_working_image_upload_cleanup(
  uuid, uuid, bigint, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_product_moderation_working_gallery(
  uuid, uuid, bigint, uuid[], uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_product_moderation_working_image_removal(
  uuid, uuid, bigint, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_product_moderation_working_image_removal(
  uuid, uuid, bigint, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_product_moderation_working_image_removal(
  uuid, uuid, bigint, uuid
) FROM PUBLIC, anon, authenticated;

COMMIT;
