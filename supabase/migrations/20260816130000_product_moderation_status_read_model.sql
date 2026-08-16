BEGIN;

CREATE FUNCTION public.product_moderation_status_state(
  p_product_id uuid
)
RETURNS TABLE (
  action_revision bigint,
  has_working_copy boolean,
  review_submission_id uuid,
  review_kind text,
  review_revision bigint,
  review_status text,
  review_submitted_at timestamptz,
  review_decided_at timestamptz,
  review_seller_visible_reason text,
  activation_run_id uuid,
  activation_phase text,
  activation_status text,
  activation_dispatch_status text,
  activation_dispatch_generation integer,
  activation_dispatch_error_code text,
  activation_error_code text,
  can_edit boolean,
  can_submit boolean,
  can_withdraw boolean,
  can_abandon_failed_activation boolean,
  can_retry_abandonment_cleanup boolean,
  can_archive boolean,
  can_restore boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_working_copy public.product_moderation_working_copies%ROWTYPE;
  selected_review public.product_moderation_submissions%ROWTYPE;
  selected_approved_review public.product_moderation_submissions%ROWTYPE;
  selected_activation public.product_image_publication_runs%ROWTYPE;
  seller_approved boolean;
  blocking_activation_exists boolean;
  private_source_editable boolean;
BEGIN
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'product_moderation_status_unavailable' USING ERRCODE = '55000';
  END IF;

  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT working_copy.* INTO selected_working_copy
  FROM public.product_moderation_working_copies AS working_copy
  WHERE working_copy.product_id = selected_product.id;

  IF selected_product.active_moderation_submission_id IS NOT NULL THEN
    SELECT submission.* INTO selected_review
    FROM public.product_moderation_submissions AS submission
    WHERE submission.id = selected_product.active_moderation_submission_id
      AND submission.product_id = selected_product.id
      AND submission.seller_id = selected_product.seller_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_moderation_status_unavailable' USING ERRCODE = '55000';
    END IF;
  ELSE
    SELECT submission.* INTO selected_review
    FROM public.product_moderation_submissions AS submission
    WHERE submission.product_id = selected_product.id
      AND submission.seller_id = selected_product.seller_id
    ORDER BY submission.revision DESC, submission.id DESC
    LIMIT 1;
  END IF;

  IF selected_product.approved_moderation_submission_id IS NOT NULL THEN
    SELECT submission.* INTO selected_approved_review
    FROM public.product_moderation_submissions AS submission
    WHERE submission.id = selected_product.approved_moderation_submission_id
      AND submission.product_id = selected_product.id
      AND submission.seller_id = selected_product.seller_id
      AND submission.review_status = 'approved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_moderation_status_unavailable' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF selected_review.id IS NOT NULL AND selected_review.review_status = 'approved' THEN
    SELECT run.* INTO selected_activation
    FROM public.product_image_publication_runs AS run
    WHERE run.moderation_submission_id = selected_review.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_moderation_status_unavailable' USING ERRCODE = '55000';
    END IF;
  ELSIF selected_review.id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.product_image_publication_runs AS run
    WHERE run.moderation_submission_id = selected_review.id
  ) THEN
    RAISE EXCEPTION 'product_moderation_status_unavailable' USING ERRCODE = '55000';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.product_image_publication_runs AS run
    WHERE run.product_id = selected_product.id
      AND run.status IN ('pending', 'running', 'failed', 'cleanup_required')
  ) INTO blocking_activation_exists;

  SELECT EXISTS (
    SELECT 1
    FROM public.sellers AS seller
    JOIN public.seller_profile_submissions AS approval
      ON approval.id = seller.approved_profile_submission_id
     AND approval.seller_id = seller.id
     AND approval.status = 'approved'
    WHERE seller.id = selected_product.seller_id
  ) INTO seller_approved;

  private_source_editable :=
    selected_product.active_moderation_submission_id IS NULL
    AND NOT blocking_activation_exists
    AND (
      selected_product.status = 'draft'
      OR selected_product.status = 'published'
      OR (
        selected_product.status = 'archived'
        AND selected_working_copy.product_id IS NOT NULL
      )
    );

  RETURN QUERY SELECT
    COALESCE(
      selected_working_copy.revision,
      selected_approved_review.revision,
      selected_product.moderation_revision
    ),
    selected_working_copy.product_id IS NOT NULL,
    selected_review.id,
    selected_review.submission_kind,
    selected_review.revision,
    selected_review.review_status,
    selected_review.submitted_at,
    selected_review.decided_at,
    selected_review.seller_visible_reason,
    selected_activation.id,
    selected_activation.phase,
    selected_activation.status,
    selected_activation.dispatch_status,
    selected_activation.dispatch_generation,
    selected_activation.dispatch_error_code,
    selected_activation.error_code,
    private_source_editable,
    private_source_editable
      AND seller_approved
      AND (
        selected_product.status = 'draft'
        OR selected_working_copy.product_id IS NOT NULL
      ),
    selected_review.id IS NOT NULL
      AND selected_review.review_status = 'pending'
      AND selected_product.active_moderation_submission_id = selected_review.id
      AND selected_activation.id IS NULL,
    selected_activation.id IS NOT NULL
      AND selected_activation.phase = 'activation'
      AND selected_activation.status = 'failed'
      AND selected_product.active_moderation_submission_id = selected_review.id,
    selected_activation.id IS NOT NULL
      AND selected_activation.phase = 'pre_switch_cleanup'
      AND selected_activation.status = 'cleanup_required'
      AND selected_product.active_moderation_submission_id = selected_review.id,
    selected_product.status <> 'archived'
      AND NOT blocking_activation_exists
      AND (
        selected_product.active_moderation_submission_id IS NULL
        OR (
          selected_review.id = selected_product.active_moderation_submission_id
          AND selected_review.review_status = 'pending'
        )
      ),
    selected_product.status = 'archived'
      AND selected_working_copy.product_id IS NULL
      AND selected_approved_review.id IS NOT NULL
      AND selected_product.active_moderation_submission_id IS NULL
      AND NOT blocking_activation_exists;
