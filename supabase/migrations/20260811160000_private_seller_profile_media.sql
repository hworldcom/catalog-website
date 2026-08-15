BEGIN;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'seller-profile-images',
  'seller-profile-images',
  false,
  20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE public.seller_profile_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('logo', 'cover')),
  object_key text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 20971520),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'available', 'deleting', 'failed', 'deleted')),
  prepare_request_id uuid NOT NULL,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT seller_profile_assets_seller_id_id_unique UNIQUE (seller_id, id),
  CONSTRAINT seller_profile_assets_prepare_request_unique
    UNIQUE (seller_id, prepare_request_id),
  CONSTRAINT seller_profile_assets_filename_check
    CHECK (
      pg_catalog.char_length(pg_catalog.btrim(original_filename)) BETWEEN 1 AND 255
    ),
  CONSTRAINT seller_profile_assets_object_key_check
    CHECK (
      object_key = seller_id::text || '/' || id::text || CASE mime_type
        WHEN 'image/jpeg' THEN '.jpg'
        WHEN 'image/png' THEN '.png'
        WHEN 'image/webp' THEN '.webp'
      END
    ),
  CONSTRAINT seller_profile_assets_lifecycle_check
    CHECK (
      (
        status IN ('pending', 'available', 'deleting')
        AND error_code IS NULL
        AND deleted_at IS NULL
      )
      OR (
        status = 'failed'
        AND error_code IN (
          'seller_profile_image_invalid',
          'seller_profile_image_cleanup_required'
        )
        AND deleted_at IS NULL
      )
      OR (
        status = 'deleted'
        AND error_code IS NULL
        AND deleted_at IS NOT NULL
      )
    )
);

ALTER TABLE public.seller_profile_assets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.seller_profile_assets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.seller_profile_assets TO service_role;

CREATE FUNCTION public.prepare_seller_profile_asset_upload(
  p_seller_id uuid,
  p_kind text,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_prepare_request_id uuid
)
RETURNS SETOF public.seller_profile_assets
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_asset public.seller_profile_assets%ROWTYPE;
  new_asset_id uuid;
  normalized_filename text;
  normalized_mime_type text;
  object_extension text;
BEGIN
  normalized_filename := pg_catalog.btrim(coalesce(p_original_filename, ''));
  normalized_mime_type := pg_catalog.lower(pg_catalog.btrim(coalesce(p_mime_type, '')));

  IF p_seller_id IS NULL
    OR p_prepare_request_id IS NULL
    OR p_kind NOT IN ('logo', 'cover')
    OR pg_catalog.char_length(normalized_filename) NOT BETWEEN 1 AND 255
    OR normalized_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
    OR p_size_bytes IS NULL
    OR p_size_bytes NOT BETWEEN 1 AND 20971520
  THEN
    RAISE EXCEPTION 'seller_profile_image_invalid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sellers AS seller WHERE seller.id = p_seller_id
  ) THEN
    RAISE EXCEPTION 'seller_profile_image_required_owner' USING ERRCODE = '42501';
  END IF;

  new_asset_id := gen_random_uuid();
  object_extension := CASE normalized_mime_type
    WHEN 'image/jpeg' THEN '.jpg'
    WHEN 'image/png' THEN '.png'
    WHEN 'image/webp' THEN '.webp'
  END;

  INSERT INTO public.seller_profile_assets (
    id,
    seller_id,
    kind,
    object_key,
    original_filename,
    mime_type,
    size_bytes,
    status,
    prepare_request_id
  )
  VALUES (
    new_asset_id,
    p_seller_id,
    p_kind,
    p_seller_id::text || '/' || new_asset_id::text || object_extension,
    normalized_filename,
    normalized_mime_type,
    p_size_bytes,
    'pending',
    p_prepare_request_id
  )
  ON CONFLICT (seller_id, prepare_request_id) DO NOTHING
  RETURNING * INTO selected_asset;

  IF NOT FOUND THEN
    SELECT asset.*
    INTO selected_asset
    FROM public.seller_profile_assets AS asset
    WHERE asset.seller_id = p_seller_id
      AND asset.prepare_request_id = p_prepare_request_id
    FOR UPDATE;

    IF NOT FOUND
      OR selected_asset.kind <> p_kind
      OR selected_asset.original_filename <> normalized_filename
      OR selected_asset.mime_type <> normalized_mime_type
      OR selected_asset.size_bytes <> p_size_bytes
    THEN
      RAISE EXCEPTION 'seller_profile_image_conflict' USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEXT selected_asset;
