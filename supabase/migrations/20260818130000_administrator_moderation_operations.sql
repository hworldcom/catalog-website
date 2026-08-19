BEGIN;

CREATE OR REPLACE FUNCTION public.decide_product_moderation_submission(
  p_submission_id uuid,
  p_expected_revision bigint,
  p_decision text,
  p_reason text,
  p_decision_request_id uuid,
  p_administrator_user_id uuid
)
RETURNS TABLE (
  result text,
  submission_id uuid,
  product_id uuid,
  seller_id uuid,
  review_status text,
  revision bigint,
  activation_run_id uuid,
  dispatch_generation integer,
  dispatch_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  submission_identity record;
  selected_submission public.product_moderation_submissions%ROWTYPE;
  selected_product public.products%ROWTYPE;
  selected_seller public.sellers%ROWTYPE;
  selected_working_copy public.product_moderation_working_copies%ROWTYPE;
  replay_event public.product_moderation_events%ROWTYPE;
  selected_run public.product_image_publication_runs%ROWTYPE;
  normalized_reason text;
  event_type text;
  resulting_status text;
  calculated_hash text;
  image_count integer;
  cover_count integer;
BEGIN
  normalized_reason := NULLIF(btrim(regexp_replace(COALESCE(p_reason, ''), '[[:space:]]+', ' ', 'g')), '');
  IF p_submission_id IS NULL
    OR p_expected_revision IS NULL OR p_expected_revision < 1
    OR p_decision NOT IN ('approve', 'request_changes', 'reject')
    OR p_decision_request_id IS NULL
    OR p_administrator_user_id IS NULL
    OR (p_decision = 'approve' AND normalized_reason IS NOT NULL)
    OR (p_decision IN ('request_changes', 'reject')
      AND (normalized_reason IS NULL OR char_length(normalized_reason) > 1000))
  THEN
    RAISE EXCEPTION 'product_moderation_decision_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT submission.product_id, submission.seller_id
  INTO submission_identity
  FROM public.product_moderation_submissions AS submission
  WHERE submission.id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT seller.* INTO selected_seller
  FROM public.sellers AS seller
  WHERE seller.id = submission_identity.seller_id
  FOR UPDATE;
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = submission_identity.product_id
    AND product.seller_id = submission_identity.seller_id
  FOR UPDATE;
  SELECT submission.* INTO selected_submission
  FROM public.product_moderation_submissions AS submission
  WHERE submission.id = p_submission_id
    AND submission.product_id = selected_product.id
    AND submission.seller_id = selected_seller.id
  FOR UPDATE;

  event_type := CASE p_decision
    WHEN 'approve' THEN 'approved'
    WHEN 'request_changes' THEN 'changes_requested'
    ELSE 'rejected'
  END;
  resulting_status := CASE p_decision
    WHEN 'approve' THEN 'approved'
    WHEN 'request_changes' THEN 'changes_requested'
    ELSE 'rejected'
  END;

  SELECT event.* INTO replay_event
  FROM public.product_moderation_events AS event
  WHERE event.product_id = selected_product.id
    AND event.request_id = p_decision_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF replay_event.submission_id IS DISTINCT FROM selected_submission.id
      OR replay_event.event_type IS DISTINCT FROM event_type
      OR replay_event.expected_revision IS DISTINCT FROM p_expected_revision
      OR replay_event.actor_user_id IS DISTINCT FROM p_administrator_user_id
      OR NULLIF(btrim(COALESCE(replay_event.reason, '')), '')
        IS DISTINCT FROM normalized_reason
    THEN
      RAISE EXCEPTION 'product_moderation_decision_conflict' USING ERRCODE = '23505';
    END IF;
    SELECT run.* INTO selected_run
    FROM public.product_image_publication_runs AS run
    WHERE run.moderation_submission_id = selected_submission.id;
    IF p_decision = 'approve' AND (
      selected_run.id IS NULL
      OR selected_run.snapshot_hash IS DISTINCT FROM encode(
        extensions.digest(
          convert_to(selected_submission.snapshot_json::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      )
      OR selected_run.expected_submission_revision IS DISTINCT FROM selected_submission.revision
    ) THEN
      RAISE EXCEPTION 'product_moderation_submission_stale' USING ERRCODE = '55000';
    END IF;
    RETURN QUERY SELECT
      'replay'::text,
      selected_submission.id,
      selected_submission.product_id,
      selected_submission.seller_id,
      selected_submission.review_status,
      selected_submission.revision,
      selected_run.id,
      selected_run.dispatch_generation,
      selected_run.id IS NOT NULL AND selected_run.dispatch_status = 'pending';
    RETURN;
  END IF;

  IF selected_seller.approved_profile_submission_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.seller_profile_submissions AS approval
      WHERE approval.id = selected_seller.approved_profile_submission_id
        AND approval.seller_id = selected_seller.id
        AND approval.status = 'approved'
    )
  THEN
    RAISE EXCEPTION 'product_moderation_seller_approval_required' USING ERRCODE = '55000';
  END IF;
  IF selected_product.active_moderation_submission_id IS DISTINCT FROM selected_submission.id
    OR selected_submission.review_status <> 'pending'
  THEN
    RAISE EXCEPTION 'product_moderation_submission_stale' USING ERRCODE = '55000';
  END IF;
  IF selected_submission.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'product_moderation_revision_conflict' USING ERRCODE = '40001';
  END IF;

  IF selected_submission.submission_kind = 'initial_publication' THEN
    IF selected_product.status <> 'draft'
      OR selected_product.approved_moderation_submission_id IS NOT NULL
      OR selected_product.moderation_revision <> p_expected_revision
    THEN
      RAISE EXCEPTION 'product_moderation_revision_conflict' USING ERRCODE = '40001';
    END IF;
  ELSE
    SELECT working_copy.* INTO selected_working_copy
    FROM public.product_moderation_working_copies AS working_copy
    WHERE working_copy.product_id = selected_product.id
    FOR UPDATE;
    IF NOT FOUND
      OR selected_product.status NOT IN ('published', 'archived')
      OR selected_product.approved_moderation_submission_id IS NULL
      OR selected_working_copy.revision <> p_expected_revision
    THEN
      RAISE EXCEPTION 'product_moderation_revision_conflict' USING ERRCODE = '40001';
    END IF;
  END IF;

  IF selected_submission.snapshot_schema_version <> 1
    OR selected_submission.snapshot_json ->> 'productId' IS DISTINCT FROM selected_product.id::text
    OR selected_submission.snapshot_json ->> 'sellerId' IS DISTINCT FROM selected_seller.id::text
    OR COALESCE(btrim(selected_submission.snapshot_json ->> 'title'), '') = ''
    OR char_length(selected_submission.snapshot_json ->> 'title') > 50
    OR selected_submission.snapshot_json ->> 'titleSource' NOT IN ('human', 'model')
    OR selected_submission.snapshot_json ->> 'categoryId' IS NULL
    OR jsonb_typeof(selected_submission.snapshot_json -> 'audiences') <> 'array'
    OR jsonb_array_length(selected_submission.snapshot_json -> 'audiences') < 1
  THEN
    RAISE EXCEPTION 'product_moderation_submission_stale' USING ERRCODE = '23514';
  END IF;
  PERFORM public.validate_product_moderation_submission_images(selected_submission.id);

  SELECT count(*)::integer, count(*) FILTER (WHERE membership.is_cover)::integer
  INTO image_count, cover_count
  FROM public.product_moderation_submission_images AS membership
  JOIN public.product_draft_images AS image
    ON image.product_draft_id = membership.product_id
   AND image.id = membership.product_draft_image_id
  WHERE membership.submission_id = selected_submission.id
    AND image.status = 'available'
    AND image.storage_bucket = 'product-draft-images'
    AND image.size_bytes > 0
    AND image.content_type IN ('image/jpeg', 'image/png', 'image/webp');
  IF image_count <> jsonb_array_length(selected_submission.snapshot_json -> 'imageIds')
    OR image_count < 1 OR cover_count <> 1
  THEN
    RAISE EXCEPTION 'product_moderation_images_not_ready' USING ERRCODE = '55000';
  END IF;

  UPDATE public.product_moderation_submissions AS submission
  SET
    review_status = resulting_status,
    administrator_user_id = p_administrator_user_id,
    decision_request_id = p_decision_request_id,
    seller_visible_reason = normalized_reason,
    decided_at = now()
  WHERE submission.id = selected_submission.id
  RETURNING * INTO selected_submission;

  INSERT INTO public.product_moderation_events (
    product_id, seller_id, submission_id, event_type, actor_user_id,
    expected_revision, reason, request_id
  ) VALUES (
    selected_submission.product_id, selected_submission.seller_id,
    selected_submission.id, event_type, p_administrator_user_id,
    p_expected_revision, normalized_reason, p_decision_request_id
  );

  IF p_decision = 'approve' THEN
    calculated_hash := encode(
      extensions.digest(
        convert_to(selected_submission.snapshot_json::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    );
    INSERT INTO public.product_image_publication_runs (
      moderation_submission_id, product_id, seller_id, snapshot_hash,
      expected_submission_revision
    ) VALUES (
      selected_submission.id, selected_submission.product_id,
      selected_submission.seller_id, calculated_hash, selected_submission.revision
    )
    ON CONFLICT (moderation_submission_id) DO NOTHING;
    SELECT run.* INTO selected_run
    FROM public.product_image_publication_runs AS run
    WHERE run.moderation_submission_id = selected_submission.id;
    IF selected_run.snapshot_hash IS DISTINCT FROM calculated_hash
      OR selected_run.product_id IS DISTINCT FROM selected_submission.product_id
      OR selected_run.seller_id IS DISTINCT FROM selected_submission.seller_id
      OR selected_run.expected_submission_revision IS DISTINCT FROM selected_submission.revision
    THEN
      RAISE EXCEPTION 'product_moderation_decision_conflict' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.product_image_publication_items (
      run_id, moderation_submission_id, product_id, product_draft_image_id,
      source_bucket, source_object_key, destination_key, source_position,
      publication_order, is_cover, expected_source_size_bytes,
      expected_content_type
    )
    SELECT
      selected_run.id,
      selected_submission.id,
      selected_submission.product_id,
      membership.product_draft_image_id,
      image.storage_bucket,
      image.destination_key,
      'published-products/' || selected_submission.product_id::text || '/'
        || selected_run.id::text || '/' || membership.product_draft_image_id::text
        || CASE image.content_type
          WHEN 'image/png' THEN '.png'
          WHEN 'image/webp' THEN '.webp'
          ELSE '.jpg'
        END,
      image.source_position,
      membership.position,
      membership.is_cover,
      image.size_bytes,
      image.content_type
    FROM public.product_moderation_submission_images AS membership
    JOIN public.product_draft_images AS image
      ON image.product_draft_id = membership.product_id
     AND image.id = membership.product_draft_image_id
    WHERE membership.submission_id = selected_submission.id
    ORDER BY membership.position
    ON CONFLICT (run_id, product_draft_image_id) DO NOTHING;
  ELSE
    UPDATE public.products AS product
    SET active_moderation_submission_id = NULL,
        moderation_revision = CASE
          WHEN selected_submission.submission_kind = 'initial_publication'
            THEN product.moderation_revision + 1
          ELSE product.moderation_revision
        END
    WHERE product.id = selected_product.id;
    IF selected_submission.submission_kind = 'update' THEN
      UPDATE public.product_moderation_working_copies AS working_copy
      SET revision = working_copy.revision + 1, updated_at = now()
      WHERE working_copy.product_id = selected_product.id;
    END IF;
  END IF;

  RETURN QUERY SELECT
    'decided'::text,
    selected_submission.id,
    selected_submission.product_id,
    selected_submission.seller_id,
    selected_submission.review_status,
    selected_submission.revision,
    selected_run.id,
    selected_run.dispatch_generation,
    selected_run.id IS NOT NULL AND selected_run.dispatch_status = 'pending';
END;
$$;

CREATE FUNCTION public.retry_administrator_product_activation_post_switch_cleanup(
  p_run_id uuid,
  p_expected_dispatch_generation integer,
  p_request_id uuid,
  p_administrator_user_id uuid
)
RETURNS TABLE (
  result text,
  run_id uuid,
  product_id uuid,
  seller_id uuid,
  phase text,
  status text,
  dispatch_generation integer,
  dispatch_status text,
  dispatch_required boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.product_image_publication_runs%ROWTYPE;
  selected_product public.products%ROWTYPE;
  replay_request public.product_activation_recovery_requests%ROWTYPE;
  normalized jsonb;
BEGIN
  IF p_run_id IS NULL OR p_expected_dispatch_generation IS NULL
    OR p_expected_dispatch_generation < 1 OR p_request_id IS NULL
    OR p_administrator_user_id IS NULL
  THEN
    RAISE EXCEPTION 'product_activation_dispatch_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT run.* INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = selected_run.product_id
    AND product.seller_id = selected_run.seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;

  normalized := jsonb_build_object(
    'runId', p_run_id,
    'expectedDispatchGeneration', p_expected_dispatch_generation,
    'action', 'retry_cleanup',
    'actorIdentifier', p_administrator_user_id
  );
  SELECT request.* INTO replay_request
  FROM public.product_activation_recovery_requests AS request
  WHERE request.product_id = selected_run.product_id
    AND request.request_id = p_request_id;
  IF FOUND THEN
    IF replay_request.run_id IS DISTINCT FROM selected_run.id
      OR replay_request.action <> 'retry_cleanup'
      OR replay_request.resulting_phase <> 'post_switch_cleanup'
      OR replay_request.actor_identifier IS DISTINCT FROM p_administrator_user_id
      OR replay_request.normalized_input IS DISTINCT FROM normalized
    THEN
      RAISE EXCEPTION 'product_moderation_revision_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT
      'replay'::text, replay_request.run_id, replay_request.product_id,
      selected_run.seller_id, replay_request.resulting_phase,
      replay_request.resulting_status, replay_request.resulting_dispatch_generation,
      selected_run.dispatch_status,
      replay_request.dispatch_required AND selected_run.dispatch_status = 'pending';
    RETURN;
  END IF;

  IF selected_run.dispatch_generation <> p_expected_dispatch_generation THEN
    RAISE EXCEPTION 'product_moderation_revision_conflict' USING ERRCODE = '40001';
  END IF;
  IF selected_run.phase <> 'post_switch_cleanup'
    OR selected_run.status <> 'cleanup_required'
    OR selected_product.active_moderation_submission_id
      IS DISTINCT FROM selected_run.moderation_submission_id
  THEN
    RAISE EXCEPTION 'product_moderation_cleanup_required' USING ERRCODE = '55000';
  END IF;

  UPDATE public.product_activation_cleanup_items AS item
  SET status = 'pending', attempt_token = NULL, error_code = NULL
  WHERE item.run_id = selected_run.id AND item.status = 'failed';
  UPDATE public.product_image_publication_runs AS run
  SET status = 'pending', dispatch_generation = run.dispatch_generation + 1,
      dispatch_status = 'pending', dispatch_error_code = NULL,
      dispatched_at = NULL, attempt_token = NULL, claim_started_at = NULL,
      error_code = NULL
  WHERE run.id = selected_run.id
  RETURNING * INTO selected_run;

  INSERT INTO public.product_activation_recovery_requests (
    product_id, request_id, run_id, expected_dispatch_generation,
    action, actor_identifier, normalized_input, resulting_dispatch_generation,
    resulting_phase, resulting_status, dispatch_required
  ) VALUES (
    selected_run.product_id, p_request_id, selected_run.id,
    p_expected_dispatch_generation, 'retry_cleanup', p_administrator_user_id,
    normalized, selected_run.dispatch_generation, selected_run.phase,
    selected_run.status, true
  );

  RETURN QUERY SELECT
    'recorded'::text, selected_run.id, selected_run.product_id,
    selected_run.seller_id, selected_run.phase, selected_run.status,
    selected_run.dispatch_generation, selected_run.dispatch_status, true;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_administrator_product_activation_post_switch_cleanup(
  uuid, integer, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_administrator_product_activation_post_switch_cleanup(
  uuid, integer, uuid, uuid
) TO service_role;

COMMIT;
