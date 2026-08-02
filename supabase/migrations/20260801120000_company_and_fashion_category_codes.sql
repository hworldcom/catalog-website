BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

ALTER TABLE public.sellers
  ADD COLUMN company_code text,
  ADD COLUMN company_code_locked_at timestamptz;

CREATE FUNCTION public.derive_company_code_base(p_company_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  normalized_name text;
  middle_position integer;
BEGIN
  normalized_name := pg_catalog.upper(
    pg_catalog.regexp_replace(
      extensions.unaccent(normalize(coalesce(p_company_name, ''), NFKD)),
      '[^A-Za-z0-9]',
      '',
      'g'
    )
  );

  IF pg_catalog.char_length(normalized_name) < 3 THEN
    RETURN NULL;
  END IF;

  middle_position := ((pg_catalog.char_length(normalized_name) - 1) / 2) + 1;
  RETURN
    pg_catalog.substr(normalized_name, 1, 1)
    || pg_catalog.substr(normalized_name, middle_position, 1)
    || pg_catalog.substr(normalized_name, pg_catalog.char_length(normalized_name), 1);
END;
$$;

DO $$
DECLARE
  selected_seller record;
  company_base text;
  company_candidate text;
  company_suffix bigint;
BEGIN
  FOR selected_seller IN
    SELECT seller.id, seller.name
    FROM public.sellers AS seller
    ORDER BY seller.created_at, seller.id
  LOOP
    company_base := public.derive_company_code_base(selected_seller.name);
    IF company_base IS NULL THEN
      RAISE EXCEPTION 'seller_company_code_invalid'
        USING
          ERRCODE = '22023',
          DETAIL = 'seller_id=' || selected_seller.id::text;
    END IF;

    company_candidate := company_base;
    company_suffix := 1;

    WHILE EXISTS (
      SELECT 1
      FROM public.sellers AS seller
      WHERE seller.company_code = company_candidate
    ) LOOP
      company_suffix := CASE
        WHEN company_suffix = 1 THEN 2
        ELSE company_suffix + 1
      END;
      company_candidate := company_base || company_suffix::text;
    END LOOP;

    IF pg_catalog.char_length(company_candidate) > 10 THEN
      RAISE EXCEPTION 'seller_company_code_exhausted'
        USING
          ERRCODE = '22023',
          DETAIL = 'seller_id=' || selected_seller.id::text;
    END IF;

    UPDATE public.sellers AS seller
    SET company_code = company_candidate
    WHERE seller.id = selected_seller.id;
  END LOOP;
END;
$$;

DO $$
DECLARE
  duplicate_owner uuid;
BEGIN
  SELECT seller.owner_id
  INTO duplicate_owner
  FROM public.sellers AS seller
  WHERE seller.owner_id IS NOT NULL
  GROUP BY seller.owner_id
  HAVING pg_catalog.count(*) > 1
  ORDER BY seller.owner_id
  LIMIT 1;

  IF duplicate_owner IS NOT NULL THEN
    RAISE EXCEPTION 'seller_owner_not_unique'
      USING
        ERRCODE = '23505',
        DETAIL = 'owner_id=' || duplicate_owner::text;
  END IF;
END;
$$;

ALTER TABLE public.sellers
  ALTER COLUMN company_code SET NOT NULL,
  ADD CONSTRAINT sellers_company_code_format_check
    CHECK (
      company_code ~ '^[A-Z0-9]{3}[0-9]*$'
      AND pg_catalog.char_length(company_code) <= 10
    ),
  ADD CONSTRAINT sellers_company_code_unique UNIQUE (company_code);

CREATE UNIQUE INDEX sellers_owner_unique
  ON public.sellers (owner_id)
  WHERE owner_id IS NOT NULL;

ALTER TABLE public.categories
  ADD COLUMN parent_id uuid REFERENCES public.categories(id),
  ADD COLUMN product_code_prefix text;

UPDATE public.categories AS category
SET
  parent_id = NULL,
  product_code_prefix = 'F'
WHERE category.slug = 'fashion';

WITH fashion AS (
  SELECT category.id
  FROM public.categories AS category
  WHERE category.slug = 'fashion'
), mapping(slug, product_code_prefix) AS (
  VALUES
    ('t-shirts', 'TSH'),
    ('hoodies', 'HOD'),
    ('trousers', 'TRO'),
    ('jackets', 'JKT'),
    ('sportswear', 'SPW'),
    ('sweatshirts', 'SWS'),
    ('sweaters', 'SWE'),
    ('cardigans', 'CRD'),
    ('jeans', 'JNS'),
    ('shorts', 'SHT'),
    ('skirts', 'SKT'),
    ('leggings', 'LEG'),
    ('sweatpants', 'SWP'),
    ('dresses', 'DRS'),
    ('blazers', 'BLZ'),
    ('coats', 'COA'),
    ('vests', 'VST'),
    ('tracksuit-sets', 'TSS')
)
UPDATE public.categories AS category
SET
  parent_id = fashion.id,
  product_code_prefix = mapping.product_code_prefix
FROM fashion, mapping
WHERE category.slug = mapping.slug;

DO $$
DECLARE
  fashion_id uuid;
BEGIN
  SELECT category.id
  INTO fashion_id
  FROM public.categories AS category
  WHERE category.slug = 'fashion';

  IF fashion_id IS NULL THEN
    RAISE EXCEPTION 'fashion_category_missing' USING ERRCODE = '23514';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM public.categories AS category
    WHERE category.parent_id = fashion_id
      AND category.product_code_prefix IS NOT NULL
  ) <> 18 THEN
    RAISE EXCEPTION 'fashion_product_category_mapping_incomplete'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_parent_not_self_check
    CHECK (parent_id IS NULL OR parent_id <> id),
  ADD CONSTRAINT categories_product_code_prefix_format_check
    CHECK (
      product_code_prefix IS NULL
      OR (
        parent_id IS NULL
        AND product_code_prefix ~ '^[A-Z0-9]{1,4}$'
      )
      OR (
        parent_id IS NOT NULL
        AND product_code_prefix ~ '^[A-Z0-9]{2,4}$'
      )
    );

