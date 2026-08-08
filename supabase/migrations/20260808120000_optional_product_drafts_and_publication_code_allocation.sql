BEGIN;

ALTER TABLE public.products
  ALTER COLUMN category_id DROP NOT NULL,
  ALTER COLUMN product_code DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_product_category_boundary()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.category_id IS NULL THEN
    IF NEW.status = 'published' THEN
      RAISE EXCEPTION 'product_publication_category_required'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
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

DROP TRIGGER trg_products_01_category_boundary ON public.products;
CREATE TRIGGER trg_products_01_category_boundary
  BEFORE INSERT OR UPDATE OF category_id, status ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_category_boundary();

CREATE OR REPLACE FUNCTION public.enforce_product_code_immutability()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.product_code IS NOT NULL
    AND NEW.product_code IS DISTINCT FROM OLD.product_code
  THEN
    RAISE EXCEPTION 'product_code_immutable' USING ERRCODE = '23514';
  END IF;

  IF OLD.product_code IS NULL AND NEW.product_code IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.product_code_allocations AS allocation
      WHERE allocation.product_code = NEW.product_code
        AND allocation.product_id = NEW.id
        AND allocation.seller_id = NEW.seller_id
    )
  THEN
    RAISE EXCEPTION 'product_code_immutable' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.assign_product_code_for_publication(
  p_product_id uuid,
  p_seller_id uuid
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_code text;
BEGIN
  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id
    AND product.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_code_allocation_failed' USING ERRCODE = '55000';
  END IF;

  IF selected_product.category_id IS NULL THEN
    RAISE EXCEPTION 'product_publication_category_required'
      USING ERRCODE = '23514';
  END IF;

  IF selected_product.product_code IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.product_code_allocations AS allocation
      WHERE allocation.product_code = selected_product.product_code
        AND allocation.product_id = selected_product.id
        AND allocation.seller_id = selected_product.seller_id
    ) THEN
      RAISE EXCEPTION 'product_code_allocation_failed' USING ERRCODE = '55000';
    END IF;
    RETURN selected_product.product_code;
  END IF;

  selected_code := public.reserve_product_code(
    selected_product.id,
    selected_product.seller_id,
    selected_product.category_id
  );

  UPDATE public.products AS product
  SET product_code = selected_code
  WHERE product.id = selected_product.id
    AND product.product_code IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_code_allocation_failed' USING ERRCODE = '55000';
  END IF;

  RETURN selected_code;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_product_code_for_publication(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.enforce_published_product_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'published'
    AND (
      NEW.product_code IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.product_code_allocations AS allocation
        WHERE allocation.product_code = NEW.product_code
          AND allocation.product_id = NEW.id
          AND allocation.seller_id = NEW.seller_id
      )
    )
  THEN
    RAISE EXCEPTION 'product_code_allocation_failed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_06_publication_code
  BEFORE INSERT OR UPDATE OF status, product_code, seller_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_published_product_code();

