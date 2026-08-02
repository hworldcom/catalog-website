BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE object.bucket_id IN ('product-images', 'product-draft-images')
  ) THEN
    RAISE EXCEPTION 'product_data_reset_storage_not_empty' USING ERRCODE = '55000';
  END IF;
END;
$$;

DELETE FROM public.leads;
DELETE FROM public.product_image_publication_items;
DELETE FROM public.product_image_publication_runs;
DELETE FROM public.delegated_administrator_action_attempts;
DELETE FROM public.product_image_publication_cutover_changes;
DELETE FROM public.product_draft_image_promotions;
DELETE FROM public.product_draft_image_storage_reconciliations;
DELETE FROM public.product_draft_image_storage_cutovers;
DELETE FROM public.product_images;
DELETE FROM public.product_draft_images;
DELETE FROM public.product_draft_descriptions;
DELETE FROM public.product_draft_facts;
DELETE FROM public.product_draft_source_memberships;
DELETE FROM public.classifier_import_group_outcomes;
DELETE FROM public.classifier_import_runs;
DELETE FROM public.seller_classifier_batches;
DELETE FROM public.products;

DO $$
DECLARE
  relation_name text;
  remaining_count bigint;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'leads',
    'delegated_administrator_action_attempts',
    'product_image_publication_items',
    'product_image_publication_runs',
    'product_image_publication_cutover_changes',
    'product_draft_image_promotions',
    'product_draft_image_storage_reconciliations',
    'product_draft_image_storage_cutovers',
    'product_images',
    'product_draft_images',
    'product_draft_descriptions',
    'product_draft_facts',
    'product_draft_source_memberships',
    'classifier_import_group_outcomes',
    'classifier_import_runs',
    'seller_classifier_batches',
    'products'
  ]
  LOOP
    EXECUTE pg_catalog.format('SELECT count(*) FROM public.%I', relation_name)
      INTO remaining_count;
    IF remaining_count <> 0 THEN
      RAISE EXCEPTION 'product_data_reset_incomplete'
        USING DETAIL = relation_name || '=' || remaining_count::text;
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  fashion_id uuid;
BEGIN
  SELECT category.id
  INTO fashion_id
  FROM public.categories AS category
  WHERE category.slug = 'fashion'
    AND category.parent_id IS NULL
    AND category.product_code_prefix = 'F';

  IF fashion_id IS NULL THEN
    RAISE EXCEPTION 'fashion_category_missing' USING ERRCODE = '23514';
  END IF;

  UPDATE public.sellers AS seller
  SET primary_category_id = fashion_id
  WHERE seller.primary_category_id IS DISTINCT FROM fashion_id;

  DELETE FROM public.categories AS category
  WHERE category.slug NOT IN (
    'fashion',
    't-shirts',
    'hoodies',
    'trousers',
    'jackets',
    'sportswear',
    'sweatshirts',
    'sweaters',
    'cardigans',
    'jeans',
    'shorts',
    'skirts',
    'leggings',
    'sweatpants',
    'dresses',
    'blazers',
    'coats',
    'vests',
    'tracksuit-sets'
  );

  IF (SELECT pg_catalog.count(*) FROM public.categories) <> 19
    OR (
      SELECT pg_catalog.count(*)
      FROM public.categories AS category
      WHERE category.parent_id = fashion_id
        AND category.product_code_prefix ~ '^[A-Z0-9]{2,4}$'
    ) <> 18
  THEN
    RAISE EXCEPTION 'fashion_product_category_mapping_incomplete'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE public.products
  ADD COLUMN product_code text;

