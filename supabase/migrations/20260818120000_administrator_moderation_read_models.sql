BEGIN;

CREATE INDEX seller_profile_submissions_moderation_queue_idx
  ON public.seller_profile_submissions(status, submitted_at, id);

CREATE INDEX product_moderation_submissions_moderation_queue_idx
  ON public.product_moderation_submissions(review_status, submitted_at, id);

CREATE FUNCTION public.administrator_seller_submission_snapshot(
  p_submission public.seller_profile_submissions
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'sellerId', p_submission.seller_id,
    'revision', p_submission.revision,
    'submissionKind', p_submission.submission_kind,
    'name', p_submission.name,
    'slug', p_submission.slug,
    'city', p_submission.city,
    'country', p_submission.country,
    'whatsapp', p_submission.whatsapp,
    'email', p_submission.email,
    'about', p_submission.about,
    'logoAssetId', p_submission.logo_asset_id,
    'coverAssetId', p_submission.cover_asset_id,
    'establishedYear', p_submission.established_year
  );
$$;

CREATE FUNCTION public.administrator_seller_asset_record(
  p_seller_id uuid,
  p_asset_id uuid,
  p_kind text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_asset_id IS NULL THEN NULL
    ELSE (
      SELECT jsonb_build_object(
        'assetId', asset.id,
        'kind', asset.kind,
        'durableStatus', asset.status,
        'errorCode', asset.error_code
      )
      FROM public.seller_profile_assets AS asset
      WHERE asset.id = p_asset_id
        AND asset.seller_id = p_seller_id
        AND asset.kind = p_kind
    )
  END;
$$;

CREATE FUNCTION public.administrator_product_submission_images(
  p_submission_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'productDraftImageId', image.product_draft_image_id,
        'position', image.position,
        'isCover', image.is_cover
      )
      ORDER BY image.position, image.product_draft_image_id
    ),
    '[]'::jsonb
  )
  FROM public.product_moderation_submission_images AS image
  WHERE image.submission_id = p_submission_id;
$$;

