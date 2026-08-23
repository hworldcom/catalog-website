CREATE OR REPLACE FUNCTION public.submit_initial_product_moderation(
  p_product_id uuid,
  p_seller_id uuid,
  p_expected_moderation_revision bigint,
  p_seller_request_id uuid,
  p_submitted_by_user_id uuid
)
RETURNS SETOF public.product_moderation_submissions
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_seller public.sellers%ROWTYPE;
  selected_category public.categories%ROWTYPE;
  selected_facts public.product_draft_facts%ROWTYPE;
  replay_submission public.product_moderation_submissions%ROWTYPE;
  created_submission public.product_moderation_submissions%ROWTYPE;
  audiences_json jsonb;
  descriptions_json jsonb;
  facts_snapshot jsonb;
  image_ids_json jsonb;
  snapshot jsonb;
  image_count integer;
BEGIN
  IF p_product_id IS NULL
    OR p_seller_id IS NULL
    OR p_expected_moderation_revision IS NULL
    OR p_expected_moderation_revision < 1
    OR p_seller_request_id IS NULL
    OR p_submitted_by_user_id IS NULL
  THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id
    AND product.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT submission.* INTO replay_submission
  FROM public.product_moderation_submissions AS submission
  WHERE submission.seller_id = p_seller_id
    AND submission.seller_request_id = p_seller_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF replay_submission.product_id <> p_product_id
      OR replay_submission.revision <> p_expected_moderation_revision
      OR replay_submission.submission_kind <> 'initial_publication'
      OR replay_submission.submitted_by_user_id <> p_submitted_by_user_id
    THEN
      RAISE EXCEPTION 'product_moderation_submission_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN NEXT replay_submission;
    RETURN;
  END IF;

  IF selected_product.status <> 'draft'
    OR selected_product.approved_moderation_submission_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
  END IF;
  IF selected_product.active_moderation_submission_id IS NOT NULL THEN
    RAISE EXCEPTION 'product_moderation_submission_conflict' USING ERRCODE = '55000';
  END IF;
  IF selected_product.moderation_revision <> p_expected_moderation_revision THEN
    RAISE EXCEPTION 'product_moderation_working_revision_conflict' USING ERRCODE = '40001';
  END IF;

  SELECT seller.* INTO selected_seller
  FROM public.sellers AS seller
  WHERE seller.id = p_seller_id
  FOR SHARE;
  IF NOT FOUND
    OR selected_seller.approved_profile_submission_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.seller_profile_submissions AS seller_submission
      WHERE seller_submission.id = selected_seller.approved_profile_submission_id
        AND seller_submission.seller_id = selected_seller.id
        AND seller_submission.status = 'approved'
    )
  THEN
    RAISE EXCEPTION 'product_moderation_seller_approval_required' USING ERRCODE = '55000';
  END IF;

  IF selected_product.title IS NULL
    OR btrim(regexp_replace(selected_product.title, '[[:space:]]+', ' ', 'g')) = ''
    OR char_length(selected_product.title) > 50
    OR selected_product.title_source NOT IN ('human', 'model')
  THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;

  IF selected_product.category_id IS NULL THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT category.* INTO selected_category
  FROM public.categories AS category
  WHERE category.id = selected_product.category_id
  FOR SHARE;
  IF NOT FOUND OR selected_category.product_code_prefix IS NULL
    OR EXISTS (
      SELECT 1 FROM public.categories AS child
      WHERE child.parent_id = selected_category.id
    )
  THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;

  IF selected_seller.company_code IS NULL OR btrim(selected_seller.company_code) = '' THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;
  IF selected_product.moq IS NOT NULL AND selected_product.moq < 0
    OR selected_product.price IS NOT NULL AND selected_product.price < 0
    OR selected_product.currency IS NULL
    OR char_length(btrim(selected_product.currency)) NOT BETWEEN 3 AND 6
    OR selected_product.pack_size IS NOT NULL AND char_length(selected_product.pack_size) > 80
  THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.product_audience_memberships AS audience
  WHERE audience.product_id = selected_product.id
  ORDER BY audience.audience
  FOR UPDATE;
  SELECT COALESCE(jsonb_agg(audience.audience ORDER BY audience.audience), '[]'::jsonb)
  INTO audiences_json
  FROM public.product_audience_memberships AS audience
  WHERE audience.product_id = selected_product.id;
  IF jsonb_array_length(audiences_json) = 0 THEN
    RAISE EXCEPTION 'product_moderation_audience_required' USING ERRCODE = '55000';
  END IF;

  SELECT facts.* INTO selected_facts
  FROM public.product_draft_facts AS facts
  WHERE facts.product_draft_id = selected_product.id
  FOR UPDATE;
  IF FOUND THEN
    facts_snapshot := jsonb_build_object(
      'factsRevision', selected_facts.facts_revision,
      'facts', selected_facts.facts_json
    );
  ELSE
    facts_snapshot := 'null'::jsonb;
  END IF;

  PERFORM 1 FROM public.product_draft_descriptions AS description
  WHERE description.product_draft_id = selected_product.id
  ORDER BY description.language
  FOR UPDATE;
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'language', description.language,
        'descriptionText', description.description_text,
        'source', description.source,
        'factsRevision', description.facts_revision,
        'provider', description.provider,
        'model', description.model,
        'pipelineVersion', description.pipeline_version,
        'generatedAt', description.generated_at
      ) ORDER BY description.language
    ),
    '[]'::jsonb
  ) INTO descriptions_json
  FROM public.product_draft_descriptions AS description
  WHERE description.product_draft_id = selected_product.id;

  PERFORM 1 FROM public.product_draft_images AS image
  WHERE image.product_draft_id = selected_product.id
  ORDER BY image.source_position, image.id
  FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.product_draft_images AS image
    WHERE image.product_draft_id = selected_product.id
      AND image.status <> 'available'
  ) THEN
    RAISE EXCEPTION 'product_moderation_images_not_ready' USING ERRCODE = '55000';
  END IF;
  SELECT
    COALESCE(jsonb_agg(to_jsonb(image.id) ORDER BY image.source_position, image.id), '[]'::jsonb),
    count(*)::integer
  INTO image_ids_json, image_count
  FROM public.product_draft_images AS image
  WHERE image.product_draft_id = selected_product.id
    AND image.status = 'available';
  IF image_count < 1
    OR selected_product.cover_image_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.product_draft_images AS image
      WHERE image.product_draft_id = selected_product.id
        AND image.id = selected_product.cover_image_id
        AND image.status = 'available'
    )
  THEN
    RAISE EXCEPTION 'product_moderation_images_not_ready' USING ERRCODE = '55000';
  END IF;

  snapshot := jsonb_build_object(
    'schemaVersion', 1,
    'productId', selected_product.id,
    'sellerId', selected_product.seller_id,
    'productCode', selected_product.product_code,
    'productCodeInput', jsonb_build_object(
      'companyCode', selected_seller.company_code,
      'categoryPrefix', selected_category.product_code_prefix
    ),
    'title', selected_product.title,
    'titleSource', selected_product.title_source,
    'categoryId', selected_product.category_id,
    'audiences', audiences_json,
    'descriptions', descriptions_json,
    'facts', facts_snapshot,
    'minimumOrder', selected_product.moq,
    'packSize', selected_product.pack_size,
    'price', selected_product.price,
    'currency', selected_product.currency,
    'stock', selected_product.stock,
    'imageIds', image_ids_json,
    'coverImageId', selected_product.cover_image_id
  );

  INSERT INTO public.product_moderation_submissions (
    product_id,
    seller_id,
    submission_kind,
    revision,
    snapshot_schema_version,
    snapshot_json,
    review_status,
    seller_request_id,
    submitted_by_user_id
  ) VALUES (
    selected_product.id,
    selected_product.seller_id,
    'initial_publication',
    selected_product.moderation_revision,
    1,
    snapshot,
    'pending',
    p_seller_request_id,
    p_submitted_by_user_id
  ) RETURNING * INTO created_submission;

  INSERT INTO public.product_moderation_submission_images (
    submission_id,
    product_id,
    product_draft_image_id,
    position,
    is_cover
  )
  SELECT
    created_submission.id,
    selected_product.id,
    image.id,
    (row_number() OVER (ORDER BY image.source_position, image.id) - 1)::integer,
    image.id = selected_product.cover_image_id
  FROM public.product_draft_images AS image
  WHERE image.product_draft_id = selected_product.id
    AND image.status = 'available'
  ORDER BY image.source_position, image.id;

  INSERT INTO public.product_moderation_events (
    product_id,
    seller_id,
    submission_id,
    event_type,
    actor_user_id,
    expected_revision,
    request_id
  ) VALUES (
    selected_product.id,
    selected_product.seller_id,
    created_submission.id,
    'submitted',
    p_submitted_by_user_id,
    p_expected_moderation_revision,
    p_seller_request_id
  );

  UPDATE public.products AS product
  SET active_moderation_submission_id = created_submission.id
  WHERE product.id = selected_product.id;

  RETURN NEXT created_submission;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_product_moderation_working_copy(
  p_product_id uuid,
  p_seller_id uuid,
  p_expected_revision bigint,
  p_seller_request_id uuid,
  p_submitted_by_user_id uuid
)
RETURNS SETOF public.product_moderation_submissions
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_seller public.sellers%ROWTYPE;
  selected_category public.categories%ROWTYPE;
  selected_copy public.product_moderation_working_copies%ROWTYPE;
  replay_submission public.product_moderation_submissions%ROWTYPE;
  created_submission public.product_moderation_submissions%ROWTYPE;
  image_ids_json jsonb;
  cover_image_id uuid;
  image_count integer;
  cover_count integer;