END;
$$;

CREATE FUNCTION public.complete_seller_profile_asset_upload(
  p_seller_id uuid,
  p_asset_id uuid,
  p_verified_mime_type text,
  p_verified_size_bytes bigint
)
RETURNS SETOF public.seller_profile_assets
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_asset public.seller_profile_assets%ROWTYPE;
BEGIN
  SELECT asset.*
  INTO selected_asset
  FROM public.seller_profile_assets AS asset
  WHERE asset.id = p_asset_id
    AND asset.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'seller_profile_image_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF selected_asset.status = 'available' THEN
    RETURN NEXT selected_asset;
    RETURN;
  END IF;

  IF selected_asset.status <> 'pending' THEN
    RAISE EXCEPTION 'seller_profile_image_not_ready' USING ERRCODE = '55000';
  END IF;

  IF selected_asset.mime_type <> p_verified_mime_type
    OR selected_asset.size_bytes <> p_verified_size_bytes
  THEN
    RAISE EXCEPTION 'seller_profile_image_invalid' USING ERRCODE = '22023';
  END IF;

  UPDATE public.seller_profile_assets AS asset
  SET status = 'available', error_code = NULL, updated_at = now()
  WHERE asset.id = p_asset_id
    AND asset.seller_id = p_seller_id
  RETURNING asset.* INTO selected_asset;

  RETURN NEXT selected_asset;
END;
$$;

CREATE FUNCTION public.fail_seller_profile_asset_validation(
  p_seller_id uuid,
  p_asset_id uuid
)
RETURNS SETOF public.seller_profile_assets
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_asset public.seller_profile_assets%ROWTYPE;
BEGIN
  SELECT asset.*
  INTO selected_asset
  FROM public.seller_profile_assets AS asset
  WHERE asset.id = p_asset_id
    AND asset.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'seller_profile_image_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF selected_asset.status = 'pending' THEN
    UPDATE public.seller_profile_assets AS asset
    SET
      status = 'failed',
      error_code = 'seller_profile_image_invalid',
      updated_at = now()
    WHERE asset.id = p_asset_id
      AND asset.seller_id = p_seller_id
    RETURNING asset.* INTO selected_asset;
  ELSIF selected_asset.status <> 'failed'
    OR selected_asset.error_code <> 'seller_profile_image_invalid'
  THEN
    RAISE EXCEPTION 'seller_profile_image_not_ready' USING ERRCODE = '55000';
  END IF;

  RETURN NEXT selected_asset;
END;
$$;

