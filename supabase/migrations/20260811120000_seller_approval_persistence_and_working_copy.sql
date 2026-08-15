BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sellers)
    OR EXISTS (SELECT 1 FROM public.products)
  THEN
    RAISE EXCEPTION 'seller_moderation_fresh_start_required'
      USING
        ERRCODE = '55000',
        DETAIL = 'Reset pre-moderation seller and product data before applying ticket 0040.';
  END IF;
END;
$$;

ALTER TABLE public.sellers
  ADD COLUMN approved_profile_submission_id uuid,
  ADD COLUMN storefront_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.sellers
  ALTER COLUMN published SET DEFAULT false;

CREATE TABLE public.seller_profile_working_copies (
  seller_id uuid PRIMARY KEY REFERENCES public.sellers(id) ON DELETE RESTRICT,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  name text NOT NULL,
  slug text NOT NULL,
  city text,
  country text,
  whatsapp text,
  email text,
  about text,
  logo_asset_id uuid,
  cover_asset_id uuid,
  established_year integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_profile_working_copies_name_check
    CHECK (pg_catalog.char_length(name) BETWEEN 2 AND 120),
  CONSTRAINT seller_profile_working_copies_slug_check
    CHECK (
      pg_catalog.char_length(slug) BETWEEN 2 AND 60
      AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  CONSTRAINT seller_profile_working_copies_city_check
    CHECK (city IS NULL OR pg_catalog.char_length(city) <= 80),
  CONSTRAINT seller_profile_working_copies_country_check
    CHECK (country IS NULL OR pg_catalog.char_length(country) <= 80),
  CONSTRAINT seller_profile_working_copies_whatsapp_check
    CHECK (whatsapp IS NULL OR pg_catalog.char_length(whatsapp) <= 40),
  CONSTRAINT seller_profile_working_copies_email_check
    CHECK (
      email IS NULL
      OR (
        pg_catalog.char_length(email) <= 255
        AND email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),
  CONSTRAINT seller_profile_working_copies_about_check
    CHECK (about IS NULL OR pg_catalog.char_length(about) <= 4000),
  CONSTRAINT seller_profile_working_copies_established_year_check
    CHECK (established_year IS NULL OR established_year BETWEEN 1800 AND 2100)
);

CREATE TABLE public.seller_profile_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE RESTRICT,
  revision bigint NOT NULL CHECK (revision > 0),
  submission_kind text NOT NULL CHECK (submission_kind IN ('initial', 'update')),
  status text NOT NULL CHECK (
    status IN ('pending', 'changes_requested', 'approved', 'rejected', 'withdrawn')
  ),
  name text NOT NULL,
  slug text NOT NULL,
  city text,
  country text,
  whatsapp text,
  email text,
  about text,
  logo_asset_id uuid,
  cover_asset_id uuid,
  established_year integer,
  seller_request_id uuid NOT NULL,
  submitted_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  administrator_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  decision_request_id uuid,
  seller_visible_reason text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_profile_submissions_seller_id_id_unique UNIQUE (seller_id, id),
  CONSTRAINT seller_profile_submissions_revision_unique UNIQUE (seller_id, revision),
  CONSTRAINT seller_profile_submissions_request_unique UNIQUE (seller_id, seller_request_id),
  CONSTRAINT seller_profile_submissions_name_check
    CHECK (pg_catalog.char_length(name) BETWEEN 2 AND 120),
  CONSTRAINT seller_profile_submissions_slug_check
    CHECK (
      pg_catalog.char_length(slug) BETWEEN 2 AND 60
      AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  CONSTRAINT seller_profile_submissions_city_check
    CHECK (city IS NULL OR pg_catalog.char_length(city) <= 80),
  CONSTRAINT seller_profile_submissions_country_check
    CHECK (country IS NULL OR pg_catalog.char_length(country) <= 80),
  CONSTRAINT seller_profile_submissions_whatsapp_check
    CHECK (whatsapp IS NULL OR pg_catalog.char_length(whatsapp) <= 40),
  CONSTRAINT seller_profile_submissions_email_check
    CHECK (
      email IS NULL
      OR (
        pg_catalog.char_length(email) <= 255
        AND email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),
  CONSTRAINT seller_profile_submissions_about_check
    CHECK (about IS NULL OR pg_catalog.char_length(about) <= 4000),
  CONSTRAINT seller_profile_submissions_established_year_check
    CHECK (established_year IS NULL OR established_year BETWEEN 1800 AND 2100),
  CONSTRAINT seller_profile_submissions_reason_check
    CHECK (seller_visible_reason IS NULL OR pg_catalog.char_length(seller_visible_reason) <= 4000),
  CONSTRAINT seller_profile_submissions_decision_metadata_check
    CHECK (
      (status = 'pending' AND administrator_user_id IS NULL AND decision_request_id IS NULL
        AND seller_visible_reason IS NULL AND decided_at IS NULL)
      OR status = 'withdrawn'
      OR (status IN ('changes_requested', 'approved', 'rejected')
        AND administrator_user_id IS NOT NULL
        AND decision_request_id IS NOT NULL
        AND decided_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX seller_profile_submissions_one_pending_per_seller
  ON public.seller_profile_submissions (seller_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX seller_profile_submissions_decision_request_unique
  ON public.seller_profile_submissions (
    administrator_user_id,
    seller_id,
    decision_request_id
  )
  WHERE decision_request_id IS NOT NULL;

CREATE TABLE public.seller_profile_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE RESTRICT,
  submission_id uuid,
  event_type text NOT NULL CHECK (
    event_type IN (
      'submitted',
      'withdrawn',
      'approved',
      'changes_requested',
      'rejected',
      'storefront_enabled',
      'storefront_disabled'
    )
  ),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  seller_visible_reason text,
  storefront_enabled boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_profile_events_submission_fkey
    FOREIGN KEY (seller_id, submission_id)
    REFERENCES public.seller_profile_submissions(seller_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT seller_profile_events_request_unique
    UNIQUE (actor_user_id, seller_id, event_type, request_id),
  CONSTRAINT seller_profile_events_reason_check
    CHECK (seller_visible_reason IS NULL OR pg_catalog.char_length(seller_visible_reason) <= 4000),
  CONSTRAINT seller_profile_events_shape_check
    CHECK (
      (event_type IN ('submitted', 'withdrawn', 'approved', 'changes_requested', 'rejected')
        AND submission_id IS NOT NULL
        AND storefront_enabled IS NULL)
      OR (event_type IN ('storefront_enabled', 'storefront_disabled')
        AND submission_id IS NULL
        AND storefront_enabled IS NOT NULL)
    )
);

CREATE TABLE public.seller_slug_aliases (
  slug text PRIMARY KEY,
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_slug_aliases_slug_check
    CHECK (
      pg_catalog.char_length(slug) BETWEEN 2 AND 60
      AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    )
);

ALTER TABLE public.sellers
  ADD CONSTRAINT sellers_approved_profile_submission_fkey
  FOREIGN KEY (id, approved_profile_submission_id)
  REFERENCES public.seller_profile_submissions(seller_id, id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION public.maintain_seller_published_projection()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.published := NEW.approved_profile_submission_id IS NOT NULL
    AND NEW.storefront_enabled;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sellers_00_published_projection
  BEFORE INSERT OR UPDATE OF approved_profile_submission_id, storefront_enabled, published
  ON public.sellers
  FOR EACH ROW EXECUTE FUNCTION public.maintain_seller_published_projection();

CREATE FUNCTION public.enforce_seller_profile_submission_snapshot_immutability()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'seller_profile_submission_immutable' USING ERRCODE = '23514';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
    OR NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW.submission_kind IS DISTINCT FROM OLD.submission_kind
    OR NEW.name IS DISTINCT FROM OLD.name
    OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.city IS DISTINCT FROM OLD.city
    OR NEW.country IS DISTINCT FROM OLD.country
    OR NEW.whatsapp IS DISTINCT FROM OLD.whatsapp
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.about IS DISTINCT FROM OLD.about
    OR NEW.logo_asset_id IS DISTINCT FROM OLD.logo_asset_id
    OR NEW.cover_asset_id IS DISTINCT FROM OLD.cover_asset_id
    OR NEW.established_year IS DISTINCT FROM OLD.established_year
    OR NEW.seller_request_id IS DISTINCT FROM OLD.seller_request_id
    OR NEW.submitted_by_user_id IS DISTINCT FROM OLD.submitted_by_user_id
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'seller_profile_submission_immutable' USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seller_profile_submissions_immutable
  BEFORE UPDATE OR DELETE ON public.seller_profile_submissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seller_profile_submission_snapshot_immutability();

ALTER TABLE public.seller_profile_working_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_profile_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_profile_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_slug_aliases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.seller_profile_working_copies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.seller_profile_submissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.seller_profile_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.seller_slug_aliases FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.seller_profile_working_copies TO service_role;
GRANT ALL ON public.seller_profile_submissions TO service_role;
GRANT ALL ON public.seller_profile_events TO service_role;
GRANT ALL ON public.seller_slug_aliases TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.sellers FROM authenticated;
REVOKE UPDATE (
  slug,
  name,
  city,
  country,
  whatsapp,
  email,
  published,
  about,
  cover_image_url,
  logo_url,
  established_year,
  primary_category_id
) ON public.sellers FROM authenticated;

DROP POLICY IF EXISTS "Sellers: owner can insert own" ON public.sellers;
DROP POLICY IF EXISTS "Sellers: owner can update own" ON public.sellers;
DROP POLICY IF EXISTS "Sellers: owner can delete own" ON public.sellers;

ALTER FUNCTION public.create_seller_with_company_code(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text
) RENAME TO create_seller_with_company_code_0040a1_legacy;

CREATE FUNCTION public.create_seller_with_company_code(
  p_owner_id uuid,
  p_name text,
  p_slug_base text,
  p_city text,
  p_country text,
  p_primary_category_id uuid,
  p_whatsapp text,
  p_submitted_company_code text
)
RETURNS SETOF public.sellers
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_seller public.sellers%ROWTYPE;
BEGIN
  SELECT seller.*
  INTO selected_seller
  FROM public.create_seller_with_company_code_0040a1_legacy(
    p_owner_id,
    p_name,
    p_slug_base,
    p_city,
    p_country,
    p_primary_category_id,
    p_whatsapp,
    p_submitted_company_code
  ) AS seller;

  IF selected_seller.id IS NULL THEN
    RAISE EXCEPTION 'seller_onboarding_unavailable' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.seller_profile_working_copies (
    seller_id,
    revision,
    name,
    slug,
    city,
    country,
    whatsapp,
    email,
    about,
    logo_asset_id,
    cover_asset_id,
    established_year
  )
  VALUES (
    selected_seller.id,
    1,
    selected_seller.name,
    selected_seller.slug,
    selected_seller.city,
    selected_seller.country,
    selected_seller.whatsapp,
    selected_seller.email,
    selected_seller.about,
    NULL,
    NULL,
    selected_seller.established_year
  )
  ON CONFLICT (seller_id) DO NOTHING;

  RETURN NEXT selected_seller;
END;
$$;

CREATE FUNCTION public.read_seller_profile_working_copy(p_seller_id uuid)
RETURNS SETOF public.seller_profile_working_copies
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_working_copy public.seller_profile_working_copies%ROWTYPE;
BEGIN
  SELECT working_copy.*
  INTO selected_working_copy
  FROM public.seller_profile_working_copies AS working_copy
  WHERE working_copy.seller_id = p_seller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'seller_approval_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN NEXT selected_working_copy;
END;
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
  p_established_year integer
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
    updated_at = now()
  WHERE working_copy.seller_id = p_seller_id
  RETURNING working_copy.* INTO selected_working_copy;

  RETURN NEXT selected_working_copy;
END;
$$;

REVOKE ALL ON FUNCTION public.maintain_seller_published_projection()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_seller_profile_submission_snapshot_immutability()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_seller_with_company_code_0040a1_legacy(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_seller_with_company_code(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_seller_profile_working_copy(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_seller_profile_working_copy(
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_seller_with_company_code(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_seller_profile_working_copy(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.save_seller_profile_working_copy(
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer
) TO service_role;

COMMIT;
