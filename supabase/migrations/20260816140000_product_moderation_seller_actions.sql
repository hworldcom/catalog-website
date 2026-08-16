BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_product_moderation_working_copy(
  p_product_id uuid,
  p_seller_id uuid
)
RETURNS SETOF public.product_moderation_working_copies
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  approved_submission public.product_moderation_submissions%ROWTYPE;
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  next_revision bigint;
  initial_snapshot jsonb;
BEGIN
  IF p_product_id IS NULL OR p_seller_id IS NULL THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id AND product.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF selected_product.status NOT IN ('published', 'archived')
    OR selected_product.approved_moderation_submission_id IS NULL
  THEN
    RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
  END IF;

  SELECT working_copy.* INTO selected_copy
  FROM public.product_moderation_working_copies AS working_copy
  WHERE working_copy.product_id = selected_product.id
  FOR UPDATE;
  IF FOUND THEN
    RETURN NEXT selected_copy;
    RETURN;
  END IF;

  IF selected_product.status = 'archived'
    AND NOT public.product_moderation_registry_contains(
      'bazoria.product_moderation_restore_ids',
      selected_product.id
    )
  THEN
    RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
  END IF;
  IF selected_product.active_moderation_submission_id IS NOT NULL THEN
    RAISE EXCEPTION 'product_moderation_submission_conflict' USING ERRCODE = '55000';
  END IF;

  SELECT submission.* INTO approved_submission
  FROM public.product_moderation_submissions AS submission
  WHERE submission.id = selected_product.approved_moderation_submission_id
    AND submission.product_id = selected_product.id
    AND submission.seller_id = selected_product.seller_id
    AND submission.review_status = 'approved'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(max(submission.revision), 0) + 1
  INTO next_revision
  FROM public.product_moderation_submissions AS submission
  WHERE submission.product_id = selected_product.id;

  initial_snapshot := jsonb_set(
    approved_submission.snapshot_json,
    '{productCode}',
    COALESCE(to_jsonb(selected_product.product_code), 'null'::jsonb),
    true
  );
  INSERT INTO public.product_moderation_working_copies (
    product_id, seller_id, revision, snapshot_schema_version, snapshot_json
  ) VALUES (
    selected_product.id,
    selected_product.seller_id,
    next_revision,
    approved_submission.snapshot_schema_version,
    initial_snapshot
  ) RETURNING * INTO selected_copy;

  INSERT INTO public.product_moderation_working_copy_images (
    product_id, product_draft_image_id, position, is_cover
  )
  SELECT selected_product.id, image.product_draft_image_id, image.position, image.is_cover
  FROM public.product_moderation_submission_images AS image
  WHERE image.submission_id = approved_submission.id
  ORDER BY image.position;

  RETURN NEXT selected_copy;
END;
$$;

ALTER FUNCTION public.restore_seller_product_for_moderation(
  uuid, bigint, uuid, uuid, uuid
) RENAME TO restore_seller_product_for_moderation_0040d3a_legacy;

CREATE FUNCTION public.restore_seller_product_for_moderation(
  p_product_id uuid,
  p_expected_moderation_revision bigint,
  p_request_id uuid,
  p_seller_id uuid,
  p_actor_user_id uuid
)
RETURNS TABLE (
  result text,
  product_id uuid,
  product_status public.product_status,
  moderation_revision bigint,
  restoration_draft boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_product_id IS NOT NULL THEN
    PERFORM public.product_moderation_registry_add(
      'bazoria.product_moderation_restore_ids',
      p_product_id
    );
  END IF;

  RETURN QUERY
  SELECT restored.*
  FROM public.restore_seller_product_for_moderation_0040d3a_legacy(
    p_product_id,
    p_expected_moderation_revision,
    p_request_id,
    p_seller_id,
    p_actor_user_id
  ) AS restored;
END;
$$;

CREATE FUNCTION public.begin_product_moderation_editing(
  p_product_id uuid,
  p_seller_id uuid
)
RETURNS TABLE (
  product_id uuid,
  moderation_revision bigint,
  edit_source text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_copy public.product_moderation_working_copies%ROWTYPE;
BEGIN
  IF p_product_id IS NULL OR p_seller_id IS NULL THEN
    RAISE EXCEPTION 'product_moderation_edit_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id AND product.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT working_copy.* INTO selected_copy
  FROM public.product_moderation_working_copies AS working_copy
  WHERE working_copy.product_id = selected_product.id
  FOR UPDATE;

  IF selected_product.active_moderation_submission_id IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public.product_image_publication_runs AS run
      WHERE run.product_id = selected_product.id
        AND run.status IN ('pending', 'running', 'failed', 'cleanup_required')
    )
  THEN
    RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
  END IF;

  IF selected_product.status = 'draft'
    AND selected_product.approved_moderation_submission_id IS NULL
  THEN
    RETURN QUERY SELECT
      selected_product.id,
      selected_product.moderation_revision,
      'initial_draft'::text;
    RETURN;
  END IF;

  IF selected_product.status NOT IN ('published', 'archived')
    OR selected_product.approved_moderation_submission_id IS NULL
  THEN
    RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
  END IF;

  IF selected_copy.product_id IS NULL THEN
    IF selected_product.status = 'archived' THEN
      RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
    END IF;

    SELECT working_copy.* INTO selected_copy
    FROM public.ensure_product_moderation_working_copy(
      selected_product.id,
      selected_product.seller_id
    ) AS working_copy;
  END IF;

  RETURN QUERY SELECT
    selected_product.id,
    selected_copy.revision,
    'working_copy'::text;
END;
$$;

CREATE FUNCTION public.read_product_moderation_action_identity(
  p_product_id uuid,
  p_seller_id uuid,
  p_submission_id uuid DEFAULT NULL,
  p_run_id uuid DEFAULT NULL
)
RETURNS TABLE (
  product_owned boolean,
  submission_owned boolean,
  run_owned boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH owned_product AS (
    SELECT product.id, product.seller_id
    FROM public.products AS product
    WHERE product.id = p_product_id
      AND product.seller_id = p_seller_id
  )
  SELECT
    EXISTS (SELECT 1 FROM owned_product),
    p_submission_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.product_moderation_submissions AS submission
      JOIN owned_product AS product
        ON product.id = submission.product_id
       AND product.seller_id = submission.seller_id
      WHERE submission.id = p_submission_id
    ),
    p_run_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.product_image_publication_runs AS run
      JOIN owned_product AS product
        ON product.id = run.product_id
       AND product.seller_id = run.seller_id
      WHERE run.id = p_run_id
    );
$$;

REVOKE ALL ON FUNCTION public.ensure_product_moderation_working_copy(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_seller_product_for_moderation_0040d3a_legacy(
  uuid, bigint, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.restore_seller_product_for_moderation(
  uuid, bigint, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_product_moderation_editing(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_product_moderation_action_identity(
  uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ensure_product_moderation_working_copy(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_seller_product_for_moderation(
  uuid, bigint, uuid, uuid, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_product_moderation_editing(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.read_product_moderation_action_identity(
  uuid, uuid, uuid, uuid
) TO service_role;

COMMIT;
