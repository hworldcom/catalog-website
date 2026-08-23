BEGIN;

DROP FUNCTION public.list_seller_products_for_moderation(
  uuid, text, integer, timestamptz, uuid
);
DROP FUNCTION public.read_seller_product_moderation_status(uuid, uuid);

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
  marketplace_visibility text,
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
    CASE
      WHEN product.status <> 'published' THEN 'not_published'
      WHEN approved_profile.id IS NULL THEN 'seller_approval_required'
      WHEN seller.storefront_enabled AND seller.published THEN 'visible'
      WHEN NOT seller.storefront_enabled THEN 'storefront_disabled'
      ELSE 'seller_approval_required'
    END::text,
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
  JOIN public.sellers AS seller
    ON seller.id = product.seller_id
  LEFT JOIN public.seller_profile_submissions AS approved_profile
    ON approved_profile.id = seller.approved_profile_submission_id
   AND approved_profile.seller_id = seller.id
   AND approved_profile.status = 'approved'
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
  marketplace_visibility text,
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
    CASE
      WHEN product.status <> 'published' THEN 'not_published'
      WHEN approved_profile.id IS NULL THEN 'seller_approval_required'
      WHEN seller.storefront_enabled AND seller.published THEN 'visible'
      WHEN NOT seller.storefront_enabled THEN 'storefront_disabled'
      ELSE 'seller_approval_required'
    END::text,
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
  JOIN public.sellers AS seller
    ON seller.id = product.seller_id
  LEFT JOIN public.seller_profile_submissions AS approved_profile
    ON approved_profile.id = seller.approved_profile_submission_id
   AND approved_profile.seller_id = seller.id
   AND approved_profile.status = 'approved'
  CROSS JOIN LATERAL public.product_moderation_status_state(product.id) AS state
  LEFT JOIN public.product_moderation_submissions AS submission
    ON submission.id = state.review_submission_id
   AND submission.product_id = product.id
   AND submission.seller_id = product.seller_id
  WHERE product.id = p_product_id
    AND product.seller_id = p_seller_id;
END;
$$;

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

COMMENT ON FUNCTION public.list_seller_products_for_moderation(
  uuid, text, integer, timestamptz, uuid
) IS
  'Lists seller-owned products with durable publication and effective marketplace visibility.';
COMMENT ON FUNCTION public.read_seller_product_moderation_status(uuid, uuid) IS
  'Reads one seller-owned product with durable publication and effective marketplace visibility.';

COMMIT;