CREATE FUNCTION public.list_administrator_moderation_requests(
  p_submission_type text,
  p_review_status text,
  p_activation_status text,
  p_seller_id uuid,
  p_limit integer,
  p_after_submitted_at timestamptz,
  p_after_submission_type text,
  p_after_submission_id uuid
)
RETURNS TABLE (
  submission_type text,
  submission_id uuid,
  seller_id uuid,
  seller_name text,
  revision bigint,
  submitted_at timestamptz,
  review_status text,
  seller_visible_reason text,
  seller_preview_kind text,
  seller_preview_asset_id uuid,
  seller_preview_durable_status text,
  seller_preview_error_code text,
  product_id uuid,
  product_snapshot_schema_version integer,
  product_snapshot_json jsonb,
  product_cover_image_id uuid,
  activation_run_id uuid,
  activation_phase text,
  activation_status text,
  activation_dispatch_status text,
  activation_dispatch_generation integer,
  activation_dispatch_error_code text,
  activation_error_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_submission_type IS NOT NULL
      AND p_submission_type NOT IN (
        'new_seller', 'seller_update', 'initial_product', 'product_update'
      )
    OR p_review_status NOT IN (
      'pending', 'changes_requested', 'approved', 'rejected', 'withdrawn'
    )
    OR p_activation_status IS NOT NULL
      AND p_activation_status NOT IN (
        'pending', 'running', 'failed', 'cleanup_required', 'completed', 'abandoned'
      )
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100
    OR (
      (p_after_submitted_at IS NULL)::integer
      + (p_after_submission_type IS NULL)::integer
      + (p_after_submission_id IS NULL)::integer
    ) NOT IN (0, 3)
    OR p_after_submission_type IS NOT NULL
      AND p_after_submission_type NOT IN (
        'new_seller', 'seller_update', 'initial_product', 'product_update'
      )
    OR p_activation_status IS NOT NULL
      AND (
        p_review_status <> 'approved'
        OR p_submission_type IN ('new_seller', 'seller_update')
      )
  THEN
    RAISE EXCEPTION 'moderation_request_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_review_status = 'approved'
    AND p_submission_type IS DISTINCT FROM 'new_seller'
    AND p_submission_type IS DISTINCT FROM 'seller_update'
    AND EXISTS (
      SELECT 1
      FROM public.product_moderation_submissions AS submission
      WHERE submission.review_status = 'approved'
        AND (p_seller_id IS NULL OR submission.seller_id = p_seller_id)
        AND (
          p_submission_type IS NULL
          OR p_submission_type = CASE submission.submission_kind
            WHEN 'initial_publication' THEN 'initial_product'
            ELSE 'product_update'
          END
        )
        AND (
          p_after_submitted_at IS NULL
          OR (
            submission.submitted_at,
            CASE submission.submission_kind
              WHEN 'initial_publication' THEN 'initial_product'
              ELSE 'product_update'
            END,
            submission.id
          ) > (
            p_after_submitted_at,
            p_after_submission_type,
            p_after_submission_id
          )
        )
        AND (
          SELECT count(*)
          FROM public.product_image_publication_runs AS run
          WHERE run.moderation_submission_id = submission.id
        ) <> 1
    )
  THEN
    RAISE EXCEPTION 'moderation_unavailable' USING ERRCODE = '55000';
  END IF;

  RETURN QUERY
  WITH mixed_requests AS (
    SELECT
      CASE submission.submission_kind
        WHEN 'initial' THEN 'new_seller'
        ELSE 'seller_update'
      END AS submission_type,
      submission.id AS submission_id,
      submission.seller_id,
      submission.name AS seller_name,
      submission.revision,
      submission.submitted_at,
      submission.status AS review_status,
      submission.seller_visible_reason,
      CASE
        WHEN submission.logo_asset_id IS NOT NULL THEN 'seller_logo'
        WHEN submission.cover_asset_id IS NOT NULL THEN 'seller_cover'
        ELSE NULL
      END AS seller_preview_kind,
      coalesce(submission.logo_asset_id, submission.cover_asset_id)
        AS seller_preview_asset_id,
      preview_asset.status AS seller_preview_durable_status,
      preview_asset.error_code AS seller_preview_error_code,
      NULL::uuid AS product_id,
      NULL::integer AS product_snapshot_schema_version,
      NULL::jsonb AS product_snapshot_json,
      NULL::uuid AS product_cover_image_id,
      NULL::uuid AS activation_run_id,
      NULL::text AS activation_phase,
      NULL::text AS activation_status,
      NULL::text AS activation_dispatch_status,
      NULL::integer AS activation_dispatch_generation,
      NULL::text AS activation_dispatch_error_code,
      NULL::text AS activation_error_code
    FROM public.seller_profile_submissions AS submission
    LEFT JOIN public.seller_profile_assets AS preview_asset
      ON preview_asset.id = coalesce(submission.logo_asset_id, submission.cover_asset_id)
     AND preview_asset.seller_id = submission.seller_id
     AND preview_asset.kind = CASE
       WHEN submission.logo_asset_id IS NOT NULL THEN 'logo'
       ELSE 'cover'
     END

    UNION ALL

    SELECT
      CASE submission.submission_kind
        WHEN 'initial_publication' THEN 'initial_product'
        ELSE 'product_update'
      END AS submission_type,
      submission.id AS submission_id,
      submission.seller_id,
      seller.name AS seller_name,
      submission.revision,
      submission.submitted_at,
      submission.review_status,
      submission.seller_visible_reason,
      NULL::text AS seller_preview_kind,
      NULL::uuid AS seller_preview_asset_id,
      NULL::text AS seller_preview_durable_status,
      NULL::text AS seller_preview_error_code,
      submission.product_id,
      submission.snapshot_schema_version AS product_snapshot_schema_version,
      submission.snapshot_json AS product_snapshot_json,
      cover.product_draft_image_id AS product_cover_image_id,
      run.id AS activation_run_id,
      run.phase AS activation_phase,
      run.status AS activation_status,
      run.dispatch_status AS activation_dispatch_status,
      run.dispatch_generation AS activation_dispatch_generation,
      run.dispatch_error_code AS activation_dispatch_error_code,
      run.error_code AS activation_error_code
    FROM public.product_moderation_submissions AS submission
    JOIN public.sellers AS seller ON seller.id = submission.seller_id
    LEFT JOIN public.product_moderation_submission_images AS cover
      ON cover.submission_id = submission.id
     AND cover.product_id = submission.product_id
     AND cover.is_cover
    LEFT JOIN public.product_image_publication_runs AS run
      ON run.moderation_submission_id = submission.id
  )
  SELECT request.*
  FROM mixed_requests AS request
  WHERE request.review_status = p_review_status
    AND (p_submission_type IS NULL OR request.submission_type = p_submission_type)
    AND (p_seller_id IS NULL OR request.seller_id = p_seller_id)
    AND (
      p_activation_status IS NULL
      OR request.activation_status = p_activation_status
    )
    AND (
      p_after_submitted_at IS NULL
      OR (
        request.submitted_at,
        request.submission_type,
        request.submission_id
      ) > (
        p_after_submitted_at,
        p_after_submission_type,
        p_after_submission_id
      )
    )
  ORDER BY request.submitted_at, request.submission_type, request.submission_id
  LIMIT p_limit + 1;
END;
$$;

CREATE FUNCTION public.read_administrator_seller_moderation_request(
  p_submission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  proposed public.seller_profile_submissions%ROWTYPE;
  baseline public.seller_profile_submissions%ROWTYPE;
  current_approved public.seller_profile_submissions%ROWTYPE;
  selected_seller public.sellers%ROWTYPE;
BEGIN
  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'moderation_request_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT submission.* INTO proposed
  FROM public.seller_profile_submissions AS submission
  WHERE submission.id = p_submission_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT seller.* INTO selected_seller
  FROM public.sellers AS seller
  WHERE seller.id = proposed.seller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'moderation_unavailable' USING ERRCODE = '55000';
  END IF;

  IF proposed.submission_kind = 'update' THEN
    SELECT submission.* INTO baseline
    FROM public.seller_profile_submissions AS submission
    WHERE submission.seller_id = proposed.seller_id
      AND submission.revision < proposed.revision
      AND submission.status = 'approved'
    ORDER BY submission.revision DESC, submission.id DESC
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'moderation_unavailable' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF selected_seller.approved_profile_submission_id IS NOT NULL THEN
    SELECT submission.* INTO current_approved
    FROM public.seller_profile_submissions AS submission
    WHERE submission.id = selected_seller.approved_profile_submission_id
      AND submission.seller_id = selected_seller.id
      AND submission.status = 'approved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'moderation_unavailable' USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'submissionId', proposed.id,
    'sellerId', proposed.seller_id,
    'sellerName', proposed.name,
    'revision', proposed.revision,
    'submittedAt', proposed.submitted_at,
    'reviewStatus', proposed.status,
    'sellerVisibleReason', proposed.seller_visible_reason,
    'administratorUserId', proposed.administrator_user_id,
    'decisionRequestId', proposed.decision_request_id,
    'decidedAt', proposed.decided_at,
    'proposed', jsonb_build_object(
      'snapshot', public.administrator_seller_submission_snapshot(proposed),
      'logoAsset', public.administrator_seller_asset_record(
        proposed.seller_id, proposed.logo_asset_id, 'logo'
      ),
      'coverAsset', public.administrator_seller_asset_record(
        proposed.seller_id, proposed.cover_asset_id, 'cover'
      )
    ),
    'comparisonBaseline', CASE
      WHEN baseline.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'submissionId', baseline.id,
        'revision', baseline.revision,
        'snapshot', public.administrator_seller_submission_snapshot(baseline),
        'logoAsset', public.administrator_seller_asset_record(
          baseline.seller_id, baseline.logo_asset_id, 'logo'
        ),
        'coverAsset', public.administrator_seller_asset_record(
          baseline.seller_id, baseline.cover_asset_id, 'cover'
        )
      )
    END,
    'currentApprovedReference', CASE
      WHEN current_approved.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'submissionId', current_approved.id,
        'revision', current_approved.revision
      )
    END,
    'canDecide', proposed.status = 'pending' AND EXISTS (
      SELECT 1
      FROM public.seller_profile_working_copies AS working_copy
      WHERE working_copy.seller_id = proposed.seller_id
        AND working_copy.revision = proposed.revision
    )
  );
