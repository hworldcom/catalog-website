BEGIN;

ALTER TABLE public.seller_profile_working_copies
  ADD CONSTRAINT seller_profile_working_copies_logo_asset_fkey
  FOREIGN KEY (seller_id, logo_asset_id)
  REFERENCES public.seller_profile_assets(seller_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT seller_profile_working_copies_cover_asset_fkey
  FOREIGN KEY (seller_id, cover_asset_id)
  REFERENCES public.seller_profile_assets(seller_id, id)
  ON DELETE RESTRICT;

ALTER TABLE public.seller_profile_submissions
  ADD CONSTRAINT seller_profile_submissions_logo_asset_fkey
  FOREIGN KEY (seller_id, logo_asset_id)
  REFERENCES public.seller_profile_assets(seller_id, id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT seller_profile_submissions_cover_asset_fkey
  FOREIGN KEY (seller_id, cover_asset_id)
  REFERENCES public.seller_profile_assets(seller_id, id)
  ON DELETE RESTRICT;

CREATE FUNCTION public.validate_seller_profile_media_references(
  p_seller_id uuid,
  p_logo_asset_id uuid,
  p_cover_asset_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_logo_asset_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.seller_profile_assets AS asset
      WHERE asset.seller_id = p_seller_id
        AND asset.id = p_logo_asset_id
        AND asset.kind = 'logo'
        AND asset.status = 'available'
    )
  THEN
    RAISE EXCEPTION 'seller_profile_image_not_ready' USING ERRCODE = '55000';
  END IF;

  IF p_cover_asset_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.seller_profile_assets AS asset
      WHERE asset.seller_id = p_seller_id
        AND asset.id = p_cover_asset_id
        AND asset.kind = 'cover'
        AND asset.status = 'available'
    )
  THEN
    RAISE EXCEPTION 'seller_profile_image_not_ready' USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE FUNCTION public.enforce_seller_profile_media_references()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.validate_seller_profile_media_references(
    NEW.seller_id,
    NEW.logo_asset_id,
    NEW.cover_asset_id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seller_profile_working_copies_10_media
  BEFORE INSERT OR UPDATE OF seller_id, logo_asset_id, cover_asset_id
  ON public.seller_profile_working_copies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seller_profile_media_references();

CREATE TRIGGER trg_seller_profile_submissions_10_media
  BEFORE INSERT OR UPDATE OF seller_id, logo_asset_id, cover_asset_id
  ON public.seller_profile_submissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seller_profile_media_references();

CREATE FUNCTION public.enforce_referenced_seller_profile_asset_state()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE'
    OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.status IS DISTINCT FROM OLD.status
  THEN
    IF EXISTS (
        SELECT 1
        FROM public.seller_profile_working_copies AS working_copy
        WHERE working_copy.seller_id = OLD.seller_id
          AND (working_copy.logo_asset_id = OLD.id OR working_copy.cover_asset_id = OLD.id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.seller_profile_submissions AS submission
        WHERE submission.seller_id = OLD.seller_id
          AND (submission.logo_asset_id = OLD.id OR submission.cover_asset_id = OLD.id)
      )
    THEN
      RAISE EXCEPTION 'seller_profile_image_not_ready' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seller_profile_assets_10_references
  BEFORE UPDATE OF seller_id, kind, status OR DELETE
  ON public.seller_profile_assets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_referenced_seller_profile_asset_state();

CREATE FUNCTION public.enforce_pending_seller_profile_working_copy_lock()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.seller_profile_submissions AS submission
    WHERE submission.seller_id = OLD.seller_id
      AND submission.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'seller_approval_submission_conflict' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seller_profile_working_copies_05_pending_lock
  BEFORE UPDATE ON public.seller_profile_working_copies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pending_seller_profile_working_copy_lock();

CREATE FUNCTION public.seller_profile_slug_available(
  p_seller_id uuid,
  p_slug text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.sellers AS seller
    WHERE seller.slug = p_slug
      AND seller.id <> p_seller_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.seller_slug_aliases AS alias
    WHERE alias.slug = p_slug
  );
$$;

CREATE FUNCTION public.submit_seller_profile_working_copy(
  p_seller_id uuid,
  p_expected_revision bigint,
  p_seller_request_id uuid,
  p_submitted_by_user_id uuid
)
RETURNS SETOF public.seller_profile_submissions
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_seller public.sellers%ROWTYPE;
  selected_working_copy public.seller_profile_working_copies%ROWTYPE;
  selected_submission public.seller_profile_submissions%ROWTYPE;
BEGIN
  IF p_seller_id IS NULL
    OR p_expected_revision IS NULL
    OR p_seller_request_id IS NULL
    OR p_submitted_by_user_id IS NULL
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

  SELECT submission.* INTO selected_submission
  FROM public.seller_profile_submissions AS submission
  WHERE submission.seller_id = p_seller_id
    AND submission.seller_request_id = p_seller_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF selected_submission.revision <> p_expected_revision
      OR selected_submission.submitted_by_user_id <> p_submitted_by_user_id
    THEN
      RAISE EXCEPTION 'seller_approval_submission_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN NEXT selected_submission;
    RETURN;
  END IF;

  SELECT working_copy.* INTO selected_working_copy
  FROM public.seller_profile_working_copies AS working_copy
  WHERE working_copy.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seller_approval_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF selected_working_copy.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'seller_profile_revision_conflict' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.seller_profile_submissions AS submission
    WHERE submission.seller_id = p_seller_id AND submission.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'seller_approval_submission_conflict' USING ERRCODE = '55000';
  END IF;
  IF NOT public.seller_profile_slug_available(p_seller_id, selected_working_copy.slug) THEN
    RAISE EXCEPTION 'seller_profile_slug_conflict' USING ERRCODE = '23505';
  END IF;

  PERFORM public.validate_seller_profile_media_references(
    p_seller_id,
    selected_working_copy.logo_asset_id,
    selected_working_copy.cover_asset_id
  );

  INSERT INTO public.seller_profile_submissions (
    seller_id,
    revision,
    submission_kind,
    status,
    name,
    slug,
    city,
    country,
    whatsapp,
    email,
    about,
    logo_asset_id,
    cover_asset_id,
    established_year,
    seller_request_id,
    submitted_by_user_id
  )
  VALUES (
    p_seller_id,
    selected_working_copy.revision,
    CASE WHEN selected_seller.approved_profile_submission_id IS NULL THEN 'initial' ELSE 'update' END,
    'pending',
    selected_working_copy.name,
    selected_working_copy.slug,
    selected_working_copy.city,
    selected_working_copy.country,
    selected_working_copy.whatsapp,
    selected_working_copy.email,
    selected_working_copy.about,
    selected_working_copy.logo_asset_id,
    selected_working_copy.cover_asset_id,
    selected_working_copy.established_year,
    p_seller_request_id,
    p_submitted_by_user_id
  )
  RETURNING * INTO selected_submission;

  INSERT INTO public.seller_profile_events (
    seller_id,
    submission_id,
    event_type,
    actor_user_id,
    request_id
  )
  VALUES (
    p_seller_id,
    selected_submission.id,
    'submitted',
    p_submitted_by_user_id,
    p_seller_request_id
  );

  RETURN NEXT selected_submission;
END;
$$;

CREATE FUNCTION public.withdraw_seller_profile_submission(
  p_seller_id uuid,
  p_submission_id uuid,
  p_expected_revision bigint,
  p_request_id uuid,
  p_actor_user_id uuid
)
RETURNS SETOF public.seller_profile_submissions
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  replay_event public.seller_profile_events%ROWTYPE;
  selected_submission public.seller_profile_submissions%ROWTYPE;
BEGIN
  IF p_seller_id IS NULL OR p_submission_id IS NULL OR p_expected_revision IS NULL
    OR p_request_id IS NULL OR p_actor_user_id IS NULL
  THEN
    RAISE EXCEPTION 'seller_approval_submission_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.sellers AS seller
  WHERE seller.id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seller_approval_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT event.* INTO replay_event
  FROM public.seller_profile_events AS event
  WHERE event.seller_id = p_seller_id
    AND event.actor_user_id = p_actor_user_id
    AND event.event_type = 'withdrawn'
    AND event.request_id = p_request_id;
  IF FOUND THEN
    SELECT submission.* INTO selected_submission
    FROM public.seller_profile_submissions AS submission
    WHERE submission.id = replay_event.submission_id
      AND submission.seller_id = p_seller_id;
    IF NOT FOUND OR selected_submission.id <> p_submission_id
      OR selected_submission.revision <> p_expected_revision
      OR selected_submission.status <> 'withdrawn'
    THEN
      RAISE EXCEPTION 'seller_approval_submission_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN NEXT selected_submission;
    RETURN;
  END IF;

  SELECT submission.* INTO selected_submission
  FROM public.seller_profile_submissions AS submission
  WHERE submission.id = p_submission_id
    AND submission.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seller_approval_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF selected_submission.revision <> p_expected_revision
    OR selected_submission.status <> 'pending'
  THEN
    RAISE EXCEPTION 'seller_approval_submission_conflict' USING ERRCODE = '55000';
  END IF;

  UPDATE public.seller_profile_submissions AS submission
  SET status = 'withdrawn'
  WHERE submission.id = p_submission_id
    AND submission.seller_id = p_seller_id
  RETURNING submission.* INTO selected_submission;

  UPDATE public.seller_profile_working_copies AS working_copy
  SET revision = greatest(working_copy.revision, selected_submission.revision) + 1,
      updated_at = now()
  WHERE working_copy.seller_id = p_seller_id;

  INSERT INTO public.seller_profile_events (
    seller_id, submission_id, event_type, actor_user_id, request_id
  ) VALUES (
    p_seller_id, p_submission_id, 'withdrawn', p_actor_user_id, p_request_id
  );

  RETURN NEXT selected_submission;
END;
$$;

CREATE FUNCTION public.decide_seller_profile_submission(
  p_seller_id uuid,
  p_submission_id uuid,
  p_expected_revision bigint,
  p_decision text,
  p_reason text,
  p_decision_request_id uuid,
  p_administrator_user_id uuid
)
RETURNS SETOF public.seller_profile_submissions
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_seller public.sellers%ROWTYPE;
  selected_submission public.seller_profile_submissions%ROWTYPE;
  replay_submission public.seller_profile_submissions%ROWTYPE;
  normalized_reason text;
  target_status text;
BEGIN
  normalized_reason := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  target_status := CASE p_decision
    WHEN 'approve' THEN 'approved'
    WHEN 'request_changes' THEN 'changes_requested'
    WHEN 'reject' THEN 'rejected'
    ELSE NULL
  END;

  IF p_seller_id IS NULL OR p_submission_id IS NULL OR p_expected_revision IS NULL
    OR p_decision_request_id IS NULL OR p_administrator_user_id IS NULL
    OR target_status IS NULL
    OR (p_decision IN ('request_changes', 'reject') AND (
      normalized_reason IS NULL OR pg_catalog.char_length(normalized_reason) > 1000
    ))
    OR (p_decision = 'approve' AND normalized_reason IS NOT NULL)
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

  SELECT submission.* INTO replay_submission
  FROM public.seller_profile_submissions AS submission
  WHERE submission.seller_id = p_seller_id
    AND submission.administrator_user_id = p_administrator_user_id
    AND submission.decision_request_id = p_decision_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF replay_submission.id <> p_submission_id
      OR replay_submission.revision <> p_expected_revision
      OR replay_submission.status <> target_status
      OR replay_submission.seller_visible_reason IS DISTINCT FROM normalized_reason
    THEN
      RAISE EXCEPTION 'seller_approval_submission_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN NEXT replay_submission;
    RETURN;
  END IF;

  SELECT submission.* INTO selected_submission
  FROM public.seller_profile_submissions AS submission
  WHERE submission.id = p_submission_id
    AND submission.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seller_approval_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF selected_submission.revision <> p_expected_revision
    OR selected_submission.status <> 'pending'
  THEN
    RAISE EXCEPTION 'seller_profile_revision_conflict' USING ERRCODE = '40001';
  END IF;

  PERFORM public.validate_seller_profile_media_references(
    p_seller_id,
    selected_submission.logo_asset_id,
    selected_submission.cover_asset_id
  );

  IF p_decision = 'approve'
    AND NOT public.seller_profile_slug_available(p_seller_id, selected_submission.slug)
  THEN
    RAISE EXCEPTION 'seller_profile_slug_conflict' USING ERRCODE = '23505';
  END IF;

  UPDATE public.seller_profile_submissions AS submission
  SET status = target_status,
      administrator_user_id = p_administrator_user_id,
      decision_request_id = p_decision_request_id,
      seller_visible_reason = normalized_reason,
      decided_at = now()
  WHERE submission.id = p_submission_id
    AND submission.seller_id = p_seller_id
  RETURNING submission.* INTO selected_submission;

  IF p_decision = 'approve' THEN
    IF selected_seller.approved_profile_submission_id IS NOT NULL
      AND selected_seller.slug <> selected_submission.slug
    THEN
      INSERT INTO public.seller_slug_aliases (slug, seller_id)
      VALUES (selected_seller.slug, p_seller_id);
    END IF;

    UPDATE public.sellers AS seller
    SET name = selected_submission.name,
        slug = selected_submission.slug,
        city = selected_submission.city,
        country = selected_submission.country,
        whatsapp = selected_submission.whatsapp,
        email = selected_submission.email,
        about = selected_submission.about,
        logo_url = CASE WHEN selected_submission.logo_asset_id IS NULL THEN NULL ELSE
          pg_catalog.format(
            '/v1/public/sellers/%s/profile-images/logo?revision=%s',
            p_seller_id,
            selected_submission.revision
          )
        END,
        cover_image_url = CASE WHEN selected_submission.cover_asset_id IS NULL THEN NULL ELSE
          pg_catalog.format(
            '/v1/public/sellers/%s/profile-images/cover?revision=%s',
            p_seller_id,
            selected_submission.revision
          )
        END,
        established_year = selected_submission.established_year,
        approved_profile_submission_id = selected_submission.id,
        updated_at = now()
    WHERE seller.id = p_seller_id
    RETURNING seller.* INTO selected_seller;

    UPDATE public.seller_profile_working_copies AS working_copy
    SET revision = greatest(working_copy.revision, selected_submission.revision) + 1,
        name = selected_submission.name,
        slug = selected_submission.slug,
        city = selected_submission.city,
        country = selected_submission.country,
        whatsapp = selected_submission.whatsapp,
        email = selected_submission.email,
        about = selected_submission.about,
        logo_asset_id = selected_submission.logo_asset_id,
        cover_asset_id = selected_submission.cover_asset_id,
        established_year = selected_submission.established_year,
        updated_at = now()
    WHERE working_copy.seller_id = p_seller_id;
  ELSE
    UPDATE public.seller_profile_working_copies AS working_copy
    SET revision = greatest(working_copy.revision, selected_submission.revision) + 1,
        updated_at = now()
    WHERE working_copy.seller_id = p_seller_id;
  END IF;

  INSERT INTO public.seller_profile_events (
    seller_id,
    submission_id,
    event_type,
    actor_user_id,
    request_id,
    seller_visible_reason
  ) VALUES (
    p_seller_id,
    p_submission_id,
    target_status,
    p_administrator_user_id,
    p_decision_request_id,
    normalized_reason
  );

  RETURN NEXT selected_submission;
END;
$$;

CREATE FUNCTION public.set_seller_storefront_enabled(
  p_seller_id uuid,
  p_enabled boolean,
  p_request_id uuid,
  p_actor_user_id uuid
)
RETURNS SETOF public.sellers
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
    RETURN NEXT selected_seller;
    RETURN;
  END IF;

  IF selected_seller.approved_profile_submission_id IS NULL THEN
    RAISE EXCEPTION 'seller_approval_required' USING ERRCODE = '55000';
  END IF;

  UPDATE public.sellers AS seller
  SET storefront_enabled = p_enabled,
      updated_at = now()
  WHERE seller.id = p_seller_id
  RETURNING seller.* INTO selected_seller;

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

  RETURN NEXT selected_seller;
END;
$$;

CREATE FUNCTION public.resolve_public_seller_slug(p_slug text)
RETURNS TABLE (
  seller_id uuid,
  canonical_slug text,
  is_alias boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_slug text;
BEGIN
  normalized_slug := pg_catalog.btrim(coalesce(p_slug, ''));
  IF pg_catalog.char_length(normalized_slug) NOT BETWEEN 2 AND 60
    OR normalized_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  THEN
    RAISE EXCEPTION 'public_catalog_read_invalid' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT seller.id, seller.slug, false
  FROM public.sellers AS seller
  WHERE seller.slug = normalized_slug
    AND seller.published
  UNION ALL
  SELECT seller.id, seller.slug, true
  FROM public.seller_slug_aliases AS alias
  JOIN public.sellers AS seller ON seller.id = alias.seller_id
  WHERE alias.slug = normalized_slug
    AND seller.published
  LIMIT 1;
END;
$$;

DROP POLICY IF EXISTS "Published products are public" ON public.products;
CREATE POLICY "Published products are public"
  ON public.products FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.sellers AS seller
      WHERE seller.id = products.seller_id AND seller.published
    )
  );

DROP POLICY IF EXISTS "Product images visible when parent published" ON public.product_images;
CREATE POLICY "Product images visible when parent published"
  ON public.product_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.products AS product
      JOIN public.sellers AS seller ON seller.id = product.seller_id
      WHERE product.id = product_images.product_id
        AND product.status = 'published'
        AND seller.published
    )
  );