CREATE UNIQUE INDEX categories_root_product_code_prefix_unique
  ON public.categories (product_code_prefix)
  WHERE parent_id IS NULL AND product_code_prefix IS NOT NULL;

CREATE UNIQUE INDEX categories_child_product_code_prefix_unique
  ON public.categories (parent_id, product_code_prefix)
  WHERE parent_id IS NOT NULL AND product_code_prefix IS NOT NULL;

CREATE INDEX categories_parent_sort_order
  ON public.categories (parent_id, sort_order, id)
  WHERE parent_id IS NOT NULL;

CREATE FUNCTION public.enforce_seller_company_code_immutability()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.company_code_locked_at IS NOT NULL
    AND (
      NEW.company_code IS DISTINCT FROM OLD.company_code
      OR NEW.company_code_locked_at IS DISTINCT FROM OLD.company_code_locked_at
    )
  THEN
    RAISE EXCEPTION 'seller_company_code_locked' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sellers_company_code_immutable
  BEFORE UPDATE OF company_code, company_code_locked_at ON public.sellers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seller_company_code_immutability();

CREATE FUNCTION public.enforce_category_code_immutability()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.product_code_prefix IS NOT NULL
    AND (
      NEW.product_code_prefix IS DISTINCT FROM OLD.product_code_prefix
      OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
    )
  THEN
    RAISE EXCEPTION 'category_code_immutable' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_categories_code_immutable
  BEFORE UPDATE OF parent_id, product_code_prefix ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.enforce_category_code_immutability();

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
  normalized_name text;
  normalized_slug_base text;
  slug_candidate text;
  slug_suffix integer;
  company_base text;
  company_candidate text;
  company_suffix bigint;
  company_is_automatic boolean;