BEGIN
  IF p_product_id IS NULL OR p_seller_id IS NULL OR p_expected_revision IS NULL
    OR p_expected_revision < 1 OR p_seller_request_id IS NULL
    OR p_submitted_by_user_id IS NULL
  THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id AND product.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT submission.* INTO replay_submission
  FROM public.product_moderation_submissions AS submission
  WHERE submission.seller_id = p_seller_id
    AND submission.seller_request_id = p_seller_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF replay_submission.product_id <> p_product_id
      OR replay_submission.revision <> p_expected_revision
      OR replay_submission.submission_kind <> 'update'
      OR replay_submission.submitted_by_user_id <> p_submitted_by_user_id
    THEN
      RAISE EXCEPTION 'product_moderation_submission_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN NEXT replay_submission;
    RETURN;
  END IF;

  selected_copy := public.assert_product_moderation_working_revision(
    p_product_id, p_seller_id, p_expected_revision
  );
  SELECT seller.* INTO selected_seller
  FROM public.sellers AS seller WHERE seller.id = p_seller_id FOR SHARE;
  IF NOT FOUND OR selected_seller.approved_profile_submission_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.seller_profile_submissions AS submission
      WHERE submission.id = selected_seller.approved_profile_submission_id
        AND submission.seller_id = selected_seller.id
        AND submission.status = 'approved'
    )
  THEN
    RAISE EXCEPTION 'product_moderation_seller_approval_required' USING ERRCODE = '55000';
  END IF;

  IF COALESCE(btrim(selected_copy.snapshot_json ->> 'title'), '') = ''
    OR char_length(selected_copy.snapshot_json ->> 'title') > 50
    OR selected_copy.snapshot_json ->> 'titleSource' NOT IN ('human', 'model')
  THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;
  IF selected_copy.snapshot_json ->> 'productId' IS DISTINCT FROM selected_product.id::text
    OR selected_copy.snapshot_json ->> 'sellerId' IS DISTINCT FROM selected_product.seller_id::text
    OR selected_copy.snapshot_json ->> 'productCode' IS DISTINCT FROM selected_product.product_code
    OR (selected_copy.snapshot_json ->> 'schemaVersion')::integer <> 1
  THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT category.* INTO selected_category
  FROM public.categories AS category
  WHERE category.id = (selected_copy.snapshot_json ->> 'categoryId')::uuid
  FOR SHARE;
  IF NOT FOUND OR selected_category.product_code_prefix IS NULL OR EXISTS (
    SELECT 1 FROM public.categories AS child WHERE child.parent_id = selected_category.id
  ) THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(selected_copy.snapshot_json -> 'audiences') <> 'array'
    OR jsonb_array_length(selected_copy.snapshot_json -> 'audiences') < 1
  THEN
    RAISE EXCEPTION 'product_moderation_audience_required' USING ERRCODE = '55000';
  END IF;

  PERFORM 1 FROM public.product_moderation_working_copy_images AS membership
  JOIN public.product_draft_images AS image
    ON image.product_draft_id = membership.product_id
   AND image.id = membership.product_draft_image_id
  WHERE membership.product_id = selected_product.id
  ORDER BY membership.position
  FOR UPDATE OF image;
  IF EXISTS (
    SELECT 1
    FROM public.product_moderation_working_copy_images AS membership
    JOIN public.product_draft_images AS image
      ON image.product_draft_id = membership.product_id
     AND image.id = membership.product_draft_image_id
    WHERE membership.product_id = selected_product.id
      AND image.status <> 'available'
  ) THEN
    RAISE EXCEPTION 'product_moderation_images_not_ready' USING ERRCODE = '55000';
  END IF;
  SELECT
    COALESCE(
      jsonb_agg(to_jsonb(membership.product_draft_image_id) ORDER BY membership.position),
      '[]'::jsonb
    ),
    (min(membership.product_draft_image_id::text) FILTER (WHERE membership.is_cover))::uuid,
    count(*)::integer,
    count(*) FILTER (WHERE membership.is_cover)::integer
  INTO image_ids_json, cover_image_id, image_count, cover_count
  FROM public.product_moderation_working_copy_images AS membership
  WHERE membership.product_id = selected_product.id;
  IF image_count < 1 OR cover_count <> 1
    OR image_ids_json IS DISTINCT FROM selected_copy.snapshot_json -> 'imageIds'
    OR to_jsonb(cover_image_id) IS DISTINCT FROM selected_copy.snapshot_json -> 'coverImageId'
    OR EXISTS (
      SELECT 1 FROM public.product_moderation_working_copy_images AS membership
      WHERE membership.product_id = selected_product.id
        AND membership.position <> (
          SELECT count(*)
          FROM public.product_moderation_working_copy_images AS earlier
          WHERE earlier.product_id = membership.product_id
            AND earlier.position < membership.position
        )
    )
  THEN
    RAISE EXCEPTION 'product_moderation_images_not_ready' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.product_moderation_submissions (
    product_id, seller_id, submission_kind, revision, snapshot_schema_version,
    snapshot_json, review_status, seller_request_id, submitted_by_user_id
  ) VALUES (
    selected_product.id,
    selected_product.seller_id,
    'update',
    selected_copy.revision,
    selected_copy.snapshot_schema_version,
    selected_copy.snapshot_json,
    'pending',
    p_seller_request_id,
    p_submitted_by_user_id
  ) RETURNING * INTO created_submission;

  INSERT INTO public.product_moderation_submission_images (
    submission_id, product_id, product_draft_image_id, position, is_cover
  )
  SELECT created_submission.id, membership.product_id,
    membership.product_draft_image_id, membership.position, membership.is_cover
  FROM public.product_moderation_working_copy_images AS membership
  WHERE membership.product_id = selected_product.id
  ORDER BY membership.position;

  INSERT INTO public.product_moderation_events (
    product_id, seller_id, submission_id, event_type, actor_user_id,
    expected_revision, request_id
  ) VALUES (
    selected_product.id, selected_product.seller_id, created_submission.id,
    'submitted', p_submitted_by_user_id, p_expected_revision, p_seller_request_id
  );
  UPDATE public.products AS product
  SET active_moderation_submission_id = created_submission.id
  WHERE product.id = selected_product.id;

  RETURN NEXT created_submission;
END;
$$;

COMMENT ON FUNCTION public.submit_initial_product_moderation(
  uuid, uuid, bigint, uuid, uuid
) IS 'Creates an initial immutable product moderation submission; stale description revisions are preserved for administrator review.';

COMMENT ON FUNCTION public.submit_product_moderation_working_copy(
  uuid, uuid, bigint, uuid, uuid
) IS 'Creates an immutable product update submission; stale description revisions are preserved for administrator review.';
