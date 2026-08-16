BEGIN;

CREATE TABLE public.product_archive_restore_operations (
  request_id uuid PRIMARY KEY,
  action text NOT NULL,
  product_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  expected_moderation_revision bigint NOT NULL,
  result text NOT NULL,
  resulting_product_status public.product_status NOT NULL,
  resulting_moderation_revision bigint NOT NULL,
  restoration_draft boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_archive_restore_operations_product_fkey
    FOREIGN KEY (product_id, seller_id)
    REFERENCES public.products(id, seller_id)
    ON DELETE RESTRICT,
  CONSTRAINT product_archive_restore_operations_action_check
    CHECK (action IN ('archive', 'restore')),
  CONSTRAINT product_archive_restore_operations_revision_positive
    CHECK (
      expected_moderation_revision > 0
      AND resulting_moderation_revision > 0
    ),
  CONSTRAINT product_archive_restore_operations_result_check
    CHECK (
      (action = 'archive'
        AND result = 'archived'
        AND resulting_product_status = 'archived'
        AND NOT restoration_draft)
      OR (action = 'restore'
        AND result = 'restoration_draft'
        AND resulting_product_status = 'archived'
        AND restoration_draft)
    )
);

ALTER TABLE public.product_archive_restore_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_archive_restore_operations
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.product_archive_restore_operations TO service_role;

CREATE FUNCTION public.product_moderation_action_revision(p_product_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    working_copy.revision,
    approved_submission.revision,
    product.moderation_revision
  )
  FROM public.products AS product
  LEFT JOIN public.product_moderation_working_copies AS working_copy
    ON working_copy.product_id = product.id
  LEFT JOIN public.product_moderation_submissions AS approved_submission
    ON approved_submission.id = product.approved_moderation_submission_id
   AND approved_submission.product_id = product.id
   AND approved_submission.seller_id = product.seller_id
   AND approved_submission.review_status = 'approved'
  WHERE product.id = p_product_id;
$$;

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
  created_at timestamptz
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
    public.product_moderation_action_revision(product.id),
    working_copy.product_id IS NOT NULL,
    product.created_at
  FROM public.products AS product
  LEFT JOIN public.product_moderation_working_copies AS working_copy
    ON working_copy.product_id = product.id
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

CREATE OR REPLACE FUNCTION public.enforce_product_archive_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'archived' AND NEW.status <> 'archived' THEN
    IF NEW.status = 'published'
      AND public.product_moderation_registry_contains(
        'bazoria.product_moderation_activation_ids', OLD.id
      )
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'product_publication_not_allowed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.read_product_moderation_edit_state(uuid, uuid)
  RENAME TO read_product_moderation_edit_state_0040c2c_legacy;