CREATE TABLE public.product_code_allocations (
  product_code text PRIMARY KEY,
  product_id uuid UNIQUE NOT NULL,
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE RESTRICT,
  company_code_snapshot text NOT NULL,
  catalog_category_code_snapshot text NOT NULL,
  product_category_code_snapshot text NOT NULL,
  allocated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT product_code_allocations_identity_unique
    UNIQUE (product_code, product_id, seller_id),
  CONSTRAINT product_code_allocations_company_snapshot_check
    CHECK (
      company_code_snapshot ~ '^[A-Z0-9]{3}[0-9]*$'
      AND pg_catalog.char_length(company_code_snapshot) <= 10
    ),
  CONSTRAINT product_code_allocations_catalog_snapshot_check
    CHECK (catalog_category_code_snapshot ~ '^[A-Z0-9]{1,4}$'),
  CONSTRAINT product_code_allocations_product_snapshot_check
    CHECK (product_category_code_snapshot ~ '^[A-Z0-9]{2,4}$'),
  CONSTRAINT product_code_allocations_format_check
    CHECK (
      product_code ~
        '^[A-Z0-9]{3,10}-[A-Z0-9]{1,4}-[A-Z0-9]{2,4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'
    )
);

ALTER TABLE public.product_code_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_code_allocations
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.products
  DROP CONSTRAINT products_category_id_fkey,
  ALTER COLUMN category_id SET NOT NULL,
  ALTER COLUMN product_code SET NOT NULL,
  ADD CONSTRAINT products_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT,
  ADD CONSTRAINT products_product_code_unique UNIQUE (product_code),
  ADD CONSTRAINT products_product_code_format_check
    CHECK (
      product_code ~
        '^[A-Z0-9]{3,10}-[A-Z0-9]{1,4}-[A-Z0-9]{2,4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'
    ),
  ADD CONSTRAINT products_product_code_allocation_fkey
    FOREIGN KEY (product_code, id, seller_id)
    REFERENCES public.product_code_allocations(product_code, product_id, seller_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT;

CREATE FUNCTION public.reserve_product_code(
  p_product_id uuid,
  p_seller_id uuid,
  p_product_category_id uuid
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_seller public.sellers%ROWTYPE;
  product_category public.categories%ROWTYPE;
  catalog_category public.categories%ROWTYPE;
  candidate_suffix text;
  candidate_code text;
  random_bytes bytea;
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  attempt integer;
BEGIN
  IF p_product_id IS NULL OR p_seller_id IS NULL THEN
    RAISE EXCEPTION 'product_code_allocation_failed' USING ERRCODE = '55000';
  END IF;
  IF p_product_category_id IS NULL THEN
    RAISE EXCEPTION 'product_category_required' USING ERRCODE = '22023';
  END IF;

  SELECT seller.*
  INTO selected_seller
  FROM public.sellers AS seller
  WHERE seller.id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND
    OR selected_seller.company_code IS NULL
    OR selected_seller.company_code !~ '^[A-Z0-9]{3}[0-9]*$'
    OR pg_catalog.char_length(selected_seller.company_code) > 10
  THEN
    RAISE EXCEPTION 'product_code_company_unconfigured' USING ERRCODE = '23514';
  END IF;

  SELECT category.*
  INTO product_category
  FROM public.categories AS category
  WHERE category.id = p_product_category_id;

  IF NOT FOUND OR product_category.parent_id IS NULL THEN
    RAISE EXCEPTION 'product_category_not_supported' USING ERRCODE = '22023';
  END IF;

  SELECT category.*
  INTO catalog_category
  FROM public.categories AS category
  WHERE category.id = product_category.parent_id;

  IF NOT FOUND OR catalog_category.slug <> 'fashion' OR catalog_category.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'product_category_not_supported' USING ERRCODE = '22023';
  END IF;
  IF catalog_category.product_code_prefix !~ '^[A-Z0-9]{1,4}$'
    OR product_category.product_code_prefix !~ '^[A-Z0-9]{2,4}$'
  THEN
    RAISE EXCEPTION 'product_code_category_unconfigured' USING ERRCODE = '23514';
  END IF;

  FOR attempt IN 1..5 LOOP
    random_bytes := extensions.gen_random_bytes(8);
    candidate_suffix := '';
    FOR byte_index IN 0..7 LOOP
      candidate_suffix := candidate_suffix || pg_catalog.substr(
        alphabet,
        (pg_catalog.get_byte(random_bytes, byte_index) % 32) + 1,
        1
      );
    END LOOP;
    candidate_code := selected_seller.company_code
      || '-' || catalog_category.product_code_prefix
      || '-' || product_category.product_code_prefix
      || '-' || candidate_suffix;

    INSERT INTO public.product_code_allocations (
      product_code,
      product_id,
      seller_id,
      company_code_snapshot,
      catalog_category_code_snapshot,
      product_category_code_snapshot
    )
    VALUES (
      candidate_code,
      p_product_id,
      p_seller_id,
      selected_seller.company_code,
      catalog_category.product_code_prefix,
      product_category.product_code_prefix
    )
    ON CONFLICT (product_code) DO NOTHING;

    IF FOUND THEN
      UPDATE public.sellers AS seller
      SET company_code_locked_at = coalesce(
        seller.company_code_locked_at,
        pg_catalog.now()
      )
      WHERE seller.id = p_seller_id;
      RETURN candidate_code;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'product_code_allocation_failed' USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_product_code(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.enforce_product_category_boundary()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.category_id IS NULL THEN
    RAISE EXCEPTION 'product_category_required' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.categories AS product_category
    JOIN public.categories AS catalog_category
      ON catalog_category.id = product_category.parent_id
    WHERE product_category.id = NEW.category_id
      AND product_category.product_code_prefix ~ '^[A-Z0-9]{2,4}$'
      AND catalog_category.slug = 'fashion'
      AND catalog_category.parent_id IS NULL
      AND catalog_category.product_code_prefix = 'F'
  ) THEN
    RAISE EXCEPTION 'product_category_not_supported' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_01_category_boundary
  BEFORE INSERT OR UPDATE OF category_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_category_boundary();

CREATE FUNCTION public.enforce_product_code_immutability()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.product_code IS DISTINCT FROM OLD.product_code THEN
    RAISE EXCEPTION 'product_code_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_02_code_immutable
  BEFORE UPDATE OF product_code ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_code_immutability();

REVOKE INSERT ON public.products FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.save_seller_product_with_description(
  uuid,
  uuid,
  boolean,
  text,
  boolean,
  text,
  uuid,
  integer,
  text,
  numeric,
  text,
  public.stock_status,
  boolean,
  text,
  boolean,
  public.product_status
) RENAME TO save_seller_product_with_description_0028b1_legacy;

REVOKE ALL ON FUNCTION public.save_seller_product_with_description_0028b1_legacy(
  uuid,
  uuid,
  boolean,
  text,
  boolean,
  text,
  uuid,
  integer,
  text,
  numeric,
  text,
  public.stock_status,
  boolean,
  text,
  boolean,
  public.product_status
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_seller_product_with_description(
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
  p_trending boolean,
  p_status public.product_status
)
RETURNS TABLE (
  result text,
  product_draft_id uuid,
  product_code text,
  title text,
  title_source text,
  product_status public.product_status,
  english_description text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product_id uuid;
  selected_product_code text;
  normalized_title text;
  save_result record;
  stable_error text;
BEGIN
  IF p_seller_id IS NULL THEN
    RETURN QUERY SELECT
      'product_code_company_unconfigured'::text,
      NULL::uuid,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::public.product_status,
      NULL::text;
    RETURN;
  END IF;
  IF p_category_id IS NULL THEN
    RETURN QUERY SELECT
      'product_category_required'::text,
      NULL::uuid,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::public.product_status,
      NULL::text;
    RETURN;
  END IF;
  IF NOT coalesce(p_title_patch_present, false)
    OR p_status NOT IN ('draft', 'published')
  THEN
    RETURN QUERY SELECT
      'title_invalid'::text,
      NULL::uuid,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::public.product_status,
      NULL::text;
    RETURN;
  END IF;

  normalized_title := pg_catalog.btrim(
    pg_catalog.regexp_replace(coalesce(p_title, ''), '[[:space:]]+', ' ', 'g')
  );
  IF p_status = 'published' AND normalized_title = '' THEN
    RETURN QUERY SELECT
      'title_required'::text,
      NULL::uuid,
      NULL::text,
      normalized_title,
      NULL::text,
      NULL::public.product_status,
      NULL::text;
    RETURN;
  END IF;
  IF pg_catalog.char_length(normalized_title) > 120 THEN
    RETURN QUERY SELECT
      'title_invalid'::text,
      NULL::uuid,
      NULL::text,
      normalized_title,
      NULL::text,
      NULL::public.product_status,
      NULL::text;
    RETURN;
  END IF;
  IF p_status = 'published'
    AND (
      NOT coalesce(p_cover_image_url_patch_present, false)
      OR NULLIF(pg_catalog.btrim(coalesce(p_cover_image_url, '')), '') IS NULL
    )
  THEN
    RAISE EXCEPTION 'product_publication_not_allowed'
      USING ERRCODE = '23514';
  END IF;

  BEGIN
    selected_product_id := pg_catalog.gen_random_uuid();
    selected_product_code := public.reserve_product_code(
      selected_product_id,
      p_seller_id,
      p_category_id
    );

    INSERT INTO public.products (
      id,
      seller_id,
      category_id,
      product_code,
      title,
      title_source,
      description,
      moq,
      pack_size,
      price,
      currency,
      stock,
      status,
      cover_image_url,
      trending
    )
    VALUES (
      selected_product_id,
      p_seller_id,
      p_category_id,
      selected_product_code,
      normalized_title,
      CASE WHEN normalized_title = '' THEN NULL ELSE 'human' END,
      NULL,
      p_moq,
      p_pack_size,
      p_price,
      p_currency,
      p_stock,
      'draft',
      CASE
        WHEN coalesce(p_cover_image_url_patch_present, false)
          THEN p_cover_image_url
        ELSE NULL
      END,
      p_trending
    );

    SELECT *
    INTO save_result
    FROM public.save_seller_product_with_description_0028b1_legacy(
      selected_product_id,
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
      p_trending,
      p_status
    );
  EXCEPTION
    WHEN OTHERS THEN
      stable_error := SQLERRM;
      IF stable_error NOT IN (
        'product_category_required',
        'product_category_not_supported',
        'product_code_company_unconfigured',
        'product_code_category_unconfigured',
        'product_code_allocation_failed'
      ) THEN
        RAISE;
      END IF;
  END;

  IF stable_error IS NOT NULL THEN
    RETURN QUERY SELECT
      stable_error,
      NULL::uuid,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::public.product_status,
      NULL::text;
    RETURN;
  END IF;
  IF save_result.result <> 'updated' THEN
    RETURN QUERY SELECT
      save_result.result::text,
      save_result.product_draft_id::uuid,
      selected_product_code,
      save_result.title::text,
      save_result.title_source::text,
      save_result.product_status::public.product_status,
      save_result.english_description::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    'created'::text,
    save_result.product_draft_id::uuid,
    selected_product_code,
    save_result.title::text,
    save_result.title_source::text,
    save_result.product_status::public.product_status,
    save_result.english_description::text;
END;
$$;

CREATE FUNCTION public.save_seller_product_with_description(
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
  p_trending boolean,
  p_status public.product_status
)
RETURNS TABLE (
  result text,
  product_draft_id uuid,
  title text,
  title_source text,
  product_status public.product_status,
  english_description text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_product_draft_id IS NULL THEN
    RETURN QUERY
    SELECT
      created.result,
      created.product_draft_id,
      created.title,
      created.title_source,
      created.product_status,
      created.english_description
    FROM public.create_seller_product_with_description(
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
      p_trending,
      p_status
    ) AS created;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.save_seller_product_with_description_0028b1_legacy(
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
    p_trending,
    p_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_seller_product_with_description(
  uuid,
  boolean,
  text,
  boolean,
  text,
  uuid,
  integer,
  text,
  numeric,
  text,
  public.stock_status,
  boolean,
  text,
  boolean,
  public.product_status
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_seller_product_with_description(
  uuid,
  boolean,
  text,
  boolean,
  text,
  uuid,
  integer,
  text,
  numeric,
  text,
  public.stock_status,
  boolean,
  text,
  boolean,
  public.product_status
) TO service_role;
REVOKE ALL ON FUNCTION public.save_seller_product_with_description(
  uuid,
  uuid,
  boolean,
  text,
  boolean,
  text,
  uuid,
  integer,
  text,
  numeric,
  text,
  public.stock_status,
  boolean,
  text,
  boolean,
  public.product_status
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_seller_product_with_description(
  uuid,
  uuid,
  boolean,
  text,
  boolean,
  text,
  uuid,
  integer,
  text,
  numeric,
  text,
  public.stock_status,
  boolean,
  text,
  boolean,
  public.product_status
) TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_classifier_import_group(
  p_import_id uuid,
  p_attempt_token uuid,
  p_classifier_group_id uuid,
  p_approved_category_slug text,
  p_source_cover_classifier_image_id uuid
)
RETURNS TABLE (
  result text,
  product_draft_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.classifier_import_runs%ROWTYPE;
  selected_category public.categories%ROWTYPE;
  selected_product_id uuid;
  selected_product_seller_id uuid;
  selected_product_code text;
  stable_error text;
  failure_retryable boolean := false;
BEGIN
  SELECT run.*
  INTO selected_run
  FROM public.classifier_import_runs AS run
  WHERE run.id = p_import_id
    AND run.status = 'running'
    AND run.attempt_token = p_attempt_token
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'claim_lost'::text, NULL::uuid;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'classifier-product-source:'
        || selected_run.classifier_organization_id::text
        || ':' || p_classifier_group_id::text,
      0
    )
  );

  SELECT product.id, product.seller_id
  INTO selected_product_id, selected_product_seller_id
  FROM public.products AS product
  WHERE product.classifier_organization_id = selected_run.classifier_organization_id
    AND product.classifier_group_id = p_classifier_group_id;

  IF selected_product_id IS NOT NULL AND selected_product_seller_id <> selected_run.seller_id THEN
    stable_error := 'product_draft_source_conflict';
  ELSIF selected_product_id IS NULL THEN
    SELECT category.*
    INTO selected_category
    FROM public.categories AS category
    WHERE category.slug = p_approved_category_slug;

    IF NOT FOUND THEN
      stable_error := 'category_not_mapped';
    ELSIF NOT EXISTS (
      SELECT 1
      FROM public.categories AS catalog_category
      WHERE catalog_category.id = selected_category.parent_id
        AND catalog_category.slug = 'fashion'
        AND catalog_category.parent_id IS NULL
    ) THEN
      stable_error := 'product_category_not_supported';
    ELSIF selected_category.product_code_prefix !~ '^[A-Z0-9]{2,4}$' THEN
      stable_error := 'product_code_category_unconfigured';
    ELSE
      BEGIN
        selected_product_id := pg_catalog.gen_random_uuid();
        selected_product_code := public.reserve_product_code(
          selected_product_id,
          selected_run.seller_id,
          selected_category.id
        );
        INSERT INTO public.products (
          id,
          seller_id,
          category_id,
          product_code,
          title,
          status,
          classifier_organization_id,
          classifier_group_id
        )
        VALUES (
          selected_product_id,
          selected_run.seller_id,
          selected_category.id,
          selected_product_code,
          '',
          'draft',
          selected_run.classifier_organization_id,
          p_classifier_group_id
        );
      EXCEPTION
        WHEN OTHERS THEN
          stable_error := SQLERRM;
          IF stable_error NOT IN (
            'product_category_required',
            'product_category_not_supported',
            'product_code_company_unconfigured',
            'product_code_category_unconfigured',
            'product_code_allocation_failed'
          ) THEN
            RAISE;
          END IF;
          selected_product_id := NULL;
          failure_retryable := stable_error = 'product_code_allocation_failed';
      END;
    END IF;
  END IF;

  IF stable_error IS NOT NULL THEN
    INSERT INTO public.classifier_import_group_outcomes AS outcome (
      classifier_import_run_id,
      classifier_group_id,
      product_draft_id,
      approved_category_slug,
      source_cover_classifier_image_id,
      status,
      error_code,
      retryable
    )
    VALUES (
      p_import_id,
      p_classifier_group_id,
      NULL,
      p_approved_category_slug,
      p_source_cover_classifier_image_id,
      'failed',
      stable_error,
      failure_retryable
    )
    ON CONFLICT (classifier_import_run_id, classifier_group_id)
    DO UPDATE SET
      product_draft_id = NULL,
      approved_category_slug = EXCLUDED.approved_category_slug,
      source_cover_classifier_image_id = EXCLUDED.source_cover_classifier_image_id,
      status = 'failed',
      error_code = EXCLUDED.error_code,
      retryable = EXCLUDED.retryable;

    RETURN QUERY SELECT stable_error, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.classifier_import_group_outcomes AS outcome (
    classifier_import_run_id,
    classifier_group_id,
    product_draft_id,
    approved_category_slug,
    source_cover_classifier_image_id,
    status,
    error_code,
    retryable
  )
  VALUES (
    p_import_id,
    p_classifier_group_id,
    selected_product_id,
    p_approved_category_slug,
    p_source_cover_classifier_image_id,
    'pending',
    NULL,
    false
  )
  ON CONFLICT (classifier_import_run_id, classifier_group_id)
  DO UPDATE SET
    product_draft_id = EXCLUDED.product_draft_id,
    approved_category_slug = EXCLUDED.approved_category_slug,
    source_cover_classifier_image_id = EXCLUDED.source_cover_classifier_image_id,
    status = 'pending',
    error_code = NULL,
    retryable = false;

  RETURN QUERY SELECT 'prepared'::text, selected_product_id;
END;
$$;

ALTER FUNCTION public.prepare_classifier_import_group_images(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb
) RENAME TO prepare_classifier_import_group_images_0028b1_legacy;

REVOKE ALL ON FUNCTION public.prepare_classifier_import_group_images_0028b1_legacy(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.prepare_classifier_import_group_images(
  p_import_id uuid,
  p_run_attempt_token uuid,
  p_classifier_group_id uuid,
  p_cover_classifier_image_id uuid,
  p_memberships jsonb
)
RETURNS TABLE (
  result text,
  product_draft_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_run public.classifier_import_runs%ROWTYPE;
  selected_product_id uuid;
BEGIN
  SELECT run.*
  INTO selected_run
  FROM public.classifier_import_runs AS run
  WHERE run.id = p_import_id
    AND run.status = 'running'
    AND run.attempt_token = p_run_attempt_token
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'claim_lost'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT outcome.product_draft_id
  INTO selected_product_id
  FROM public.classifier_import_group_outcomes AS outcome
  JOIN public.products AS product
    ON product.id = outcome.product_draft_id
  WHERE outcome.classifier_import_run_id = p_import_id
    AND outcome.classifier_group_id = p_classifier_group_id
    AND product.seller_id = selected_run.seller_id
    AND product.classifier_organization_id = selected_run.classifier_organization_id
    AND product.classifier_group_id = p_classifier_group_id;

  IF selected_product_id IS NULL THEN
    RETURN QUERY SELECT 'source_membership_conflict'::text, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.prepare_classifier_import_group_images_0028b1_legacy(
    p_import_id,
    p_run_attempt_token,
    p_classifier_group_id,
    p_cover_classifier_image_id,
    p_memberships
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_classifier_import_group(uuid, uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_classifier_import_group(uuid, uuid, uuid, text, uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.prepare_classifier_import_group_images(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_classifier_import_group_images(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb
) TO service_role;

COMMIT;