BEGIN
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'seller_onboarding_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('seller-owner:' || p_owner_id::text, 0)
  );

  SELECT seller.*
  INTO selected_seller
  FROM public.sellers AS seller
  WHERE seller.owner_id = p_owner_id;

  IF FOUND THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_owner_id, 'seller')
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN NEXT selected_seller;
    RETURN;
  END IF;

  normalized_name := pg_catalog.btrim(coalesce(p_name, ''));
  normalized_slug_base := pg_catalog.btrim(coalesce(p_slug_base, ''));
  company_base := public.derive_company_code_base(normalized_name);
  company_candidate := pg_catalog.upper(
    pg_catalog.btrim(coalesce(p_submitted_company_code, ''))
  );

  IF pg_catalog.char_length(normalized_name) < 2
    OR pg_catalog.char_length(normalized_name) > 120
    OR normalized_slug_base !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR pg_catalog.char_length(normalized_slug_base) > 60
  THEN
    RAISE EXCEPTION 'seller_onboarding_invalid' USING ERRCODE = '22023';
  END IF;

  IF company_candidate !~ '^[A-Z0-9]{3}[0-9]*$'
    OR pg_catalog.char_length(company_candidate) > 10
  THEN
    RAISE EXCEPTION 'seller_company_code_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_city IS NOT NULL AND pg_catalog.char_length(p_city) > 80
    OR p_country IS NOT NULL AND pg_catalog.char_length(p_country) > 80
    OR p_whatsapp IS NOT NULL AND pg_catalog.char_length(p_whatsapp) > 40
  THEN
    RAISE EXCEPTION 'seller_onboarding_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_primary_category_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.categories AS category
      WHERE category.id = p_primary_category_id
        AND category.slug = 'fashion'
        AND category.parent_id IS NULL
    )
  THEN
    RAISE EXCEPTION 'seller_business_category_not_supported' USING ERRCODE = '22023';
  END IF;

  company_is_automatic := company_base IS NOT NULL AND company_candidate = company_base;

  IF company_is_automatic THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('seller-company-code:' || company_base, 0)
    );

    SELECT pg_catalog.max(
      CASE
        WHEN seller.company_code = company_base THEN 1::bigint
        ELSE pg_catalog.substr(
          seller.company_code,
          pg_catalog.char_length(company_base) + 1
        )::bigint
      END
    )
    INTO company_suffix
    FROM public.sellers AS seller
    WHERE seller.company_code = company_base
      OR seller.company_code ~ ('^' || company_base || '[0-9]+$');

    IF company_suffix IS NULL THEN
      company_candidate := company_base;
    ELSE
      company_suffix := greatest(company_suffix + 1, 2);
      company_candidate := company_base || company_suffix::text;
    END IF;

    IF pg_catalog.char_length(company_candidate) > 10 THEN
      RAISE EXCEPTION 'seller_company_code_exhausted' USING ERRCODE = '22023';
    END IF;
  ELSIF EXISTS (
    SELECT 1
    FROM public.sellers AS seller
    WHERE seller.company_code = company_candidate
  ) THEN
    RAISE EXCEPTION 'seller_company_code_taken' USING ERRCODE = '23505';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('seller-slug:' || normalized_slug_base, 0)
  );

  slug_candidate := normalized_slug_base;
  slug_suffix := 1;
  WHILE EXISTS (
    SELECT 1
    FROM public.sellers AS seller
    WHERE seller.slug = slug_candidate
  ) LOOP
    slug_suffix := slug_suffix + 1;
    IF slug_suffix > 200 THEN
      RAISE EXCEPTION 'seller_slug_allocation_failed' USING ERRCODE = '23505';
    END IF;
    slug_candidate := normalized_slug_base || '-' || slug_suffix::text;
  END LOOP;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_owner_id, 'seller')
  ON CONFLICT (user_id, role) DO NOTHING;

  BEGIN
    INSERT INTO public.sellers (
      owner_id,
      name,
      slug,
      city,
      country,
      primary_category_id,
      whatsapp,
      published,
      company_code
    )
    VALUES (
      p_owner_id,
      normalized_name,
      slug_candidate,
      nullif(pg_catalog.btrim(coalesce(p_city, '')), ''),
      nullif(pg_catalog.btrim(coalesce(p_country, '')), ''),
      p_primary_category_id,
      nullif(pg_catalog.btrim(coalesce(p_whatsapp, '')), ''),
      false,
      company_candidate
    )
    RETURNING * INTO selected_seller;
  EXCEPTION
    WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1
        FROM public.sellers AS seller
        WHERE seller.company_code = company_candidate
      ) THEN
        RAISE EXCEPTION 'seller_company_code_taken' USING ERRCODE = '23505';
      END IF;
      RAISE;
  END;

  RETURN NEXT selected_seller;
END;
$$;

CREATE FUNCTION public.update_unlocked_seller_company_code(
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
  company_candidate text;
BEGIN
  company_candidate := pg_catalog.upper(
    pg_catalog.btrim(coalesce(p_submitted_company_code, ''))
  );

  IF company_candidate !~ '^[A-Z0-9]{3}[0-9]*$'
    OR pg_catalog.char_length(company_candidate) > 10
  THEN
    RAISE EXCEPTION 'seller_company_code_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT seller.*
  INTO selected_seller
  FROM public.sellers AS seller
  WHERE seller.owner_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'seller_company_code_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF selected_seller.company_code_locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'seller_company_code_locked' USING ERRCODE = '23514';
  END IF;

  IF selected_seller.company_code = company_candidate THEN
    RETURN NEXT selected_seller;
    RETURN;
  END IF;

  BEGIN
    UPDATE public.sellers AS seller
    SET company_code = company_candidate
    WHERE seller.id = selected_seller.id
    RETURNING * INTO selected_seller;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'seller_company_code_taken' USING ERRCODE = '23505';
  END;

  RETURN NEXT selected_seller;
END;
$$;

REVOKE INSERT ON public.sellers FROM authenticated;
REVOKE UPDATE ON public.sellers FROM authenticated;
GRANT UPDATE (
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
) ON public.sellers TO authenticated;

REVOKE ALL ON FUNCTION public.derive_company_code_base(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.derive_company_code_base(text)
  TO service_role;

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

REVOKE ALL ON FUNCTION public.update_unlocked_seller_company_code(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_unlocked_seller_company_code(text)
  TO authenticated;

COMMIT;
