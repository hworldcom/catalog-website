BEGIN;

CREATE FUNCTION public.seller_profile_moderation_media_preview(
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
        'durableStatus', asset.status,
        'deliveryStatus', CASE asset.status
          WHEN 'available' THEN 'available'
          WHEN 'pending' THEN 'pending'
          WHEN 'failed' THEN 'failed'
          WHEN 'deleted' THEN 'missing'
          ELSE 'unavailable'
        END,
        'deliveryErrorCode', asset.error_code,
        'url', CASE
          WHEN asset.status = 'available'
            THEN pg_catalog.format('/v1/seller-profile-assets/%s', asset.id)
          ELSE NULL
        END
      )
      FROM public.seller_profile_assets AS asset
      WHERE asset.id = p_asset_id
        AND asset.seller_id = p_seller_id
        AND asset.kind = p_kind
    )
  END;
$$;

CREATE FUNCTION public.read_seller_profile_moderation_snapshot(p_seller_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH selected_seller AS (
    SELECT seller.*
    FROM public.sellers AS seller
    WHERE seller.id = p_seller_id
  ),
  selected_working_copy AS (
    SELECT working_copy.*
    FROM public.seller_profile_working_copies AS working_copy
    WHERE working_copy.seller_id = p_seller_id
  ),
  latest_submission AS (
    SELECT submission.*
    FROM public.seller_profile_submissions AS submission
    WHERE submission.seller_id = p_seller_id
    ORDER BY submission.revision DESC, submission.id DESC
    LIMIT 1
  ),
  approved_submission AS (
    SELECT submission.*
    FROM selected_seller AS seller
    JOIN public.seller_profile_submissions AS submission
      ON submission.seller_id = seller.id
     AND submission.id = seller.approved_profile_submission_id
     AND submission.status = 'approved'
  )
  SELECT jsonb_build_object(
    'sellerId', seller.id,
    'companyCode', seller.company_code,
    'companyCodeLockedAt', seller.company_code_locked_at,
    'primaryCategoryId', seller.primary_category_id,
    'storefrontEnabled', seller.storefront_enabled,
    'approvalState', CASE
      WHEN seller.approved_profile_submission_id IS NULL THEN 'not_approved'
      WHEN seller.storefront_enabled THEN 'approved_storefront_enabled'
      ELSE 'approved_storefront_disabled'
    END,
    'approvedProfile', CASE
      WHEN approved.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'submissionId', approved.id,
        'revision', approved.revision,
        'name', approved.name,
        'slug', approved.slug,
        'city', approved.city,
        'country', approved.country,
        'whatsapp', approved.whatsapp,
        'email', approved.email,
        'about', approved.about,
        'establishedYear', approved.established_year,
        'logo', public.seller_profile_moderation_media_preview(
          seller.id,
          approved.logo_asset_id,
          'logo'
        ),
        'cover', public.seller_profile_moderation_media_preview(
          seller.id,
          approved.cover_asset_id,
          'cover'
        )
      )
    END,
    'workingCopy', jsonb_build_object(
      'revision', working_copy.revision,
      'name', working_copy.name,
      'slug', working_copy.slug,
      'city', working_copy.city,
      'country', working_copy.country,
      'whatsapp', working_copy.whatsapp,
      'email', working_copy.email,
      'about', working_copy.about,
      'establishedYear', working_copy.established_year,
      'logo', public.seller_profile_moderation_media_preview(
        seller.id,
        working_copy.logo_asset_id,
        'logo'
      ),
      'cover', public.seller_profile_moderation_media_preview(
        seller.id,
        working_copy.cover_asset_id,
        'cover'
      )
    ),
    'latestSubmission', CASE
      WHEN latest.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', latest.id,
        'kind', latest.submission_kind,
        'revision', latest.revision,
        'status', latest.status,
        'submittedAt', latest.submitted_at,
        'decidedAt', latest.decided_at,
        'sellerVisibleReason', latest.seller_visible_reason
      )
    END,
    'actions', jsonb_build_object(
      'canEdit', latest.status IS DISTINCT FROM 'pending',
      'canSubmit', latest.status IS DISTINCT FROM 'pending',
      'canWithdraw', coalesce(latest.status = 'pending', false),
      'canEnableStorefront',
        seller.approved_profile_submission_id IS NOT NULL
        AND NOT seller.storefront_enabled,
      'canDisableStorefront',
        seller.approved_profile_submission_id IS NOT NULL
        AND seller.storefront_enabled
    )
  )
  FROM selected_seller AS seller
  JOIN selected_working_copy AS working_copy ON true
  LEFT JOIN latest_submission AS latest ON true
  LEFT JOIN approved_submission AS approved ON true;
$$;

DROP FUNCTION public.set_seller_storefront_enabled(uuid, boolean, uuid, uuid);

CREATE FUNCTION public.set_seller_storefront_enabled(
  p_seller_id uuid,
  p_enabled boolean,
  p_request_id uuid,
  p_actor_user_id uuid
)
RETURNS TABLE (
  result text,
  storefront_enabled boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_seller public.sellers%ROWTYPE;
  replay_event public.seller_profile_events%ROWTYPE;
BEGIN
  IF p_seller_id IS NULL OR p_enabled IS NULL OR p_request_id IS NULL
    OR p_actor_user_id IS NULL
  THEN
    RAISE EXCEPTION 'seller_approval_submission_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT seller.* INTO selected_seller
  FROM public.sellers AS seller
  WHERE seller.id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seller_approval_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT event.* INTO replay_event
  FROM public.seller_profile_events AS event
  WHERE event.seller_id = p_seller_id
    AND event.actor_user_id = p_actor_user_id
    AND event.request_id = p_request_id
    AND event.event_type IN ('storefront_enabled', 'storefront_disabled');
  IF FOUND THEN
    IF replay_event.storefront_enabled IS DISTINCT FROM p_enabled THEN
      RAISE EXCEPTION 'seller_approval_submission_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT 'replay'::text, replay_event.storefront_enabled;
    RETURN;
  END IF;

  IF selected_seller.approved_profile_submission_id IS NULL THEN
    RAISE EXCEPTION 'seller_approval_required' USING ERRCODE = '55000';
  END IF;

  UPDATE public.sellers AS seller
  SET storefront_enabled = p_enabled,
      updated_at = now()
  WHERE seller.id = p_seller_id;

  INSERT INTO public.seller_profile_events (
    seller_id,
    event_type,
    actor_user_id,
    request_id,
    storefront_enabled
  ) VALUES (
    p_seller_id,
    CASE WHEN p_enabled THEN 'storefront_enabled' ELSE 'storefront_disabled' END,
    p_actor_user_id,
    p_request_id,
    p_enabled
  );

  RETURN QUERY SELECT 'recorded'::text, p_enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.seller_profile_moderation_media_preview(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.read_seller_profile_moderation_snapshot(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_seller_storefront_enabled(uuid, boolean, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.read_seller_profile_moderation_snapshot(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_seller_storefront_enabled(uuid, boolean, uuid, uuid)
  TO service_role;

COMMIT;