CREATE FUNCTION public.read_product_moderation_edit_state(
  p_product_id uuid,
  p_expected_seller_id uuid
)
RETURNS TABLE (
  product_id uuid,
  seller_id uuid,
  product_status public.product_status,
  revision bigint,
  editable boolean,
  working_copy boolean,
  snapshot_json jsonb
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_copy public.product_moderation_working_copies%ROWTYPE;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id
    AND (p_expected_seller_id IS NULL OR product.seller_id = p_expected_seller_id)
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF selected_product.status = 'archived' THEN
    SELECT working_copy.* INTO selected_copy
    FROM public.product_moderation_working_copies AS working_copy
    WHERE working_copy.product_id = selected_product.id
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN;
    END IF;
    RETURN QUERY SELECT
      selected_product.id,
      selected_product.seller_id,
      selected_product.status,
      selected_copy.revision,
      selected_product.active_moderation_submission_id IS NULL,
      true,
      selected_copy.snapshot_json;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT state.*
  FROM public.read_product_moderation_edit_state_0040c2c_legacy(
    p_product_id,
    p_expected_seller_id
  ) AS state;
END;
$$;

CREATE FUNCTION public.archive_seller_product_with_moderation(
  p_product_id uuid,
  p_expected_moderation_revision bigint,
  p_request_id uuid,
  p_seller_id uuid,
  p_actor_user_id uuid
)
RETURNS TABLE (
  result text,
  product_id uuid,
  product_status public.product_status,
  moderation_revision bigint,
  restoration_draft boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_receipt public.product_archive_restore_operations%ROWTYPE;
  selected_seller public.sellers%ROWTYPE;
  selected_product public.products%ROWTYPE;
  selected_submission public.product_moderation_submissions%ROWTYPE;
  selected_run public.product_image_publication_runs%ROWTYPE;
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  approved_submission public.product_moderation_submissions%ROWTYPE;
  action_revision bigint;
  resulting_revision bigint;
BEGIN
  IF p_product_id IS NULL
    OR p_expected_moderation_revision IS NULL OR p_expected_moderation_revision < 1
    OR p_request_id IS NULL
    OR p_seller_id IS NULL
    OR p_actor_user_id IS NULL
  THEN
    RAISE EXCEPTION 'product_archive_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT operation.* INTO selected_receipt
  FROM public.product_archive_restore_operations AS operation
  WHERE operation.request_id = p_request_id;
  IF FOUND THEN
    IF selected_receipt.action <> 'archive'
      OR selected_receipt.product_id <> p_product_id
      OR selected_receipt.seller_id <> p_seller_id
      OR selected_receipt.actor_user_id <> p_actor_user_id
      OR selected_receipt.expected_moderation_revision <> p_expected_moderation_revision
    THEN
      RETURN QUERY SELECT
        'product_archive_request_conflict'::text,
        NULL::uuid,
        NULL::public.product_status,
        NULL::bigint,
        false;
      RETURN;
    END IF;
    RETURN QUERY SELECT
      selected_receipt.result,
      selected_receipt.product_id,
      selected_receipt.resulting_product_status,
      selected_receipt.resulting_moderation_revision,
      selected_receipt.restoration_draft;
    RETURN;
  END IF;

  SELECT seller.* INTO selected_seller
  FROM public.sellers AS seller
  WHERE seller.id = p_seller_id AND seller.owner_id = p_actor_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'product_not_found'::text,
      NULL::uuid,
      NULL::public.product_status,
      NULL::bigint,
      false;
    RETURN;
  END IF;

  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id AND product.seller_id = selected_seller.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'product_not_found'::text,
      NULL::uuid,
      NULL::public.product_status,
      NULL::bigint,
      false;
    RETURN;
  END IF;

  IF selected_product.active_moderation_submission_id IS NOT NULL THEN
    SELECT submission.* INTO selected_submission
    FROM public.product_moderation_submissions AS submission
    WHERE submission.id = selected_product.active_moderation_submission_id
      AND submission.product_id = selected_product.id
      AND submission.seller_id = selected_product.seller_id
    FOR UPDATE;
  END IF;

  SELECT run.* INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.product_id = selected_product.id
    AND run.status IN ('pending', 'running', 'failed', 'cleanup_required')
  ORDER BY run.created_at DESC, run.id DESC
  LIMIT 1
  FOR UPDATE;

  SELECT working_copy.* INTO selected_copy
  FROM public.product_moderation_working_copies AS working_copy
  WHERE working_copy.product_id = selected_product.id
  FOR UPDATE;

  IF selected_product.approved_moderation_submission_id IS NOT NULL THEN
    SELECT submission.* INTO approved_submission
    FROM public.product_moderation_submissions AS submission
    WHERE submission.id = selected_product.approved_moderation_submission_id
      AND submission.product_id = selected_product.id
      AND submission.seller_id = selected_product.seller_id
      AND submission.review_status = 'approved'
    FOR SHARE;
  END IF;

  action_revision := COALESCE(
    selected_copy.revision,
    approved_submission.revision,
    selected_product.moderation_revision
  );
  IF action_revision IS DISTINCT FROM p_expected_moderation_revision THEN
    RETURN QUERY SELECT
      'product_moderation_revision_conflict'::text,
      NULL::uuid,
      NULL::public.product_status,
      NULL::bigint,
      false;
    RETURN;
  END IF;

  IF selected_product.status = 'archived' THEN
    INSERT INTO public.product_archive_restore_operations (
      request_id, action, product_id, seller_id, actor_user_id,
      expected_moderation_revision, result, resulting_product_status,
      resulting_moderation_revision, restoration_draft
    ) VALUES (
      p_request_id, 'archive', selected_product.id, selected_product.seller_id,
      p_actor_user_id, p_expected_moderation_revision, 'archived', 'archived',
      action_revision, false
    );
    RETURN QUERY SELECT
      'archived'::text,
      selected_product.id,
      'archived'::public.product_status,
      action_revision,
      false;
    RETURN;
  END IF;

  IF selected_run.id IS NOT NULL THEN
    RETURN QUERY SELECT
      'product_archive_moderation_active'::text,
      NULL::uuid,
      NULL::public.product_status,
      NULL::bigint,
      false;
    RETURN;
  END IF;

  IF selected_product.active_moderation_submission_id IS NOT NULL THEN
    IF selected_submission.id IS NULL OR selected_submission.review_status <> 'pending' THEN
      RETURN QUERY SELECT
        'product_archive_moderation_active'::text,
        NULL::uuid,
        NULL::public.product_status,
        NULL::bigint,
        false;
      RETURN;
    END IF;

    UPDATE public.product_moderation_submissions AS submission
    SET review_status = 'withdrawn'
    WHERE submission.id = selected_submission.id;
    INSERT INTO public.product_moderation_events (
      product_id, seller_id, submission_id, event_type, actor_user_id,
      expected_revision, request_id
    ) VALUES (
      selected_product.id,
      selected_product.seller_id,
      selected_submission.id,
      'withdrawn',
      p_actor_user_id,
      p_expected_moderation_revision,
      p_request_id
    );
  END IF;

  DELETE FROM public.product_moderation_working_copy_images AS membership
  WHERE membership.product_id = selected_product.id;
  DELETE FROM public.product_moderation_working_copies AS working_copy
  WHERE working_copy.product_id = selected_product.id;

  UPDATE public.products AS product
  SET status = 'archived',
      active_moderation_submission_id = NULL,
      moderation_revision = CASE
        WHEN selected_product.status = 'draft'
          AND selected_product.active_moderation_submission_id IS NOT NULL
          THEN product.moderation_revision + 1
        ELSE product.moderation_revision
      END
  WHERE product.id = selected_product.id
  RETURNING product.moderation_revision INTO resulting_revision;

  resulting_revision := COALESCE(approved_submission.revision, resulting_revision);
  INSERT INTO public.product_archive_restore_operations (
    request_id, action, product_id, seller_id, actor_user_id,
    expected_moderation_revision, result, resulting_product_status,
    resulting_moderation_revision, restoration_draft
  ) VALUES (
    p_request_id, 'archive', selected_product.id, selected_product.seller_id,
    p_actor_user_id, p_expected_moderation_revision, 'archived', 'archived',
    resulting_revision, false
  );

  RETURN QUERY SELECT
    'archived'::text,
    selected_product.id,
    'archived'::public.product_status,
    resulting_revision,
    false;
END;
$$;

CREATE FUNCTION public.restore_seller_product_for_moderation(
  p_product_id uuid,
  p_expected_moderation_revision bigint,
  p_request_id uuid,
  p_seller_id uuid,
  p_actor_user_id uuid
)
RETURNS TABLE (
  result text,
  product_id uuid,
  product_status public.product_status,
  moderation_revision bigint,
  restoration_draft boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_receipt public.product_archive_restore_operations%ROWTYPE;
  selected_seller public.sellers%ROWTYPE;
  selected_product public.products%ROWTYPE;
  selected_run public.product_image_publication_runs%ROWTYPE;
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  approved_submission public.product_moderation_submissions%ROWTYPE;
  action_revision bigint;
BEGIN
  IF p_product_id IS NULL
    OR p_expected_moderation_revision IS NULL OR p_expected_moderation_revision < 1
    OR p_request_id IS NULL
    OR p_seller_id IS NULL
    OR p_actor_user_id IS NULL
  THEN
    RAISE EXCEPTION 'product_restore_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT operation.* INTO selected_receipt
  FROM public.product_archive_restore_operations AS operation
  WHERE operation.request_id = p_request_id;
  IF FOUND THEN
    IF selected_receipt.action <> 'restore'
      OR selected_receipt.product_id <> p_product_id
      OR selected_receipt.seller_id <> p_seller_id
      OR selected_receipt.actor_user_id <> p_actor_user_id
      OR selected_receipt.expected_moderation_revision <> p_expected_moderation_revision
    THEN
      RETURN QUERY SELECT
        'product_restore_request_conflict'::text,
        NULL::uuid,
        NULL::public.product_status,
        NULL::bigint,
        false;
      RETURN;
    END IF;
    RETURN QUERY SELECT
      selected_receipt.result,
      selected_receipt.product_id,
      selected_receipt.resulting_product_status,
      selected_receipt.resulting_moderation_revision,
      selected_receipt.restoration_draft;
    RETURN;
  END IF;

  SELECT seller.* INTO selected_seller
  FROM public.sellers AS seller
  WHERE seller.id = p_seller_id AND seller.owner_id = p_actor_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'product_not_found'::text,
      NULL::uuid,
      NULL::public.product_status,
      NULL::bigint,
      false;
    RETURN;
  END IF;

  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id AND product.seller_id = selected_seller.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'product_not_found'::text,
      NULL::uuid,
      NULL::public.product_status,
      NULL::bigint,
      false;
    RETURN;
  END IF;

  SELECT run.* INTO selected_run
  FROM public.product_image_publication_runs AS run
  WHERE run.product_id = selected_product.id
    AND run.status IN ('pending', 'running', 'failed', 'cleanup_required')
  ORDER BY run.created_at DESC, run.id DESC
  LIMIT 1
  FOR UPDATE;

  SELECT working_copy.* INTO selected_copy
  FROM public.product_moderation_working_copies AS working_copy
  WHERE working_copy.product_id = selected_product.id
  FOR UPDATE;

  IF selected_product.approved_moderation_submission_id IS NOT NULL THEN
    SELECT submission.* INTO approved_submission
    FROM public.product_moderation_submissions AS submission
    WHERE submission.id = selected_product.approved_moderation_submission_id
      AND submission.product_id = selected_product.id
      AND submission.seller_id = selected_product.seller_id
      AND submission.review_status = 'approved'
    FOR SHARE;
  END IF;

  action_revision := COALESCE(
    selected_copy.revision,
    approved_submission.revision,
    selected_product.moderation_revision
  );
  IF action_revision IS DISTINCT FROM p_expected_moderation_revision THEN
    RETURN QUERY SELECT
      'product_moderation_revision_conflict'::text,
      NULL::uuid,
      NULL::public.product_status,
      NULL::bigint,
      false;
    RETURN;
  END IF;

  IF selected_product.status <> 'archived'
    OR approved_submission.id IS NULL
  THEN
    RETURN QUERY SELECT
      'product_restore_not_allowed'::text,
      NULL::uuid,
      NULL::public.product_status,
      NULL::bigint,
      false;
    RETURN;
  END IF;
  IF selected_product.active_moderation_submission_id IS NOT NULL
    OR selected_run.id IS NOT NULL
  THEN
    RETURN QUERY SELECT
      'product_restore_moderation_active'::text,
      NULL::uuid,
      NULL::public.product_status,
      NULL::bigint,
      false;
    RETURN;
  END IF;

  IF selected_copy.product_id IS NULL THEN
    SELECT working_copy.* INTO selected_copy
    FROM public.ensure_product_moderation_working_copy(
      selected_product.id,
      selected_product.seller_id
    ) AS working_copy;
  END IF;

  INSERT INTO public.product_archive_restore_operations (
    request_id, action, product_id, seller_id, actor_user_id,
    expected_moderation_revision, result, resulting_product_status,
    resulting_moderation_revision, restoration_draft
  ) VALUES (
    p_request_id, 'restore', selected_product.id, selected_product.seller_id,
    p_actor_user_id, p_expected_moderation_revision, 'restoration_draft',
    'archived', selected_copy.revision, true
  );

  RETURN QUERY SELECT
    'restoration_draft'::text,
    selected_product.id,
    'archived'::public.product_status,
    selected_copy.revision,
    true;
END;
$$;

REVOKE ALL ON FUNCTION public.product_moderation_action_revision(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_seller_products_for_moderation(
  uuid, text, integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_product_moderation_edit_state_0040c2c_legacy(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.read_product_moderation_edit_state(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_seller_product_with_moderation(
  uuid, bigint, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_seller_product_for_moderation(
  uuid, bigint, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_initial_product_draft(uuid, uuid, bigint)
  FROM service_role;
REVOKE ALL ON FUNCTION public.archive_seller_product(uuid, uuid)
  FROM service_role;

GRANT EXECUTE ON FUNCTION public.list_seller_products_for_moderation(
  uuid, text, integer, timestamptz, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_product_moderation_edit_state(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_seller_product_with_moderation(
  uuid, bigint, uuid, uuid, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_seller_product_for_moderation(
  uuid, bigint, uuid, uuid, uuid
) TO service_role;

COMMIT;
