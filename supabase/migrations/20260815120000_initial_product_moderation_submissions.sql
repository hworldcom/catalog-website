BEGIN;

ALTER TABLE public.products
  ADD COLUMN moderation_revision bigint NOT NULL DEFAULT 1,
  ADD COLUMN approved_moderation_submission_id uuid,
  ADD COLUMN active_moderation_submission_id uuid,
  ADD CONSTRAINT products_moderation_revision_positive
    CHECK (moderation_revision > 0),
  ADD CONSTRAINT products_id_seller_id_unique UNIQUE (id, seller_id);

CREATE TABLE public.product_moderation_working_copies (
  product_id uuid PRIMARY KEY,
  seller_id uuid NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  snapshot_schema_version integer NOT NULL DEFAULT 1,
  snapshot_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_moderation_working_copies_product_fkey
    FOREIGN KEY (product_id, seller_id)
    REFERENCES public.products(id, seller_id)
    ON DELETE CASCADE,
  CONSTRAINT product_moderation_working_copies_revision_positive CHECK (revision > 0),
  CONSTRAINT product_moderation_working_copies_schema_version CHECK (snapshot_schema_version = 1),
  CONSTRAINT product_moderation_working_copies_snapshot_object
    CHECK (jsonb_typeof(snapshot_json) = 'object')
);

CREATE TABLE public.product_moderation_working_copy_images (
  product_id uuid NOT NULL,
  product_draft_image_id uuid NOT NULL,
  position integer NOT NULL,
  is_cover boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, product_draft_image_id),
  CONSTRAINT product_moderation_working_copy_images_position_unique
    UNIQUE (product_id, position),
  CONSTRAINT product_moderation_working_copy_images_position_nonnegative
    CHECK (position >= 0),
  CONSTRAINT product_moderation_working_copy_images_source_fkey
    FOREIGN KEY (product_id, product_draft_image_id)
    REFERENCES public.product_draft_images(product_draft_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX product_moderation_working_copy_images_one_cover
  ON public.product_moderation_working_copy_images(product_id)
  WHERE is_cover;

CREATE TABLE public.product_moderation_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  submission_kind text NOT NULL,
  revision bigint NOT NULL,
  snapshot_schema_version integer NOT NULL DEFAULT 1,
  snapshot_json jsonb NOT NULL,
  review_status text NOT NULL DEFAULT 'pending',
  seller_request_id uuid NOT NULL,
  submitted_by_user_id uuid NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  administrator_user_id uuid,
  decision_request_id uuid,
  seller_visible_reason text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_moderation_submissions_product_fkey
    FOREIGN KEY (product_id, seller_id)
    REFERENCES public.products(id, seller_id)
    ON DELETE RESTRICT,
  CONSTRAINT product_moderation_submissions_id_product_unique UNIQUE (id, product_id),
  CONSTRAINT product_moderation_submissions_id_product_seller_unique
    UNIQUE (id, product_id, seller_id),
  CONSTRAINT product_moderation_submissions_request_unique
    UNIQUE (seller_id, seller_request_id),
  CONSTRAINT product_moderation_submissions_product_revision_unique
    UNIQUE (product_id, revision),
  CONSTRAINT product_moderation_submissions_kind_check
    CHECK (submission_kind IN ('initial_publication', 'update')),
  CONSTRAINT product_moderation_submissions_revision_positive CHECK (revision > 0),
  CONSTRAINT product_moderation_submissions_schema_version CHECK (snapshot_schema_version = 1),
  CONSTRAINT product_moderation_submissions_snapshot_object
    CHECK (jsonb_typeof(snapshot_json) = 'object'),
  CONSTRAINT product_moderation_submissions_review_status_check
    CHECK (review_status IN ('pending', 'changes_requested', 'approved', 'rejected', 'withdrawn')),
  CONSTRAINT product_moderation_submissions_reason_length
    CHECK (seller_visible_reason IS NULL OR char_length(seller_visible_reason) <= 1000),
  CONSTRAINT product_moderation_submissions_decision_metadata
    CHECK (
      (review_status IN ('pending', 'withdrawn')
        AND administrator_user_id IS NULL
        AND decision_request_id IS NULL
        AND decided_at IS NULL)
      OR
      (review_status IN ('changes_requested', 'approved', 'rejected')
        AND administrator_user_id IS NOT NULL
        AND decision_request_id IS NOT NULL
        AND decided_at IS NOT NULL)
    ),
  CONSTRAINT product_moderation_submissions_decision_reason
    CHECK (
      (review_status IN ('changes_requested', 'rejected')
        AND seller_visible_reason IS NOT NULL
        AND btrim(seller_visible_reason) <> '')
      OR
      (review_status NOT IN ('changes_requested', 'rejected'))
    )
);