CREATE FUNCTION public.begin_seller_profile_asset_removal(
  p_seller_id uuid,
  p_asset_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_asset public.seller_profile_assets%ROWTYPE;
BEGIN
  SELECT asset.*
  INTO selected_asset
  FROM public.seller_profile_assets AS asset
  WHERE asset.id = p_asset_id
    AND asset.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'seller_profile_image_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF selected_asset.status = 'deleted' THEN
    RETURN jsonb_build_object('result', 'deleted');
  END IF;

  IF EXISTS (
      SELECT 1
      FROM public.seller_profile_working_copies AS working_copy
      WHERE working_copy.seller_id = p_seller_id
        AND (
          working_copy.logo_asset_id = p_asset_id
          OR working_copy.cover_asset_id = p_asset_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.seller_profile_submissions AS submission
      WHERE submission.seller_id = p_seller_id
        AND (
          submission.logo_asset_id = p_asset_id
          OR submission.cover_asset_id = p_asset_id
        )
    )
  THEN
    RAISE EXCEPTION 'seller_profile_image_not_ready' USING ERRCODE = '55000';
  END IF;

  IF selected_asset.status = 'failed'
    AND selected_asset.error_code = 'seller_profile_image_cleanup_required'
  THEN
    RAISE EXCEPTION 'seller_profile_image_cleanup_required' USING ERRCODE = '55000';
  END IF;

  IF selected_asset.status <> 'deleting' THEN
    UPDATE public.seller_profile_assets AS asset
    SET status = 'deleting', error_code = NULL, updated_at = now()
    WHERE asset.id = p_asset_id
      AND asset.seller_id = p_seller_id
    RETURNING asset.* INTO selected_asset;
  END IF;

  RETURN jsonb_build_object(
    'result', 'deleting',
    'objectKey', selected_asset.object_key
  );
END;
$$;

CREATE FUNCTION public.complete_seller_profile_asset_removal(
  p_seller_id uuid,
  p_asset_id uuid
)
RETURNS SETOF public.seller_profile_assets
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_asset public.seller_profile_assets%ROWTYPE;
BEGIN
  SELECT asset.*
  INTO selected_asset
  FROM public.seller_profile_assets AS asset
  WHERE asset.id = p_asset_id
    AND asset.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'seller_profile_image_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF selected_asset.status = 'deleted' THEN
    RETURN NEXT selected_asset;
    RETURN;
  END IF;

  IF selected_asset.status <> 'deleting' THEN
    RAISE EXCEPTION 'seller_profile_image_not_ready' USING ERRCODE = '55000';
  END IF;

  UPDATE public.seller_profile_assets AS asset
  SET status = 'deleted', error_code = NULL, deleted_at = now(), updated_at = now()
  WHERE asset.id = p_asset_id
    AND asset.seller_id = p_seller_id
  RETURNING asset.* INTO selected_asset;

  RETURN NEXT selected_asset;
END;
$$;

CREATE FUNCTION public.fail_seller_profile_asset_removal(
  p_seller_id uuid,
  p_asset_id uuid
)
RETURNS SETOF public.seller_profile_assets
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_asset public.seller_profile_assets%ROWTYPE;
BEGIN
  SELECT asset.*
  INTO selected_asset
  FROM public.seller_profile_assets AS asset
  WHERE asset.id = p_asset_id
    AND asset.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'seller_profile_image_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF selected_asset.status = 'deleting' THEN
    UPDATE public.seller_profile_assets AS asset
    SET
      status = 'failed',
      error_code = 'seller_profile_image_cleanup_required',
      updated_at = now()
    WHERE asset.id = p_asset_id
      AND asset.seller_id = p_seller_id
    RETURNING asset.* INTO selected_asset;
  ELSIF selected_asset.status <> 'failed'
    OR selected_asset.error_code <> 'seller_profile_image_cleanup_required'
  THEN
    RAISE EXCEPTION 'seller_profile_image_not_ready' USING ERRCODE = '55000';
  END IF;

  RETURN NEXT selected_asset;
END;
$$;

CREATE FUNCTION public.claim_seller_profile_asset_cleanup_retry(
  p_seller_id uuid,
  p_asset_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_asset public.seller_profile_assets%ROWTYPE;
BEGIN
  SELECT asset.*
  INTO selected_asset
  FROM public.seller_profile_assets AS asset
  WHERE asset.id = p_asset_id
    AND asset.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'seller_profile_image_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF selected_asset.status <> 'failed'
    OR selected_asset.error_code <> 'seller_profile_image_cleanup_required'
  THEN
    RAISE EXCEPTION 'seller_profile_image_not_ready' USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
      SELECT 1
      FROM public.seller_profile_working_copies AS working_copy
      WHERE working_copy.seller_id = p_seller_id
        AND (
          working_copy.logo_asset_id = p_asset_id
          OR working_copy.cover_asset_id = p_asset_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.seller_profile_submissions AS submission
      WHERE submission.seller_id = p_seller_id
        AND (
          submission.logo_asset_id = p_asset_id
          OR submission.cover_asset_id = p_asset_id
        )
    )
  THEN
    RAISE EXCEPTION 'seller_profile_image_not_ready' USING ERRCODE = '55000';
  END IF;

  UPDATE public.seller_profile_assets AS asset
  SET status = 'deleting', error_code = NULL, updated_at = now()
  WHERE asset.id = p_asset_id
    AND asset.seller_id = p_seller_id
  RETURNING asset.* INTO selected_asset;

  RETURN jsonb_build_object(
    'result', 'deleting',
    'objectKey', selected_asset.object_key
  );
END;
$$;

CREATE FUNCTION public.read_public_seller_profile_asset(
  p_seller_id uuid,
  p_kind text,
  p_revision bigint
)
RETURNS SETOF public.seller_profile_assets
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT asset.*
  FROM public.sellers AS seller
  JOIN public.seller_profile_submissions AS submission
    ON submission.seller_id = seller.id
    AND submission.id = seller.approved_profile_submission_id
    AND submission.status = 'approved'
    AND submission.revision = p_revision
  JOIN public.seller_profile_assets AS asset
    ON asset.seller_id = seller.id
    AND asset.id = CASE p_kind
      WHEN 'logo' THEN submission.logo_asset_id
      WHEN 'cover' THEN submission.cover_asset_id
      ELSE NULL
    END
    AND asset.kind = p_kind
    AND asset.status = 'available'
  WHERE seller.id = p_seller_id
    AND seller.published = true;
$$;

CREATE FUNCTION public.save_seller_profile_working_copy(
  p_seller_id uuid,
  p_expected_revision bigint,
  p_name text,
  p_slug text,
  p_city text,
  p_country text,
  p_whatsapp text,
  p_email text,
  p_about text,
  p_established_year integer,
  p_logo_asset_id uuid,
  p_cover_asset_id uuid
)
RETURNS SETOF public.seller_profile_working_copies
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_working_copy public.seller_profile_working_copies%ROWTYPE;
  normalized_name text;
  normalized_slug text;
  normalized_city text;
  normalized_country text;
  normalized_whatsapp text;
  normalized_email text;
  normalized_about text;
BEGIN
  normalized_name := pg_catalog.btrim(coalesce(p_name, ''));
  normalized_slug := pg_catalog.btrim(coalesce(p_slug, ''));
  normalized_city := nullif(pg_catalog.btrim(coalesce(p_city, '')), '');
  normalized_country := nullif(pg_catalog.btrim(coalesce(p_country, '')), '');
  normalized_whatsapp := nullif(pg_catalog.btrim(coalesce(p_whatsapp, '')), '');
  normalized_email := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))), '');
  normalized_about := nullif(pg_catalog.btrim(coalesce(p_about, '')), '');

  IF p_seller_id IS NULL
    OR p_expected_revision IS NULL
    OR pg_catalog.char_length(normalized_name) NOT BETWEEN 2 AND 120
    OR pg_catalog.char_length(normalized_slug) NOT BETWEEN 2 AND 60
    OR normalized_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR (normalized_city IS NOT NULL AND pg_catalog.char_length(normalized_city) > 80)
    OR (normalized_country IS NOT NULL AND pg_catalog.char_length(normalized_country) > 80)
    OR (normalized_whatsapp IS NOT NULL AND pg_catalog.char_length(normalized_whatsapp) > 40)
    OR (
      normalized_email IS NOT NULL
      AND (
        pg_catalog.char_length(normalized_email) > 255
        OR normalized_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    )
    OR (normalized_about IS NOT NULL AND pg_catalog.char_length(normalized_about) > 4000)
    OR (p_established_year IS NOT NULL AND p_established_year NOT BETWEEN 1800 AND 2100)
  THEN
    RAISE EXCEPTION 'seller_approval_submission_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT working_copy.*
  INTO selected_working_copy
  FROM public.seller_profile_working_copies AS working_copy
  WHERE working_copy.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'seller_approval_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF selected_working_copy.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'seller_profile_revision_conflict' USING ERRCODE = '40001';
  END IF;

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

  UPDATE public.seller_profile_working_copies AS working_copy
  SET
    revision = working_copy.revision + 1,
    name = normalized_name,
    slug = normalized_slug,
    city = normalized_city,
    country = normalized_country,
    whatsapp = normalized_whatsapp,
    email = normalized_email,
    about = normalized_about,
    established_year = p_established_year,
    logo_asset_id = p_logo_asset_id,
    cover_asset_id = p_cover_asset_id,
    updated_at = now()
  WHERE working_copy.seller_id = p_seller_id
  RETURNING working_copy.* INTO selected_working_copy;

  RETURN NEXT selected_working_copy;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_seller_profile_asset_upload(
  uuid, text, text, text, bigint, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_seller_profile_asset_upload(
  uuid, uuid, text, bigint
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_seller_profile_asset_validation(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_seller_profile_asset_removal(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_seller_profile_asset_removal(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_seller_profile_asset_removal(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_seller_profile_asset_cleanup_retry(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_public_seller_profile_asset(uuid, text, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_seller_profile_working_copy(
  uuid, bigint, text, text, text, text, text, text, text, integer, uuid, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.prepare_seller_profile_asset_upload(
  uuid, text, text, text, bigint, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_seller_profile_asset_upload(
  uuid, uuid, text, bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_seller_profile_asset_validation(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_seller_profile_asset_removal(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_seller_profile_asset_removal(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_seller_profile_asset_removal(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_seller_profile_asset_cleanup_retry(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.read_public_seller_profile_asset(uuid, text, bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.save_seller_profile_working_copy(
  uuid, bigint, text, text, text, text, text, text, text, integer, uuid, uuid
) TO service_role;

COMMIT;