END;
$$;

CREATE FUNCTION public.read_administrator_product_moderation_request(
  p_submission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  proposed public.product_moderation_submissions%ROWTYPE;
  baseline public.product_moderation_submissions%ROWTYPE;
  current_approved public.product_moderation_submissions%ROWTYPE;
  selected_product public.products%ROWTYPE;
  selected_seller public.sellers%ROWTYPE;
  selected_run public.product_image_publication_runs%ROWTYPE;
  run_count integer;
BEGIN
  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'moderation_request_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT submission.* INTO proposed
  FROM public.product_moderation_submissions AS submission
  WHERE submission.id = p_submission_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = proposed.product_id
    AND product.seller_id = proposed.seller_id;
  SELECT seller.* INTO selected_seller
  FROM public.sellers AS seller
  WHERE seller.id = proposed.seller_id;
  IF selected_product.id IS NULL OR selected_seller.id IS NULL THEN
    RAISE EXCEPTION 'moderation_unavailable' USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO run_count
  FROM public.product_image_publication_runs AS run
  WHERE run.moderation_submission_id = proposed.id;
  IF proposed.review_status = 'approved' AND run_count <> 1
    OR proposed.review_status <> 'approved' AND run_count <> 0
  THEN
    RAISE EXCEPTION 'moderation_unavailable' USING ERRCODE = '55000';
  END IF;
  IF run_count = 1 THEN
    SELECT run.* INTO selected_run
    FROM public.product_image_publication_runs AS run
    WHERE run.moderation_submission_id = proposed.id;
  END IF;

  IF proposed.submission_kind = 'update' THEN
    SELECT submission.* INTO baseline
    FROM public.product_moderation_submissions AS submission
    WHERE submission.product_id = proposed.product_id
      AND submission.revision < proposed.revision
      AND submission.review_status = 'approved'
    ORDER BY submission.revision DESC, submission.id DESC
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'moderation_unavailable' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF selected_product.approved_moderation_submission_id IS NOT NULL THEN
    SELECT submission.* INTO current_approved
    FROM public.product_moderation_submissions AS submission
    WHERE submission.id = selected_product.approved_moderation_submission_id
      AND submission.product_id = selected_product.id
      AND submission.seller_id = selected_product.seller_id
      AND submission.review_status = 'approved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'moderation_unavailable' USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'submissionId', proposed.id,
    'productId', proposed.product_id,
    'sellerId', proposed.seller_id,
    'sellerName', selected_seller.name,
    'revision', proposed.revision,
    'submissionKind', proposed.submission_kind,
    'submittedAt', proposed.submitted_at,
    'reviewStatus', proposed.review_status,
    'sellerVisibleReason', proposed.seller_visible_reason,
    'administratorUserId', proposed.administrator_user_id,
    'decisionRequestId', proposed.decision_request_id,
    'decidedAt', proposed.decided_at,
    'proposed', jsonb_build_object(
      'snapshotSchemaVersion', proposed.snapshot_schema_version,
      'snapshot', proposed.snapshot_json,
      'images', public.administrator_product_submission_images(proposed.id)
    ),
    'comparisonBaseline', CASE
      WHEN baseline.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'submissionId', baseline.id,
        'revision', baseline.revision,
        'snapshotSchemaVersion', baseline.snapshot_schema_version,
        'snapshot', baseline.snapshot_json,
        'images', public.administrator_product_submission_images(baseline.id)
      )
    END,
    'currentApprovedReference', CASE
      WHEN current_approved.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'submissionId', current_approved.id,
        'revision', current_approved.revision
      )
    END,
    'activation', CASE
      WHEN selected_run.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'runId', selected_run.id,
        'phase', selected_run.phase,
        'status', selected_run.status,
        'dispatchStatus', selected_run.dispatch_status,
        'dispatchGeneration', selected_run.dispatch_generation,
        'dispatchErrorCode', selected_run.dispatch_error_code,
        'errorCode', selected_run.error_code
      )
    END,
    'canDecide', proposed.review_status = 'pending'
      AND selected_product.active_moderation_submission_id = proposed.id,
    'canRetryDispatch', proposed.review_status = 'approved'
      AND selected_product.active_moderation_submission_id = proposed.id
      AND selected_run.status = 'pending'
      AND selected_run.dispatch_status IN ('pending', 'failed'),
    'canRetryActivation', proposed.review_status = 'approved'
      AND selected_product.active_moderation_submission_id = proposed.id
      AND selected_run.phase = 'activation'
      AND selected_run.status = 'failed'
      AND public.product_activation_error_is_retryable(selected_run.error_code),
    'canRetryPostSwitchCleanup', proposed.review_status = 'approved'
      AND selected_product.active_moderation_submission_id = proposed.id
      AND selected_run.phase = 'post_switch_cleanup'
      AND selected_run.status = 'cleanup_required'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.administrator_seller_submission_snapshot(
  public.seller_profile_submissions
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.administrator_seller_asset_record(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.administrator_product_submission_images(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_administrator_moderation_requests(
  text, text, text, uuid, integer, timestamptz, text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_administrator_seller_moderation_request(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_administrator_product_moderation_request(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_administrator_moderation_requests(
  text, text, text, uuid, integer, timestamptz, text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_administrator_seller_moderation_request(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.read_administrator_product_moderation_request(uuid)
  TO service_role;

COMMIT;