CREATE TABLE public.product_moderation_submission_images (
  submission_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_draft_image_id uuid NOT NULL,
  position integer NOT NULL,
  is_cover boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id, product_draft_image_id),
  CONSTRAINT product_moderation_submission_images_position_unique
    UNIQUE (submission_id, position),
  CONSTRAINT product_moderation_submission_images_identity_unique
    UNIQUE (submission_id, product_id, product_draft_image_id),
  CONSTRAINT product_moderation_submission_images_position_nonnegative
    CHECK (position >= 0),
  CONSTRAINT product_moderation_submission_images_submission_fkey
    FOREIGN KEY (submission_id, product_id)
    REFERENCES public.product_moderation_submissions(id, product_id)
    ON DELETE RESTRICT,
  CONSTRAINT product_moderation_submission_images_source_fkey
    FOREIGN KEY (product_id, product_draft_image_id)
    REFERENCES public.product_draft_images(product_draft_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX product_moderation_submission_images_one_cover
  ON public.product_moderation_submission_images(submission_id)
  WHERE is_cover;

CREATE TABLE public.product_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  submission_id uuid,
  event_type text NOT NULL,
  actor_user_id uuid NOT NULL,
  expected_revision bigint,
  reason text,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_moderation_events_product_fkey
    FOREIGN KEY (product_id, seller_id)
    REFERENCES public.products(id, seller_id)
    ON DELETE RESTRICT,
  CONSTRAINT product_moderation_events_submission_fkey
    FOREIGN KEY (submission_id, product_id, seller_id)
    REFERENCES public.product_moderation_submissions(id, product_id, seller_id)
    ON DELETE RESTRICT,
  CONSTRAINT product_moderation_events_type_check
    CHECK (event_type IN ('submitted', 'withdrawn', 'changes_requested', 'approved', 'rejected', 'activated', 'activation_failed', 'abandoned')),
  CONSTRAINT product_moderation_events_revision_positive
    CHECK (expected_revision IS NULL OR expected_revision > 0),
  CONSTRAINT product_moderation_events_reason_length
    CHECK (reason IS NULL OR char_length(reason) <= 1000),
  CONSTRAINT product_moderation_events_request_unique
    UNIQUE (product_id, request_id)
);