CREATE OR REPLACE FUNCTION public.create_seller_product_with_description(
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
  selected_product public.products%ROWTYPE;
  save_result record;
  normalized_title text := '';
  normalized_description text;
  title_validation_result text;
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

  IF p_status NOT IN ('draft', 'published') THEN
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

  IF coalesce(p_title_patch_present, false) THEN
    normalized_title := pg_catalog.btrim(
      pg_catalog.regexp_replace(coalesce(p_title, ''), '[[:space:]]+', ' ', 'g')
    );
    IF pg_catalog.char_length(normalized_title) > 50 THEN
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
  END IF;

  IF p_status = 'published' THEN
    SELECT validation.result, validation.normalized_title
    INTO title_validation_result, normalized_title
    FROM public.validate_product_publication_title(normalized_title) AS validation;

    IF title_validation_result <> 'valid' THEN
      RETURN QUERY SELECT
        title_validation_result,
        NULL::uuid,
        NULL::text,
        normalized_title,
        NULL::text,
        NULL::public.product_status,
        NULL::text;
      RETURN;
    END IF;

    IF p_category_id IS NULL THEN
      RETURN QUERY SELECT
        'product_publication_category_required'::text,
        NULL::uuid,
        NULL::text,
        normalized_title,
        NULL::text,
        NULL::public.product_status,
        NULL::text;
      RETURN;
    END IF;

    IF NOT coalesce(p_cover_image_url_patch_present, false)
      OR NULLIF(pg_catalog.btrim(coalesce(p_cover_image_url, '')), '') IS NULL
    THEN
      RAISE EXCEPTION 'product_publication_not_allowed'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF coalesce(p_description_patch_present, false) THEN
    normalized_description := public.normalize_product_draft_description(p_description);
    IF normalized_description IS NOT NULL
      AND pg_catalog.char_length(normalized_description) > 300
    THEN
      RETURN QUERY SELECT
        'description_invalid'::text,
        NULL::uuid,
        NULL::text,
        normalized_title,
        NULL::text,
        NULL::public.product_status,
        NULL::text;
      RETURN;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.products (
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
      p_seller_id,
      p_category_id,
      NULL,
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
        WHEN coalesce(p_cover_image_url_patch_present, false) THEN p_cover_image_url
        ELSE NULL
      END,
      p_trending
    )
    RETURNING * INTO selected_product;

    SELECT *
    INTO save_result
    FROM public.save_seller_product_with_description_0028b1_legacy(
      selected_product.id,
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
      'draft'
    );

    IF save_result.result <> 'updated' THEN
      RAISE EXCEPTION '%', save_result.result USING ERRCODE = 'P0001';
    END IF;

    IF p_status = 'published' THEN
      PERFORM public.assign_product_code_for_publication(
        selected_product.id,
        p_seller_id
      );
      UPDATE public.products AS product
      SET status = 'published'
      WHERE product.id = selected_product.id;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      stable_error := SQLERRM;
      IF stable_error NOT IN (
        'facts_missing',
        'title_required',
        'title_invalid',
        'description_invalid',
        'product_draft_description_invalid',
        'product_category_required',
        'product_publication_category_required',
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

  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = selected_product.id;

  RETURN QUERY SELECT
    'created'::text,
    selected_product.id,
    selected_product.product_code,
    selected_product.title,
    selected_product.title_source,
    selected_product.status,
    selected_product.description;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_seller_product_with_description(
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
DECLARE
  selected_product public.products%ROWTYPE;
  saved_product public.products%ROWTYPE;
  save_result record;
  title_validation_result text;
  stable_error text;
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

  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND product.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::text,
      NULL::uuid,
      NULL::text,
      NULL::text,
      NULL::public.product_status,
      NULL::text;
    RETURN;
  END IF;

  IF selected_product.status = 'archived' THEN
    RETURN QUERY SELECT
      'not_editable'::text,
      selected_product.id,
      NULL::text,
      NULL::text,
      selected_product.status,
      NULL::text;
    RETURN;
  END IF;

  IF selected_product.status <> 'draft' OR p_status <> 'published' THEN
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
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_draft_source_memberships AS membership
    WHERE membership.product_draft_id = selected_product.id
  ) THEN
    RAISE EXCEPTION 'product_publication_not_allowed' USING ERRCODE = '23514';
  END IF;

  BEGIN
    SELECT *
    INTO save_result
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
      'draft'
    );

    IF save_result.result <> 'updated' THEN
      RAISE EXCEPTION '%', save_result.result USING ERRCODE = 'P0001';
    END IF;

    SELECT product.*
    INTO saved_product
    FROM public.products AS product
    WHERE product.id = selected_product.id;

    SELECT validation.result
    INTO title_validation_result
    FROM public.validate_product_publication_title(saved_product.title) AS validation;

    IF title_validation_result <> 'valid' THEN
      RAISE EXCEPTION '%', title_validation_result USING ERRCODE = 'P0001';
    END IF;
    IF saved_product.category_id IS NULL THEN
      RAISE EXCEPTION 'product_publication_category_required'
        USING ERRCODE = 'P0001';
    END IF;
    IF NULLIF(pg_catalog.btrim(coalesce(saved_product.cover_image_url, '')), '') IS NULL THEN
      RAISE EXCEPTION 'product_publication_not_allowed'
        USING ERRCODE = '23514';
    END IF;

    PERFORM public.assign_product_code_for_publication(
      saved_product.id,
      saved_product.seller_id
    );

    UPDATE public.products AS product
    SET status = 'published'
    WHERE product.id = saved_product.id;
  EXCEPTION
    WHEN OTHERS THEN
      stable_error := SQLERRM;
      IF stable_error NOT IN (
        'facts_missing',
        'title_required',
        'title_invalid',
        'description_invalid',
        'product_draft_description_invalid',
        'product_publication_category_required',
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
      selected_product.id,
      selected_product.title,
      selected_product.title_source,
      selected_product.status,
      selected_product.description;
    RETURN;
  END IF;

  SELECT product.*
  INTO saved_product
  FROM public.products AS product
  WHERE product.id = selected_product.id;

  RETURN QUERY SELECT
    'updated'::text,
    saved_product.id,
    saved_product.title,
    saved_product.title_source,
    saved_product.status,
    saved_product.description;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_seller_product_publication(
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
RETURNS TABLE (
  result text,
  product_draft_id uuid,
  publication_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_run public.product_image_publication_runs%ROWTYPE;
  save_result record;
  image_count integer;
  cover_count integer;
  title_validation_result text;
  description_validation_result text;
  stable_error text;
BEGIN
  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND product.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;
  IF selected_product.status <> 'draft' THEN
    RETURN QUERY SELECT 'not_allowed'::text, selected_product.id, NULL::text;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_draft_source_memberships AS membership
    WHERE membership.product_draft_id = selected_product.id
  ) THEN
    RETURN QUERY SELECT 'direct_product'::text, selected_product.id, NULL::text;
    RETURN;
  END IF;

  SELECT run.*
  INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.product_draft_id = selected_product.id
  FOR UPDATE;

  IF FOUND AND selected_run.status IN ('pending', 'running') THEN
    IF selected_product.product_code IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.product_code_allocations AS allocation
      WHERE allocation.product_code = selected_product.product_code
        AND allocation.product_id = selected_product.id
        AND allocation.seller_id = selected_product.seller_id
    ) THEN
      RETURN QUERY SELECT
        'product_code_allocation_failed'::text,
        selected_product.id,
        selected_run.status;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'in_progress'::text, selected_product.id, selected_run.status;
    RETURN;
  END IF;

  IF FOUND AND (
    selected_run.status = 'cleanup_required'
    OR EXISTS (
      SELECT 1
      FROM public.product_image_publication_items AS item
      WHERE item.product_draft_id = selected_product.id
        AND item.object_created_by_attempt_token IS NOT NULL
    )
  ) THEN
    RETURN QUERY SELECT 'not_allowed'::text, selected_product.id, selected_run.status;
    RETURN;
  END IF;

  SELECT validation.result
  INTO title_validation_result
  FROM public.validate_product_publication_title(
    CASE
      WHEN coalesce(p_title_patch_present, false) THEN p_title
      ELSE selected_product.title
    END
  ) AS validation;
  IF title_validation_result <> 'valid' THEN
    RETURN QUERY SELECT title_validation_result, selected_product.id, NULL::text;
    RETURN;
  END IF;

  description_validation_result := public.validate_product_publication_descriptions(
    selected_product.id,
    p_description_patch_present,
    p_description
  );
  IF description_validation_result <> 'valid' THEN
    RETURN QUERY SELECT
      description_validation_result,
      selected_product.id,
      NULL::text;
    RETURN;
  END IF;

  IF p_category_id IS NULL THEN
    RETURN QUERY SELECT
      'product_publication_category_required'::text,
      selected_product.id,
      NULL::text;
    RETURN;
  END IF;
  IF coalesce(p_cover_image_url_patch_present, false) THEN
    RETURN QUERY SELECT 'cover_not_allowed'::text, selected_product.id, NULL::text;
    RETURN;
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (WHERE image.id = selected_product.cover_image_id)::integer
  INTO image_count, cover_count
  FROM public.product_draft_images AS image
  WHERE image.product_draft_id = selected_product.id;

  IF image_count = 0 THEN
    RETURN QUERY SELECT 'image_required'::text, selected_product.id, NULL::text;
    RETURN;
  END IF;
  IF image_count > 20 OR selected_product.cover_image_id IS NULL OR cover_count <> 1 THEN
    RETURN QUERY SELECT 'not_allowed'::text, selected_product.id, NULL::text;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.product_draft_images AS image
    WHERE image.product_draft_id = selected_product.id
      AND (
        image.status <> 'available'
        OR image.storage_bucket <> 'product-draft-images'
        OR image.content_type <> 'image/jpeg'
        OR image.size_bytes IS NULL
        OR image.size_bytes <= 0
      )
  ) THEN
    RETURN QUERY SELECT 'images_not_ready'::text, selected_product.id, NULL::text;
    RETURN;
  END IF;

  BEGIN
    SELECT *
    INTO save_result
    FROM public.save_seller_product_with_description(
      selected_product.id,
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
      false,
      NULL,
      p_trending,
      'draft'
    );

    IF save_result.result <> 'updated' THEN
      RAISE EXCEPTION '%', save_result.result USING ERRCODE = 'P0001';
    END IF;

    PERFORM public.assign_product_code_for_publication(
      selected_product.id,
      selected_product.seller_id
    );

    DELETE FROM public.product_image_publication_items AS item
    WHERE item.product_draft_id = selected_product.id;

    INSERT INTO public.product_image_publication_runs AS run (
      product_draft_id,
      seller_id,
      status,
      attempt_count,
      attempt_token,
      claim_started_at,
      error_code,
      completed_at
    )
    VALUES (
      selected_product.id,
      p_seller_id,
      'pending',
      coalesce(selected_run.attempt_count, 0),
      NULL,
      NULL,
      NULL,
      NULL
    )
    ON CONFLICT ON CONSTRAINT product_image_publication_runs_pkey DO UPDATE
    SET
      seller_id = EXCLUDED.seller_id,
      status = 'pending',
      attempt_token = NULL,
      claim_started_at = NULL,
      error_code = NULL,
      completed_at = NULL;

    INSERT INTO public.product_image_publication_items (
      product_draft_id,
      product_draft_image_id,
      source_bucket,
      source_object_key,
      destination_key,
      source_position,
      publication_order,
      is_cover,
      expected_source_size_bytes,
      expected_content_type
    )
    SELECT
      selected_product.id,
      image.id,
      image.storage_bucket,
      image.destination_key,
      'published-products/' || selected_product.id::text || '/' || image.id::text || '.jpg',
      image.source_position,
      pg_catalog.row_number() OVER (ORDER BY image.source_position, image.id) - 1,
      image.id = selected_product.cover_image_id,
      image.size_bytes,
      image.content_type
    FROM public.product_draft_images AS image
    WHERE image.product_draft_id = selected_product.id
    ORDER BY image.source_position, image.id;
  EXCEPTION
    WHEN OTHERS THEN
      stable_error := SQLERRM;
      IF stable_error NOT IN (
        'facts_missing',
        'title_required',
        'title_invalid',
        'description_invalid',
        'product_draft_description_invalid',
        'product_publication_category_required',
        'product_category_not_supported',
        'product_code_company_unconfigured',
        'product_code_category_unconfigured',
        'product_code_allocation_failed'
      ) THEN
        RAISE;
      END IF;
  END;

  IF stable_error IS NOT NULL THEN
    RETURN QUERY SELECT stable_error, selected_product.id, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'pending'::text, selected_product.id, 'pending'::text;
END;
$$;

ALTER FUNCTION public.retry_product_image_publication(uuid, uuid)
  RENAME TO retry_product_image_publication_0035a1_legacy;
REVOKE ALL ON FUNCTION public.retry_product_image_publication_0035a1_legacy(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.retry_product_image_publication(
  p_product_draft_id uuid,
  p_seller_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
BEGIN
  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND product.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF selected_product.product_code IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.product_code_allocations AS allocation
    WHERE allocation.product_code = selected_product.product_code
      AND allocation.product_id = selected_product.id
      AND allocation.seller_id = selected_product.seller_id
  ) THEN
    RETURN 'not_allowed';
  END IF;

  RETURN public.retry_product_image_publication_0035a1_legacy(
    p_product_draft_id,
    p_seller_id
  );
END;
$$;

ALTER FUNCTION public.finalize_seller_product_publication(uuid, uuid, uuid)
  RENAME TO finalize_seller_product_publication_0035a1_legacy;
REVOKE ALL ON FUNCTION public.finalize_seller_product_publication_0035a1_legacy(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.finalize_seller_product_publication(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_attempt_token uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
BEGIN
  SELECT product.*
  INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND product.seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF selected_product.category_id IS NULL
    OR selected_product.product_code IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.product_code_allocations AS allocation
      WHERE allocation.product_code = selected_product.product_code
        AND allocation.product_id = selected_product.id
        AND allocation.seller_id = selected_product.seller_id
    )
  THEN
    RETURN 'not_allowed';
  END IF;

  RETURN public.finalize_seller_product_publication_0035a1_legacy(
    p_product_draft_id,
    p_seller_id,
    p_attempt_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_product_category_boundary()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_product_code_immutability()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_published_product_code()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_seller_product_with_description(
  uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean, public.product_status
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_seller_product_with_description(
  uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean, public.product_status
) TO service_role;
REVOKE ALL ON FUNCTION public.save_seller_product_with_description(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean, public.product_status
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_seller_product_with_description(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean, public.product_status
) TO service_role;
REVOKE ALL ON FUNCTION public.authorize_seller_product_publication(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_seller_product_publication(
  uuid, uuid, boolean, text, boolean, text, uuid, integer, text, numeric, text,
  public.stock_status, boolean, text, boolean
) TO service_role;
REVOKE ALL ON FUNCTION public.retry_product_image_publication(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_seller_product_publication(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_seller_product_publication(uuid, uuid, uuid)
  TO service_role;

COMMIT;