END;
$$;

DROP FUNCTION public.list_seller_products_for_moderation(
  uuid, text, integer, timestamptz, uuid
);

CREATE FUNCTION public.list_seller_products_for_moderation(
  p_seller_id uuid,
  p_status text,
  p_limit integer,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_product_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  product_code text,
  cover_image_id uuid,
  cover_image_url text,
  price numeric,
  currency text,
  moq integer,
  pack_size text,
  stock public.stock_status,
  status public.product_status,
  moderation_revision bigint,
  has_working_copy boolean,
  created_at timestamptz,
  review_submission_id uuid,
  review_kind text,
  review_revision bigint,
  review_status text,
  review_submitted_at timestamptz,
  review_decided_at timestamptz,
  review_seller_visible_reason text,
  activation_run_id uuid,
  activation_phase text,
  activation_status text,
  activation_dispatch_status text,
  activation_dispatch_generation integer,
  activation_dispatch_error_code text,
  activation_error_code text,
  can_edit boolean,
  can_submit boolean,
  can_withdraw boolean,
  can_abandon_failed_activation boolean,
  can_retry_abandonment_cleanup boolean,
  can_archive boolean,
  can_restore boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_seller_id IS NULL
    OR p_status NOT IN ('active', 'archived')
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 101
    OR ((p_before_created_at IS NULL) <> (p_before_product_id IS NULL))
  THEN
    RAISE EXCEPTION 'seller_product_list_invalid' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    product.id,
    product.title,
    product.product_code,
    product.cover_image_id,
    product.cover_image_url,
    product.price,
    product.currency,
    product.moq,
    product.pack_size,
    product.stock,
    product.status,
    state.action_revision,
    state.has_working_copy,
    product.created_at,
    state.review_submission_id,
    state.review_kind,
    state.review_revision,
    state.review_status,
    state.review_submitted_at,
    state.review_decided_at,
    state.review_seller_visible_reason,
    state.activation_run_id,
    state.activation_phase,
    state.activation_status,
    state.activation_dispatch_status,
    state.activation_dispatch_generation,
    state.activation_dispatch_error_code,
    state.activation_error_code,
    state.can_edit,
    state.can_submit,
    state.can_withdraw,
    state.can_abandon_failed_activation,
    state.can_retry_abandonment_cleanup,
    state.can_archive,
    state.can_restore
  FROM public.products AS product
  CROSS JOIN LATERAL public.product_moderation_status_state(product.id) AS state
  WHERE product.seller_id = p_seller_id
    AND (
      (p_status = 'active' AND product.status <> 'archived')
      OR (p_status = 'archived' AND product.status = 'archived')
    )
    AND (
      p_before_created_at IS NULL
      OR (product.created_at, product.id) < (p_before_created_at, p_before_product_id)
    )
  ORDER BY product.created_at DESC, product.id DESC
  LIMIT p_limit;
END;
$$;

CREATE FUNCTION public.read_seller_product_moderation_status(
  p_product_id uuid,
  p_seller_id uuid
)
RETURNS TABLE (
  id uuid,
  title text,
  product_code text,
  cover_image_id uuid,
  cover_image_url text,
  price numeric,
  currency text,
  moq integer,
  pack_size text,
  stock public.stock_status,
  status public.product_status,
  moderation_revision bigint,
  has_working_copy boolean,
  created_at timestamptz,
  review_submission_id uuid,
  review_kind text,
  review_revision bigint,
  review_status text,
  review_submitted_at timestamptz,
  review_decided_at timestamptz,
  review_seller_visible_reason text,
  activation_run_id uuid,
  activation_phase text,
  activation_status text,
  activation_dispatch_status text,
  activation_dispatch_generation integer,
  activation_dispatch_error_code text,
  activation_error_code text,
  can_edit boolean,
  can_submit boolean,
  can_withdraw boolean,
  can_abandon_failed_activation boolean,
  can_retry_abandonment_cleanup boolean,
  can_archive boolean,
  can_restore boolean,
  submitted_snapshot_schema_version integer,
  submitted_snapshot_json jsonb,
  submitted_images jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_product_id IS NULL OR p_seller_id IS NULL THEN
    RAISE EXCEPTION 'product_moderation_status_invalid' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    product.id,
    product.title,
    product.product_code,
    product.cover_image_id,
    product.cover_image_url,
    product.price,
    product.currency,
    product.moq,
    product.pack_size,
    product.stock,
    product.status,
    state.action_revision,
    state.has_working_copy,
    product.created_at,
    state.review_submission_id,
    state.review_kind,
    state.review_revision,
    state.review_status,
    state.review_submitted_at,
    state.review_decided_at,
    state.review_seller_visible_reason,
    state.activation_run_id,
    state.activation_phase,
    state.activation_status,
    state.activation_dispatch_status,
    state.activation_dispatch_generation,
    state.activation_dispatch_error_code,
    state.activation_error_code,
    state.can_edit,
    state.can_submit,
    state.can_withdraw,
    state.can_abandon_failed_activation,
    state.can_retry_abandonment_cleanup,
    state.can_archive,
    state.can_restore,
    submission.snapshot_schema_version,
    submission.snapshot_json,
    CASE
      WHEN state.review_submission_id IS NULL THEN NULL
      ELSE COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'productDraftImageId', membership.product_draft_image_id,
              'position', membership.position,
              'isCover', membership.is_cover
            ) ORDER BY membership.position, membership.product_draft_image_id
          )
          FROM public.product_moderation_submission_images AS membership
          WHERE membership.submission_id = state.review_submission_id
            AND membership.product_id = product.id
        ),
        '[]'::jsonb
      )
    END
  FROM public.products AS product
  CROSS JOIN LATERAL public.product_moderation_status_state(product.id) AS state
  LEFT JOIN public.product_moderation_submissions AS submission
    ON submission.id = state.review_submission_id
   AND submission.product_id = product.id
   AND submission.seller_id = product.seller_id
  WHERE product.id = p_product_id
    AND product.seller_id = p_seller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.product_moderation_status_state(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_seller_products_for_moderation(
  uuid, text, integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_seller_product_moderation_status(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_seller_products_for_moderation(
  uuid, text, integer, timestamptz, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_seller_product_moderation_status(uuid, uuid)
  TO service_role;

COMMIT;