CREATE FUNCTION public.enforce_approved_seller_product_publication()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'published'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published')
    AND NOT EXISTS (
      SELECT 1 FROM public.sellers AS seller
      WHERE seller.id = NEW.seller_id
        AND seller.approved_profile_submission_id IS NOT NULL
    )
  THEN
    RAISE EXCEPTION 'seller_approval_required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_05_seller_approval
  BEFORE INSERT OR UPDATE OF status ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_approved_seller_product_publication();

ALTER FUNCTION public.authorize_seller_product_publication(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean
) RENAME TO authorize_seller_product_publication_0040a3_legacy;

REVOKE ALL ON FUNCTION public.authorize_seller_product_publication_0040a3_legacy(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.authorize_seller_product_publication(
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
RETURNS TABLE (result text, product_draft_id uuid, publication_status text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sellers AS seller
    WHERE seller.id = p_seller_id
      AND seller.approved_profile_submission_id IS NOT NULL
  ) THEN
    RETURN QUERY SELECT 'seller_approval_required'::text, p_product_draft_id, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT *
  FROM public.authorize_seller_product_publication_0040a3_legacy(
    p_product_draft_id,
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
    p_cover_image_url_patch_present,
    p_cover_image_url,
    p_trending
  );
END;
$$;

ALTER FUNCTION public.retry_product_image_publication(uuid, uuid)
  RENAME TO retry_product_image_publication_0040a3_legacy;
REVOKE ALL ON FUNCTION public.retry_product_image_publication_0040a3_legacy(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.retry_product_image_publication(
  p_product_draft_id uuid,
  p_seller_id uuid
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sellers AS seller
    WHERE seller.id = p_seller_id
      AND seller.approved_profile_submission_id IS NOT NULL
  ) THEN
    RETURN 'seller_approval_required';
  END IF;
  RETURN public.retry_product_image_publication_0040a3_legacy(
    p_product_draft_id,
    p_seller_id
  );
END;
$$;

ALTER FUNCTION public.finalize_seller_product_publication(uuid, uuid, uuid)
  RENAME TO finalize_seller_product_publication_0040a3_legacy;
REVOKE ALL ON FUNCTION public.finalize_seller_product_publication_0040a3_legacy(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.finalize_seller_product_publication(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_attempt_token uuid
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sellers AS seller
    WHERE seller.id = p_seller_id
      AND seller.approved_profile_submission_id IS NOT NULL
  ) THEN
    RETURN 'not_allowed';
  END IF;
  RETURN public.finalize_seller_product_publication_0040a3_legacy(
    p_product_draft_id,
    p_seller_id,
    p_attempt_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_seller_profile_media_references(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_seller_profile_media_references()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_referenced_seller_profile_asset_state()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_pending_seller_profile_working_copy_lock()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seller_profile_slug_available(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_seller_profile_working_copy(uuid, bigint, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.withdraw_seller_profile_submission(uuid, uuid, bigint, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_seller_profile_submission(
  uuid, uuid, bigint, text, text, uuid, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_seller_storefront_enabled(uuid, boolean, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_public_seller_slug(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_approved_seller_product_publication()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.authorize_seller_product_publication(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_product_image_publication(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_seller_product_publication(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_seller_profile_working_copy(uuid, bigint, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_seller_profile_submission(
  uuid, uuid, bigint, uuid, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_seller_profile_submission(
  uuid, uuid, bigint, text, text, uuid, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_seller_storefront_enabled(uuid, boolean, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_public_seller_slug(text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.authorize_seller_product_publication(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_seller_product_publication(uuid, uuid, uuid)
  TO service_role;

COMMIT;