ALTER TABLE public.products
  ADD CONSTRAINT products_approved_moderation_submission_fkey
    FOREIGN KEY (approved_moderation_submission_id, id, seller_id)
    REFERENCES public.product_moderation_submissions(id, product_id, seller_id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT products_active_moderation_submission_fkey
    FOREIGN KEY (active_moderation_submission_id, id, seller_id)
    REFERENCES public.product_moderation_submissions(id, product_id, seller_id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.product_draft_description_generation_attempts
  ADD COLUMN claimed_moderation_revision bigint,
  ADD CONSTRAINT product_description_generation_moderation_revision_positive
    CHECK (claimed_moderation_revision IS NULL OR claimed_moderation_revision > 0);

CREATE FUNCTION public.product_moderation_registry_contains(
  p_setting_name text,
  p_product_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT position(
    ',' || p_product_id::text || ','
    IN ',' || COALESCE(current_setting(p_setting_name, true), '') || ','
  ) > 0;
$$;

CREATE FUNCTION public.product_moderation_registry_add(
  p_setting_name text,
  p_product_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_value text := COALESCE(current_setting(p_setting_name, true), '');
BEGIN
  IF public.product_moderation_registry_contains(p_setting_name, p_product_id) THEN
    RETURN;
  END IF;
  PERFORM set_config(
    p_setting_name,
    CASE WHEN current_value = '' THEN p_product_id::text ELSE current_value || ',' || p_product_id::text END,
    true
  );
END;
$$;

CREATE FUNCTION public.register_created_product_moderation_revision()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.product_moderation_registry_add(
    'bazoria.product_moderation_created_ids',
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.bump_initial_product_moderation_revision(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id
  FOR UPDATE;

  IF NOT FOUND OR selected_product.status <> 'draft' THEN
    RETURN;
  END IF;

  IF selected_product.active_moderation_submission_id IS NOT NULL THEN
    RAISE EXCEPTION 'product_moderation_submission_conflict' USING ERRCODE = '55000';
  END IF;

  IF public.product_moderation_registry_contains(
    'bazoria.product_moderation_created_ids',
    p_product_id
  ) OR public.product_moderation_registry_contains(
    'bazoria.product_moderation_bumped_ids',
    p_product_id
  ) THEN
    RETURN;
  END IF;

  UPDATE public.products AS product
  SET moderation_revision = moderation_revision + 1
  WHERE product.id = p_product_id;

  PERFORM public.product_moderation_registry_add(
    'bazoria.product_moderation_bumped_ids',
    p_product_id
  );
END;
$$;

CREATE FUNCTION public.enforce_product_moderation_scalar_mutation()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.title IS NOT DISTINCT FROM OLD.title
    AND NEW.title_source IS NOT DISTINCT FROM OLD.title_source
    AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id
    AND NEW.description IS NOT DISTINCT FROM OLD.description
    AND NEW.moq IS NOT DISTINCT FROM OLD.moq
    AND NEW.pack_size IS NOT DISTINCT FROM OLD.pack_size
    AND NEW.price IS NOT DISTINCT FROM OLD.price
    AND NEW.currency IS NOT DISTINCT FROM OLD.currency
    AND NEW.stock IS NOT DISTINCT FROM OLD.stock
    AND NEW.cover_image_url IS NOT DISTINCT FROM OLD.cover_image_url
    AND NEW.cover_image_id IS NOT DISTINCT FROM OLD.cover_image_id
    AND NEW.product_code IS NOT DISTINCT FROM OLD.product_code
    AND NEW.status IS NOT DISTINCT FROM OLD.status
  THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'draft' THEN
    RETURN NEW;
  END IF;

  IF OLD.active_moderation_submission_id IS NOT NULL THEN
    RAISE EXCEPTION 'product_moderation_submission_conflict' USING ERRCODE = '55000';
  END IF;

  IF public.product_moderation_registry_contains(
    'bazoria.product_moderation_created_ids',
    OLD.id
  ) THEN
    RETURN NEW;
  END IF;

  IF NOT public.product_moderation_registry_contains(
    'bazoria.product_moderation_bumped_ids',
    OLD.id
  ) THEN
    NEW.moderation_revision := OLD.moderation_revision + 1;
    PERFORM public.product_moderation_registry_add(
      'bazoria.product_moderation_bumped_ids',
      OLD.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.enforce_product_moderation_child_mutation()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product_id uuid;
  semantic_change boolean := true;
BEGIN
  IF TG_TABLE_NAME = 'product_draft_descriptions' THEN
    selected_product_id := COALESCE(NEW.product_draft_id, OLD.product_draft_id);
    IF TG_OP = 'UPDATE' THEN
      semantic_change := NEW.language IS DISTINCT FROM OLD.language
        OR NEW.description_text IS DISTINCT FROM OLD.description_text
        OR NEW.source IS DISTINCT FROM OLD.source
        OR NEW.facts_revision IS DISTINCT FROM OLD.facts_revision
        OR NEW.provider IS DISTINCT FROM OLD.provider
        OR NEW.model IS DISTINCT FROM OLD.model
        OR NEW.pipeline_version IS DISTINCT FROM OLD.pipeline_version
        OR NEW.generated_at IS DISTINCT FROM OLD.generated_at
        OR NEW.backfilled_from_legacy IS DISTINCT FROM OLD.backfilled_from_legacy;
    END IF;
  ELSIF TG_TABLE_NAME = 'product_draft_facts' THEN
    selected_product_id := COALESCE(NEW.product_draft_id, OLD.product_draft_id);
    IF TG_OP = 'UPDATE' THEN
      semantic_change := NEW.facts_json IS DISTINCT FROM OLD.facts_json
        OR NEW.facts_revision IS DISTINCT FROM OLD.facts_revision;
    END IF;
  ELSIF TG_TABLE_NAME = 'product_audience_memberships' THEN
    selected_product_id := COALESCE(NEW.product_id, OLD.product_id);
    IF TG_OP = 'UPDATE' THEN
      semantic_change := NEW.audience IS DISTINCT FROM OLD.audience
        OR NEW.product_id IS DISTINCT FROM OLD.product_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'product_draft_images' THEN
    selected_product_id := COALESCE(NEW.product_draft_id, OLD.product_draft_id);
    IF TG_OP = 'UPDATE' THEN
      semantic_change := NEW.product_draft_id IS DISTINCT FROM OLD.product_draft_id
        OR NEW.source_position IS DISTINCT FROM OLD.source_position
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.destination_key IS DISTINCT FROM OLD.destination_key
        OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
        OR NEW.content_type IS DISTINCT FROM OLD.content_type
        OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes;
    END IF;
  ELSE
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;

  IF semantic_change THEN
    PERFORM public.bump_initial_product_moderation_revision(selected_product_id);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_05_moderation_created
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.register_created_product_moderation_revision();

CREATE TRIGGER trg_products_05_moderation_scalar
  BEFORE UPDATE OF title, title_source, category_id, description, moq, pack_size,
    price, currency, stock, cover_image_url, cover_image_id, product_code, status
  ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_moderation_scalar_mutation();

CREATE TRIGGER trg_product_draft_descriptions_05_moderation
  BEFORE INSERT OR UPDATE OR DELETE ON public.product_draft_descriptions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_moderation_child_mutation();

CREATE TRIGGER trg_product_draft_facts_05_moderation
  BEFORE INSERT OR UPDATE OR DELETE ON public.product_draft_facts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_moderation_child_mutation();

CREATE TRIGGER trg_product_audience_memberships_05_moderation
  BEFORE INSERT OR UPDATE OR DELETE ON public.product_audience_memberships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_moderation_child_mutation();

CREATE TRIGGER trg_product_draft_images_05_moderation
  BEFORE INSERT OR UPDATE OR DELETE ON public.product_draft_images
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_moderation_child_mutation();

CREATE FUNCTION public.enforce_product_moderation_submission_immutability()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'product_moderation_submission_immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.product_id IS DISTINCT FROM OLD.product_id
    OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
    OR NEW.submission_kind IS DISTINCT FROM OLD.submission_kind
    OR NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW.snapshot_schema_version IS DISTINCT FROM OLD.snapshot_schema_version
    OR NEW.snapshot_json IS DISTINCT FROM OLD.snapshot_json
    OR NEW.seller_request_id IS DISTINCT FROM OLD.seller_request_id
    OR NEW.submitted_by_user_id IS DISTINCT FROM OLD.submitted_by_user_id
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'product_moderation_submission_immutable' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.reject_product_moderation_immutable_row_mutation()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'product_moderation_submission_immutable' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER trg_product_moderation_submissions_immutable
  BEFORE UPDATE OR DELETE ON public.product_moderation_submissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_moderation_submission_immutability();

CREATE TRIGGER trg_product_moderation_submission_images_immutable
  BEFORE UPDATE OR DELETE ON public.product_moderation_submission_images
  FOR EACH ROW EXECUTE FUNCTION public.reject_product_moderation_immutable_row_mutation();

CREATE TRIGGER trg_product_moderation_events_immutable
  BEFORE UPDATE OR DELETE ON public.product_moderation_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_product_moderation_immutable_row_mutation();

CREATE FUNCTION public.validate_product_moderation_submission_images(p_submission_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_snapshot jsonb;
  normalized_image_ids jsonb;
  normalized_cover_id uuid;
  image_count integer;
  cover_count integer;
BEGIN
  SELECT submission.snapshot_json INTO selected_snapshot
  FROM public.product_moderation_submissions AS submission
  WHERE submission.id = p_submission_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT
    COALESCE(jsonb_agg(to_jsonb(image.product_draft_image_id) ORDER BY image.position), '[]'::jsonb),
    (min(image.product_draft_image_id::text) FILTER (WHERE image.is_cover))::uuid,
    count(*)::integer,
    count(*) FILTER (WHERE image.is_cover)::integer
  INTO normalized_image_ids, normalized_cover_id, image_count, cover_count
  FROM public.product_moderation_submission_images AS image
  WHERE image.submission_id = p_submission_id;

  IF image_count < 1
    OR cover_count <> 1
    OR normalized_image_ids IS DISTINCT FROM selected_snapshot -> 'imageIds'
    OR to_jsonb(normalized_cover_id) IS DISTINCT FROM selected_snapshot -> 'coverImageId'
    OR EXISTS (
      SELECT 1
      FROM public.product_moderation_submission_images AS image
      WHERE image.submission_id = p_submission_id
        AND image.position <> (
          SELECT count(*)
          FROM public.product_moderation_submission_images AS earlier
          WHERE earlier.submission_id = image.submission_id
            AND earlier.position < image.position
        )
    )
  THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION public.validate_product_moderation_submission_images_trigger()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_submission_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'product_moderation_submissions' THEN
    selected_submission_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    selected_submission_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.submission_id
      ELSE NEW.submission_id
    END;
  END IF;
  PERFORM public.validate_product_moderation_submission_images(selected_submission_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_product_moderation_submissions_images_match
  AFTER INSERT OR UPDATE ON public.product_moderation_submissions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_moderation_submission_images_trigger();

CREATE CONSTRAINT TRIGGER trg_product_moderation_submission_images_match
  AFTER INSERT OR UPDATE OR DELETE ON public.product_moderation_submission_images
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_moderation_submission_images_trigger();

CREATE FUNCTION public.read_initial_product_moderation_state(
  p_product_id uuid,
  p_seller_id uuid
)
RETURNS TABLE (
  product_id uuid,
  seller_id uuid,
  moderation_revision bigint,
  product_status public.product_status,
  seller_approved boolean,
  active_submission_id uuid,
  active_submission_status text,
  active_submission_revision bigint,
  active_submission_submitted_at timestamptz,
  active_submission_snapshot jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_product_id IS NULL OR p_seller_id IS NULL THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT
    product.id,
    product.seller_id,
    product.moderation_revision,
    product.status,
    seller.approved_profile_submission_id IS NOT NULL,
    submission.id,
    submission.review_status,
    submission.revision,
    submission.submitted_at,
    submission.snapshot_json
  FROM public.products AS product
  JOIN public.sellers AS seller
    ON seller.id = product.seller_id
  LEFT JOIN public.product_moderation_submissions AS submission
    ON submission.id = product.active_moderation_submission_id
   AND submission.product_id = product.id
   AND submission.seller_id = product.seller_id
  WHERE product.id = p_product_id
    AND product.seller_id = p_seller_id;
END;
$$;

CREATE FUNCTION public.submit_initial_product_moderation(
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
  selected_facts_revision integer;
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
    OR selected_product.currency IS NULL OR char_length(btrim(selected_product.currency)) NOT BETWEEN 3 AND 6
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
    selected_facts_revision := selected_facts.facts_revision;
    facts_snapshot := jsonb_build_object(
      'factsRevision', selected_facts.facts_revision,
      'facts', selected_facts.facts_json
    );
  ELSE
    selected_facts_revision := NULL;
    facts_snapshot := 'null'::jsonb;
  END IF;

  PERFORM 1 FROM public.product_draft_descriptions AS description
  WHERE description.product_draft_id = selected_product.id
  ORDER BY description.language
  FOR UPDATE;
  IF EXISTS (
    SELECT 1
    FROM public.product_draft_descriptions AS description
    WHERE description.product_draft_id = selected_product.id
      AND description.facts_revision IS DISTINCT FROM selected_facts_revision
  ) THEN
    RAISE EXCEPTION 'product_moderation_description_outdated' USING ERRCODE = '55000';
  END IF;
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

CREATE FUNCTION public.withdraw_initial_product_moderation(
  p_product_id uuid,
  p_seller_id uuid,
  p_submission_id uuid,
  p_expected_moderation_revision bigint,
  p_request_id uuid,
  p_actor_user_id uuid
)
RETURNS SETOF public.product_moderation_submissions
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_submission public.product_moderation_submissions%ROWTYPE;
  replay_event public.product_moderation_events%ROWTYPE;
BEGIN
  IF p_product_id IS NULL
    OR p_seller_id IS NULL
    OR p_submission_id IS NULL
    OR p_expected_moderation_revision IS NULL
    OR p_expected_moderation_revision < 1
    OR p_request_id IS NULL
    OR p_actor_user_id IS NULL
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

  SELECT event.* INTO replay_event
  FROM public.product_moderation_events AS event
  WHERE event.product_id = p_product_id
    AND event.request_id = p_request_id;
  IF FOUND THEN
    IF replay_event.event_type <> 'withdrawn'
      OR replay_event.submission_id <> p_submission_id
      OR replay_event.actor_user_id <> p_actor_user_id
      OR replay_event.expected_revision <> p_expected_moderation_revision
    THEN
      RAISE EXCEPTION 'product_moderation_submission_conflict' USING ERRCODE = '23505';
    END IF;
    SELECT submission.* INTO selected_submission
    FROM public.product_moderation_submissions AS submission
    WHERE submission.id = p_submission_id
      AND submission.product_id = p_product_id
      AND submission.seller_id = p_seller_id;
    RETURN NEXT selected_submission;
    RETURN;
  END IF;

  IF selected_product.moderation_revision <> p_expected_moderation_revision THEN
    RAISE EXCEPTION 'product_moderation_working_revision_conflict' USING ERRCODE = '40001';
  END IF;
  IF selected_product.active_moderation_submission_id IS DISTINCT FROM p_submission_id THEN
    RAISE EXCEPTION 'product_moderation_submission_stale' USING ERRCODE = '55000';
  END IF;

  SELECT submission.* INTO selected_submission
  FROM public.product_moderation_submissions AS submission
  WHERE submission.id = p_submission_id
    AND submission.product_id = p_product_id
    AND submission.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF selected_submission.review_status <> 'pending' THEN
    RAISE EXCEPTION 'product_moderation_submission_stale' USING ERRCODE = '55000';
  END IF;

  UPDATE public.product_moderation_submissions AS submission
  SET review_status = 'withdrawn'
  WHERE submission.id = selected_submission.id
  RETURNING * INTO selected_submission;

  UPDATE public.products AS product
  SET
    active_moderation_submission_id = NULL,
    moderation_revision = moderation_revision + 1
  WHERE product.id = selected_product.id;

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
    selected_submission.id,
    'withdrawn',
    p_actor_user_id,
    p_expected_moderation_revision,
    p_request_id
  );

  RETURN NEXT selected_submission;
END;
$$;

CREATE FUNCTION public.assert_initial_product_moderation_revision(
  p_product_id uuid,
  p_expected_seller_id uuid,
  p_expected_moderation_revision bigint
)
RETURNS public.products
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
BEGIN
  IF p_product_id IS NULL
    OR p_expected_moderation_revision IS NULL
    OR p_expected_moderation_revision < 1
  THEN
    RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id
    AND (p_expected_seller_id IS NULL OR product.seller_id = p_expected_seller_id)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_moderation_not_found' USING ERRCODE = 'P0002';
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
  RETURN selected_product;
END;
$$;

CREATE FUNCTION public.save_initial_product_draft_with_description(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_expected_moderation_revision bigint,
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
  p_status public.product_status,
  p_audiences text[]
)
RETURNS TABLE(
  result text,
  product_draft_id uuid,
  title text,
  title_source text,
  product_status public.product_status,
  english_description text,
  moderation_revision bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_product_draft_id IS NULL THEN
    IF p_expected_moderation_revision IS NOT NULL OR p_status <> 'draft' THEN
      RAISE EXCEPTION 'product_moderation_submission_invalid' USING ERRCODE = '22023';
    END IF;
  ELSE
    PERFORM public.assert_initial_product_moderation_revision(
      p_product_draft_id,
      p_seller_id,
      p_expected_moderation_revision
    );
    IF p_status <> 'draft' THEN
      RAISE EXCEPTION 'product_moderation_product_not_editable' USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN QUERY
  WITH saved AS MATERIALIZED (
    SELECT operation.*
    FROM public.save_seller_product_with_description(
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
      p_status,
      p_audiences
    ) AS operation
  )
  SELECT
    saved.result,
    saved.product_draft_id,
    saved.title,
    saved.title_source,
    saved.product_status,
    saved.english_description,
    product.moderation_revision
  FROM saved
  LEFT JOIN public.products AS product ON product.id = saved.product_draft_id;
END;
$$;

CREATE FUNCTION public.update_initial_product_draft_title(
  p_product_draft_id uuid,
  p_expected_seller_id uuid,
  p_expected_moderation_revision bigint,
  p_title text,
  p_title_source text
)
RETURNS TABLE(
  product_draft_id uuid,
  title text,
  title_source text,
  product_status public.product_status,
  moderation_revision bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id,
    p_expected_seller_id,
    p_expected_moderation_revision
  );
  RETURN QUERY
  UPDATE public.products AS product
  SET title = p_title, title_source = p_title_source
  WHERE product.id = p_product_draft_id
  RETURNING
    product.id,
    product.title,
    product.title_source,
    product.status,
    product.moderation_revision;
END;
$$;

CREATE FUNCTION public.apply_initial_product_draft_facts_patch(
  p_product_draft_id uuid,
  p_normalized_patch jsonb,
  p_expected_seller_id uuid,
  p_expected_moderation_revision bigint
)
RETURNS TABLE(
  result text,
  product_draft_id uuid,
  facts_json jsonb,
  facts_revision integer,
  updated_at timestamptz,
  product_status public.product_status,
  moderation_revision bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id,
    p_expected_seller_id,
    p_expected_moderation_revision
  );
  RETURN QUERY
  WITH applied AS MATERIALIZED (
    SELECT operation.*
    FROM public.apply_product_draft_facts_patch(
      p_product_draft_id,
      p_normalized_patch,
      p_expected_seller_id
    ) AS operation
  )
  SELECT
    applied.result,
    applied.product_draft_id,
    applied.facts_json,
    applied.facts_revision,
    applied.updated_at,
    applied.product_status,
    product.moderation_revision
  FROM applied
  LEFT JOIN public.products AS product ON product.id = applied.product_draft_id;
END;
$$;

CREATE FUNCTION public.apply_initial_product_draft_description_patch(
  p_product_draft_id uuid,
  p_expected_seller_id uuid,
  p_expected_moderation_revision bigint,
  p_pl_patch_present boolean,
  p_pl_description text,
  p_en_patch_present boolean,
  p_en_description text,
  p_de_patch_present boolean,
  p_de_description text,
  p_vi_patch_present boolean,
  p_vi_description text
)
RETURNS TABLE(result text, snapshot jsonb, moderation_revision bigint)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id,
    p_expected_seller_id,
    p_expected_moderation_revision
  );
  RETURN QUERY
  WITH applied AS MATERIALIZED (
    SELECT operation.*
    FROM public.apply_scoped_product_draft_description_patch(
      p_product_draft_id,
      p_expected_seller_id,
      p_pl_patch_present,
      p_pl_description,
      p_en_patch_present,
      p_en_description,
      p_de_patch_present,
      p_de_description,
      p_vi_patch_present,
      p_vi_description
    ) AS operation
  )
  SELECT
    applied.result,
    applied.snapshot,
    product.moderation_revision
  FROM applied
  LEFT JOIN public.products AS product ON product.id = p_product_draft_id;
END;
$$;

CREATE FUNCTION public.prepare_initial_product_draft_image_uploads(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_expected_moderation_revision bigint,
  p_expected_gallery_revision bigint,
  p_files jsonb,
  p_verified_absent_image_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  operation_result jsonb;
  resulting_revision bigint;
BEGIN
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id, p_seller_id, p_expected_moderation_revision
  );
  operation_result := public.prepare_seller_product_draft_image_uploads(
    p_product_draft_id,
    p_seller_id,
    p_expected_gallery_revision,
    p_files,
    p_verified_absent_image_ids
  );
  SELECT product.moderation_revision INTO resulting_revision
  FROM public.products AS product WHERE product.id = p_product_draft_id;
  RETURN operation_result || jsonb_build_object('moderationRevision', resulting_revision);
END;
$$;

CREATE FUNCTION public.finalize_initial_product_draft_image_uploads(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_expected_moderation_revision bigint,
  p_results jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  operation_result jsonb;
  resulting_revision bigint;
BEGIN
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id, p_seller_id, p_expected_moderation_revision
  );
  operation_result := public.finalize_seller_product_draft_image_uploads(
    p_product_draft_id, p_seller_id, p_results
  );
  SELECT product.moderation_revision INTO resulting_revision
  FROM public.products AS product WHERE product.id = p_product_draft_id;
  RETURN operation_result || jsonb_build_object('moderationRevision', resulting_revision);
END;
$$;

CREATE FUNCTION public.complete_initial_product_draft_image_upload_cleanup(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_expected_moderation_revision bigint,
  p_product_draft_image_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  operation_result jsonb;
  resulting_revision bigint;
BEGIN
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id, p_seller_id, p_expected_moderation_revision
  );
  operation_result := public.complete_seller_product_draft_image_upload_cleanup(
    p_product_draft_id, p_seller_id, p_product_draft_image_id
  );
  SELECT product.moderation_revision INTO resulting_revision
  FROM public.products AS product WHERE product.id = p_product_draft_id;
  RETURN operation_result || jsonb_build_object('moderationRevision', resulting_revision);
END;
$$;

CREATE FUNCTION public.fail_initial_product_draft_image_upload_cleanup(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_expected_moderation_revision bigint,
  p_product_draft_image_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  operation_result jsonb;
  resulting_revision bigint;
BEGIN
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id, p_seller_id, p_expected_moderation_revision
  );
  operation_result := public.fail_seller_product_draft_image_upload_cleanup(
    p_product_draft_id, p_seller_id, p_product_draft_image_id
  );
  SELECT product.moderation_revision INTO resulting_revision
  FROM public.products AS product WHERE product.id = p_product_draft_id;
  RETURN operation_result || jsonb_build_object('moderationRevision', resulting_revision);
END;
$$;

CREATE FUNCTION public.update_initial_product_draft_image_gallery(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_expected_moderation_revision bigint,
  p_expected_gallery_revision bigint,
  p_ordered_available_image_ids uuid[],
  p_cover_image_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  operation_result jsonb;
  resulting_revision bigint;
BEGIN
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id, p_seller_id, p_expected_moderation_revision
  );
  operation_result := public.update_seller_product_draft_image_gallery(
    p_product_draft_id,
    p_seller_id,
    p_expected_gallery_revision,
    p_ordered_available_image_ids,
    p_cover_image_id
  );
  SELECT product.moderation_revision INTO resulting_revision
  FROM public.products AS product WHERE product.id = p_product_draft_id;
  RETURN operation_result || jsonb_build_object('moderationRevision', resulting_revision);
END;
$$;

CREATE FUNCTION public.begin_initial_product_draft_image_removal(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_expected_moderation_revision bigint,
  p_product_draft_image_id uuid,
  p_expected_gallery_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  operation_result jsonb;
  resulting_revision bigint;
BEGIN
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id, p_seller_id, p_expected_moderation_revision
  );
  operation_result := public.begin_seller_product_draft_image_removal(
    p_product_draft_id,
    p_seller_id,
    p_product_draft_image_id,
    p_expected_gallery_revision
  );
  SELECT product.moderation_revision INTO resulting_revision
  FROM public.products AS product WHERE product.id = p_product_draft_id;
  RETURN operation_result || jsonb_build_object('moderationRevision', resulting_revision);
END;
$$;

CREATE FUNCTION public.complete_initial_product_draft_image_removal(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_expected_moderation_revision bigint,
  p_product_draft_image_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  operation_result jsonb;
  resulting_revision bigint;
BEGIN
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id, p_seller_id, p_expected_moderation_revision
  );
  operation_result := public.complete_seller_product_draft_image_removal(
    p_product_draft_id, p_seller_id, p_product_draft_image_id
  );
  SELECT product.moderation_revision INTO resulting_revision
  FROM public.products AS product WHERE product.id = p_product_draft_id;
  RETURN operation_result || jsonb_build_object('moderationRevision', resulting_revision);
END;
$$;

CREATE FUNCTION public.fail_initial_product_draft_image_removal(
  p_product_draft_id uuid,
  p_seller_id uuid,
  p_expected_moderation_revision bigint,
  p_product_draft_image_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  operation_result jsonb;
  resulting_revision bigint;
BEGIN
  PERFORM public.assert_initial_product_moderation_revision(
    p_product_draft_id, p_seller_id, p_expected_moderation_revision
  );
  operation_result := public.fail_seller_product_draft_image_removal(
    p_product_draft_id, p_seller_id, p_product_draft_image_id
  );
  SELECT product.moderation_revision INTO resulting_revision
  FROM public.products AS product WHERE product.id = p_product_draft_id;
  RETURN operation_result || jsonb_build_object('moderationRevision', resulting_revision);
END;
$$;

CREATE FUNCTION public.archive_initial_product_draft(
  p_product_id uuid,
  p_seller_id uuid,
  p_expected_moderation_revision bigint
)
RETURNS TABLE (
  result text,
  product_id uuid,
  product_status public.product_status,
  moderation_revision bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_id AND product.seller_id = p_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'product_not_found'::text,
      NULL::uuid,
      NULL::public.product_status,
      NULL::bigint;
    RETURN;
  END IF;
  IF selected_product.status = 'draft' THEN
    PERFORM public.assert_initial_product_moderation_revision(
      p_product_id, p_seller_id, p_expected_moderation_revision
    );
  ELSIF selected_product.active_moderation_submission_id IS NOT NULL THEN
    RAISE EXCEPTION 'product_moderation_submission_conflict' USING ERRCODE = '55000';
  END IF;
  RETURN QUERY
  WITH archived AS MATERIALIZED (
    SELECT operation.*
    FROM public.archive_seller_product(p_product_id, p_seller_id) AS operation
  )
  SELECT
    archived.result,
    archived.product_id,
    archived.product_status,
    product.moderation_revision
  FROM archived
  LEFT JOIN public.products AS product ON product.id = archived.product_id;
END;
$$;

ALTER FUNCTION public.claim_product_draft_description_generation(uuid, uuid)
  RENAME TO claim_product_draft_description_generation_unmoderated;

CREATE FUNCTION public.claim_product_draft_description_generation(
  p_product_draft_id uuid,
  p_expected_seller_id uuid
)
RETURNS TABLE(
  result text,
  attempt_token uuid,
  category_id uuid,
  category_slug text,
  category_name text,
  facts_revision integer,
  facts_json jsonb,
  human_languages text[],
  title_blank boolean,
  cover_source text,
  cover_image_id uuid,
  cover_image_url text,
  cover_storage_bucket text,
  cover_object_key text,
  cover_content_type text,
  cover_size_bytes bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND product.seller_id = p_expected_seller_id
  FOR UPDATE;
  IF FOUND AND selected_product.active_moderation_submission_id IS NOT NULL THEN
    result := 'not_editable';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO
    result, attempt_token, category_id, category_slug, category_name,
    facts_revision, facts_json, human_languages, title_blank, cover_source,
    cover_image_id, cover_image_url, cover_storage_bucket, cover_object_key,
    cover_content_type, cover_size_bytes
  FROM public.claim_product_draft_description_generation_unmoderated(
    p_product_draft_id,
    p_expected_seller_id
  );

  IF result = 'claimed' THEN
    UPDATE public.product_draft_description_generation_attempts AS attempt
    SET claimed_moderation_revision = selected_product.moderation_revision
    WHERE attempt.product_draft_id = selected_product.id
      AND attempt.status = 'running';
  END IF;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.finalize_product_draft_description_generation(
  uuid, uuid, uuid, uuid, integer, text, uuid, text, text, text, text, bigint,
  jsonb, text, text, text, text, timestamptz
) RENAME TO finalize_product_draft_description_generation_unmoderated;

CREATE FUNCTION public.finalize_product_draft_description_generation(
  p_product_draft_id uuid,
  p_expected_seller_id uuid,
  p_attempt_token uuid,
  p_expected_category_id uuid,
  p_expected_facts_revision integer,
  p_expected_cover_source text,
  p_expected_cover_image_id uuid,
  p_expected_cover_image_url text,
  p_expected_cover_storage_bucket text,
  p_expected_cover_object_key text,
  p_expected_cover_content_type text,
  p_expected_cover_size_bytes bigint,
  p_descriptions jsonb,
  p_title_proposal text,
  p_provider text,
  p_model text,
  p_pipeline_version text,
  p_generated_at timestamptz
)
RETURNS TABLE(result text, description_snapshot jsonb, title_snapshot jsonb)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_product public.products%ROWTYPE;
  selected_attempt public.product_draft_description_generation_attempts%ROWTYPE;
BEGIN
  SELECT product.* INTO selected_product
  FROM public.products AS product
  WHERE product.id = p_product_draft_id
    AND product.seller_id = p_expected_seller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  SELECT attempt.* INTO selected_attempt
  FROM public.product_draft_description_generation_attempts AS attempt
  WHERE attempt.product_draft_id = selected_product.id
  FOR UPDATE;

  IF selected_product.active_moderation_submission_id IS NOT NULL
    OR selected_attempt.claimed_moderation_revision IS DISTINCT FROM selected_product.moderation_revision
  THEN
    UPDATE public.product_draft_description_generation_attempts AS attempt
    SET
      status = 'failed',
      attempt_token = NULL,
      claim_started_at = NULL,
      finished_at = now(),
      error_code = 'product_description_generation_input_changed'
    WHERE attempt.product_draft_id = selected_product.id
      AND attempt.status = 'running'
      AND attempt.attempt_token = p_attempt_token;
    RETURN QUERY SELECT 'input_changed'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  RETURN QUERY
  WITH finalized AS MATERIALIZED (
    SELECT operation.*
    FROM public.finalize_product_draft_description_generation_unmoderated(
      p_product_draft_id,
      p_expected_seller_id,
      p_attempt_token,
      p_expected_category_id,
      p_expected_facts_revision,
      p_expected_cover_source,
      p_expected_cover_image_id,
      p_expected_cover_image_url,
      p_expected_cover_storage_bucket,
      p_expected_cover_object_key,
      p_expected_cover_content_type,
      p_expected_cover_size_bytes,
      p_descriptions,
      p_title_proposal,
      p_provider,
      p_model,
      p_pipeline_version,
      p_generated_at
    ) AS operation
  )
  SELECT
    finalized.result,
    CASE
      WHEN finalized.description_snapshot IS NULL THEN NULL
      ELSE finalized.description_snapshot || jsonb_build_object(
        'moderationRevision', product.moderation_revision
      )
    END,
    CASE
      WHEN finalized.title_snapshot IS NULL THEN NULL
      ELSE finalized.title_snapshot || jsonb_build_object(
        'moderationRevision', product.moderation_revision
      )
    END
  FROM finalized
  LEFT JOIN public.products AS product ON product.id = p_product_draft_id;
END;
$$;

ALTER TABLE public.product_moderation_working_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_moderation_working_copy_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_moderation_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_moderation_submission_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_moderation_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.product_moderation_working_copies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.product_moderation_working_copy_images FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.product_moderation_submissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.product_moderation_submission_images FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.product_moderation_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.product_moderation_working_copies TO service_role;
GRANT ALL ON public.product_moderation_working_copy_images TO service_role;
GRANT ALL ON public.product_moderation_submissions TO service_role;
GRANT ALL ON public.product_moderation_submission_images TO service_role;
GRANT ALL ON public.product_moderation_events TO service_role;

REVOKE UPDATE (moderation_revision, approved_moderation_submission_id, active_moderation_submission_id)
  ON public.products FROM authenticated;

REVOKE ALL ON FUNCTION public.product_moderation_registry_contains(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.product_moderation_registry_add(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_created_product_moderation_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_initial_product_moderation_revision(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_product_moderation_scalar_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_product_moderation_child_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_product_moderation_submission_immutability() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_product_moderation_immutable_row_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_product_moderation_submission_images(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_product_moderation_submission_images_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_initial_product_moderation_state(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_initial_product_moderation(uuid, uuid, bigint, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.withdraw_initial_product_moderation(uuid, uuid, uuid, bigint, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_initial_product_moderation_revision(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_initial_product_draft_with_description(
  uuid, uuid, bigint, boolean, text, boolean, text, uuid, integer, text,
  numeric, text, public.stock_status, boolean, text, boolean,
  public.product_status, text[]
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_initial_product_draft_title(uuid, uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_initial_product_draft_facts_patch(uuid, jsonb, uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_initial_product_draft_description_patch(
  uuid, uuid, bigint, boolean, text, boolean, text, boolean, text, boolean, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_initial_product_draft_image_uploads(
  uuid, uuid, bigint, bigint, jsonb, uuid[]
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_initial_product_draft_image_uploads(
  uuid, uuid, bigint, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_initial_product_draft_image_upload_cleanup(
  uuid, uuid, bigint, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_initial_product_draft_image_upload_cleanup(
  uuid, uuid, bigint, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_initial_product_draft_image_gallery(
  uuid, uuid, bigint, bigint, uuid[], uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_initial_product_draft_image_removal(
  uuid, uuid, bigint, uuid, bigint
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_initial_product_draft_image_removal(
  uuid, uuid, bigint, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_initial_product_draft_image_removal(
  uuid, uuid, bigint, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_initial_product_draft(uuid, uuid, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_product_draft_description_generation_unmoderated(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_product_draft_description_generation_unmoderated(
  uuid, uuid, uuid, uuid, integer, text, uuid, text, text, text, text, bigint,
  jsonb, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_product_draft_description_generation(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_product_draft_description_generation(
  uuid, uuid, uuid, uuid, integer, text, uuid, text, text, text, text, bigint,
  jsonb, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.read_initial_product_moderation_state(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_initial_product_moderation(uuid, uuid, bigint, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_initial_product_moderation(uuid, uuid, uuid, bigint, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_initial_product_draft_with_description(
  uuid, uuid, bigint, boolean, text, boolean, text, uuid, integer, text,
  numeric, text, public.stock_status, boolean, text, boolean,
  public.product_status, text[]
) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_initial_product_draft_title(uuid, uuid, bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_initial_product_draft_facts_patch(uuid, jsonb, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_initial_product_draft_description_patch(
  uuid, uuid, bigint, boolean, text, boolean, text, boolean, text, boolean, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_initial_product_draft_image_uploads(
  uuid, uuid, bigint, bigint, jsonb, uuid[]
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_initial_product_draft_image_uploads(
  uuid, uuid, bigint, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_initial_product_draft_image_upload_cleanup(
  uuid, uuid, bigint, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_initial_product_draft_image_upload_cleanup(
  uuid, uuid, bigint, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_initial_product_draft_image_gallery(
  uuid, uuid, bigint, bigint, uuid[], uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_initial_product_draft_image_removal(
  uuid, uuid, bigint, uuid, bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_initial_product_draft_image_removal(
  uuid, uuid, bigint, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_initial_product_draft_image_removal(
  uuid, uuid, bigint, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_initial_product_draft(uuid, uuid, bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_product_draft_description_generation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_product_draft_description_generation(
  uuid, uuid, uuid, uuid, integer, text, uuid, text, text, text, text, bigint,
  jsonb, text, text, text, text, timestamptz
) TO service_role;

COMMIT;
