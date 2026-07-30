BEGIN;

CREATE TABLE public.seller_classifier_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id),
  client_request_id uuid NOT NULL,
  classifier_organization_id uuid NOT NULL,
  classifier_batch_id uuid,
  max_files integer,
  max_file_size_bytes bigint,
  provisioning_status text NOT NULL DEFAULT 'provisioning',
  last_known_stage text NOT NULL DEFAULT 'provisioning',
  original_file_count integer NOT NULL DEFAULT 0,
  processed_file_count integer NOT NULL DEFAULT 0,
  group_count integer NOT NULL DEFAULT 0,
  product_draft_count integer NOT NULL DEFAULT 0,
  error_code text,
  retryable boolean NOT NULL DEFAULT false,
  initiated_by_user_id uuid NOT NULL,
  initiator_kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_classifier_batches_seller_request_unique
    UNIQUE (seller_id, client_request_id),
  CONSTRAINT seller_classifier_batches_provisioning_status_check
    CHECK (provisioning_status IN ('provisioning', 'ready', 'failed')),
  CONSTRAINT seller_classifier_batches_stage_check
    CHECK (
      last_known_stage IN (
        'provisioning',
        'upload',
        'processing',
        'review',
        'approved',
        'importing',
        'drafts_ready',
        'failed'
      )
    ),
  CONSTRAINT seller_classifier_batches_initiator_kind_check
    CHECK (initiator_kind IN ('seller', 'administrator')),
  CONSTRAINT seller_classifier_batches_counts_check
    CHECK (
      original_file_count >= 0
      AND processed_file_count >= 0
      AND group_count >= 0
      AND product_draft_count >= 0
    ),
  CONSTRAINT seller_classifier_batches_limits_check
    CHECK (
      (max_files IS NULL OR max_files > 0)
      AND (max_file_size_bytes IS NULL OR max_file_size_bytes > 0)
    ),
  CONSTRAINT seller_classifier_batches_ready_check
    CHECK (
      provisioning_status <> 'ready'
      OR (
        classifier_batch_id IS NOT NULL
        AND max_files IS NOT NULL
        AND max_file_size_bytes IS NOT NULL
        AND error_code IS NULL
        AND retryable = false
      )
    ),
  CONSTRAINT seller_classifier_batches_provisioning_shape_check
    CHECK (
      provisioning_status <> 'provisioning'
      OR (
        classifier_batch_id IS NULL
        AND max_files IS NULL
        AND max_file_size_bytes IS NULL
        AND error_code IS NULL
        AND retryable = false
        AND last_known_stage = 'provisioning'
      )
    ),
  CONSTRAINT seller_classifier_batches_failed_shape_check
    CHECK (
      provisioning_status <> 'failed'
      OR (
        classifier_batch_id IS NULL
        AND max_files IS NULL
        AND max_file_size_bytes IS NULL
        AND error_code IS NOT NULL
        AND last_known_stage = 'failed'
      )
    )
);

CREATE UNIQUE INDEX seller_classifier_batches_classifier_batch_unique
  ON public.seller_classifier_batches (
    classifier_organization_id,
    classifier_batch_id
  )
  WHERE classifier_batch_id IS NOT NULL;

CREATE INDEX seller_classifier_batches_seller_created
  ON public.seller_classifier_batches (seller_id, created_at DESC, id DESC);

ALTER TABLE public.seller_classifier_batches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.seller_classifier_batches FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.seller_classifier_batches TO service_role;

CREATE TRIGGER trg_seller_classifier_batches_updated
  BEFORE UPDATE ON public.seller_classifier_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.enforce_seller_classifier_batch_immutability()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
    OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
    OR NEW.classifier_organization_id IS DISTINCT FROM OLD.classifier_organization_id
    OR NEW.initiated_by_user_id IS DISTINCT FROM OLD.initiated_by_user_id
    OR NEW.initiator_kind IS DISTINCT FROM OLD.initiator_kind
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'seller_classifier_batch_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.classifier_batch_id IS NOT NULL
    AND NEW.classifier_batch_id IS DISTINCT FROM OLD.classifier_batch_id
  THEN
    RAISE EXCEPTION 'seller_classifier_batch_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.max_files IS NOT NULL
    AND NEW.max_files IS DISTINCT FROM OLD.max_files
  THEN
    RAISE EXCEPTION 'seller_classifier_batch_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.max_file_size_bytes IS NOT NULL
    AND NEW.max_file_size_bytes IS DISTINCT FROM OLD.max_file_size_bytes
  THEN
    RAISE EXCEPTION 'seller_classifier_batch_immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seller_classifier_batches_immutable
  BEFORE UPDATE ON public.seller_classifier_batches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seller_classifier_batch_immutability();

CREATE FUNCTION public.create_or_get_seller_classifier_batch(
  p_seller_id uuid,
  p_client_request_id uuid,
  p_classifier_organization_id uuid,
  p_initiated_by_user_id uuid,
  p_initiator_kind text
)
RETURNS TABLE (
  operation_result text,
  id uuid,
  seller_id uuid,
  client_request_id uuid,
  classifier_organization_id uuid,
  classifier_batch_id uuid,
  max_files integer,
  max_file_size_bytes bigint,
  provisioning_status text,
  last_known_stage text,
  original_file_count integer,
  processed_file_count integer,
  group_count integer,
  product_draft_count integer,
  error_code text,
  retryable boolean,
  initiated_by_user_id uuid,
  initiator_kind text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected public.seller_classifier_batches%ROWTYPE;
  selected_result text;
BEGIN
  IF p_seller_id IS NULL
    OR p_client_request_id IS NULL
    OR p_classifier_organization_id IS NULL
    OR p_initiated_by_user_id IS NULL
    OR p_initiator_kind NOT IN ('seller', 'administrator')
  THEN
    RAISE EXCEPTION 'seller_classifier_batch_invalid'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.seller_classifier_batches AS workflow (
    seller_id,
    client_request_id,
    classifier_organization_id,
    initiated_by_user_id,
    initiator_kind
  )
  VALUES (
    p_seller_id,
    p_client_request_id,
    p_classifier_organization_id,
    p_initiated_by_user_id,
    p_initiator_kind
  )
  ON CONFLICT ON CONSTRAINT seller_classifier_batches_seller_request_unique
    DO NOTHING
  RETURNING workflow.* INTO selected;

  IF selected.id IS NULL THEN
    SELECT workflow.*
    INTO selected
    FROM public.seller_classifier_batches AS workflow
    WHERE workflow.seller_id = p_seller_id
      AND workflow.client_request_id = p_client_request_id;
    selected_result := 'existing';
  ELSE
    selected_result := 'created';
  END IF;

  RETURN QUERY SELECT
    selected_result,
    selected.id,
    selected.seller_id,
    selected.client_request_id,
    selected.classifier_organization_id,
    selected.classifier_batch_id,
    selected.max_files,
    selected.max_file_size_bytes,
    selected.provisioning_status,
    selected.last_known_stage,
    selected.original_file_count,
    selected.processed_file_count,
    selected.group_count,
    selected.product_draft_count,
    selected.error_code,
    selected.retryable,
    selected.initiated_by_user_id,
    selected.initiator_kind,
    selected.created_at,
    selected.updated_at;
END;
$$;

CREATE FUNCTION public.complete_seller_classifier_batch_provisioning(
  p_workflow_id uuid,
  p_classifier_batch_id uuid,
  p_max_files integer,
  p_max_file_size_bytes bigint
)
RETURNS TABLE (
  operation_result text,
  id uuid,
  seller_id uuid,
  client_request_id uuid,
  classifier_organization_id uuid,
  classifier_batch_id uuid,
  max_files integer,
  max_file_size_bytes bigint,
  provisioning_status text,
  last_known_stage text,
  original_file_count integer,
  processed_file_count integer,
  group_count integer,
  product_draft_count integer,
  error_code text,
  retryable boolean,
  initiated_by_user_id uuid,
  initiator_kind text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected public.seller_classifier_batches%ROWTYPE;
  selected_result text;
BEGIN
  IF p_workflow_id IS NULL
    OR p_classifier_batch_id IS NULL
    OR p_max_files IS NULL
    OR p_max_files <= 0
    OR p_max_file_size_bytes IS NULL
    OR p_max_file_size_bytes <= 0
  THEN
    RAISE EXCEPTION 'seller_classifier_batch_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT workflow.*
  INTO selected
  FROM public.seller_classifier_batches AS workflow
  WHERE workflow.id = p_workflow_id
  FOR UPDATE;

  IF selected.id IS NULL THEN
    selected_result := 'not_found';
  ELSIF selected.provisioning_status = 'ready' THEN
    IF selected.classifier_batch_id = p_classifier_batch_id
      AND selected.max_files = p_max_files
      AND selected.max_file_size_bytes = p_max_file_size_bytes
    THEN
      selected_result := 'ready';
    ELSE
      selected_result := 'conflict';
    END IF;
  ELSIF selected.provisioning_status <> 'provisioning' THEN
    selected_result := 'not_in_progress';
  ELSE
    UPDATE public.seller_classifier_batches AS workflow
    SET
      classifier_batch_id = p_classifier_batch_id,
      max_files = p_max_files,
      max_file_size_bytes = p_max_file_size_bytes,
      provisioning_status = 'ready',
      last_known_stage = 'upload',
      error_code = NULL,
      retryable = false
    WHERE workflow.id = p_workflow_id
    RETURNING workflow.* INTO selected;
    selected_result := 'completed';
  END IF;

  RETURN QUERY SELECT
    selected_result,
    selected.id,
    selected.seller_id,
    selected.client_request_id,
    selected.classifier_organization_id,
    selected.classifier_batch_id,
    selected.max_files,
    selected.max_file_size_bytes,
    selected.provisioning_status,
    selected.last_known_stage,
    selected.original_file_count,
    selected.processed_file_count,
    selected.group_count,
    selected.product_draft_count,
    selected.error_code,
    selected.retryable,
    selected.initiated_by_user_id,
    selected.initiator_kind,
    selected.created_at,
    selected.updated_at;
END;
$$;

CREATE FUNCTION public.fail_seller_classifier_batch_provisioning(
  p_workflow_id uuid,
  p_error_code text,
  p_retryable boolean
)
RETURNS TABLE (
  operation_result text,
  id uuid,
  seller_id uuid,
  client_request_id uuid,
  classifier_organization_id uuid,
  classifier_batch_id uuid,
  max_files integer,
  max_file_size_bytes bigint,
  provisioning_status text,
  last_known_stage text,
  original_file_count integer,
  processed_file_count integer,
  group_count integer,
  product_draft_count integer,
  error_code text,
  retryable boolean,
  initiated_by_user_id uuid,
  initiator_kind text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected public.seller_classifier_batches%ROWTYPE;
  selected_result text;
BEGIN
  IF p_workflow_id IS NULL
    OR p_error_code IS NULL
    OR btrim(p_error_code) = ''
    OR p_retryable IS NULL
  THEN
    RAISE EXCEPTION 'seller_classifier_batch_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT workflow.*
  INTO selected
  FROM public.seller_classifier_batches AS workflow
  WHERE workflow.id = p_workflow_id
  FOR UPDATE;

  IF selected.id IS NULL THEN
    selected_result := 'not_found';
  ELSIF selected.provisioning_status = 'ready' THEN
    selected_result := 'ready';
  ELSIF selected.provisioning_status = 'failed' THEN
    selected_result := 'failed';
  ELSE
    UPDATE public.seller_classifier_batches AS workflow
    SET
      provisioning_status = 'failed',
      last_known_stage = 'failed',
      error_code = btrim(p_error_code),
      retryable = p_retryable
    WHERE workflow.id = p_workflow_id
    RETURNING workflow.* INTO selected;
    selected_result := 'failed';
  END IF;

  RETURN QUERY SELECT
    selected_result,
    selected.id,
    selected.seller_id,
    selected.client_request_id,
    selected.classifier_organization_id,
    selected.classifier_batch_id,
    selected.max_files,
    selected.max_file_size_bytes,
    selected.provisioning_status,
    selected.last_known_stage,
    selected.original_file_count,
    selected.processed_file_count,
    selected.group_count,
    selected.product_draft_count,
    selected.error_code,
    selected.retryable,
    selected.initiated_by_user_id,
    selected.initiator_kind,
    selected.created_at,
    selected.updated_at;
END;
$$;

CREATE FUNCTION public.claim_seller_classifier_batch_provisioning_retry(
  p_workflow_id uuid,
  p_seller_id uuid
)
RETURNS TABLE (
  operation_result text,
  id uuid,
  seller_id uuid,
  client_request_id uuid,
  classifier_organization_id uuid,
  classifier_batch_id uuid,
  max_files integer,
  max_file_size_bytes bigint,
  provisioning_status text,
  last_known_stage text,
  original_file_count integer,
  processed_file_count integer,
  group_count integer,
  product_draft_count integer,
  error_code text,
  retryable boolean,
  initiated_by_user_id uuid,
  initiator_kind text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected public.seller_classifier_batches%ROWTYPE;
  selected_result text;
BEGIN
  IF p_workflow_id IS NULL OR p_seller_id IS NULL THEN
    RAISE EXCEPTION 'seller_classifier_batch_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT workflow.*
  INTO selected
  FROM public.seller_classifier_batches AS workflow
  WHERE workflow.id = p_workflow_id
    AND workflow.seller_id = p_seller_id
  FOR UPDATE;

  IF selected.id IS NULL THEN
    selected_result := 'not_found';
  ELSIF selected.provisioning_status = 'ready' THEN
    selected_result := 'ready';
  ELSIF selected.provisioning_status = 'provisioning' THEN
    selected_result := 'in_progress';
  ELSIF selected.retryable = false THEN
    selected_result := 'not_retryable';
  ELSE
    UPDATE public.seller_classifier_batches AS workflow
    SET
      provisioning_status = 'provisioning',
      last_known_stage = 'provisioning',
      error_code = NULL,
      retryable = false
    WHERE workflow.id = p_workflow_id
    RETURNING workflow.* INTO selected;
    selected_result := 'claimed';
  END IF;

  RETURN QUERY SELECT
    selected_result,
    selected.id,
    selected.seller_id,
    selected.client_request_id,
    selected.classifier_organization_id,
    selected.classifier_batch_id,
    selected.max_files,
    selected.max_file_size_bytes,
    selected.provisioning_status,
    selected.last_known_stage,
    selected.original_file_count,
    selected.processed_file_count,
    selected.group_count,
    selected.product_draft_count,
    selected.error_code,
    selected.retryable,
    selected.initiated_by_user_id,
    selected.initiator_kind,
    selected.created_at,
    selected.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_seller_classifier_batch_immutability()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.create_or_get_seller_classifier_batch(
  uuid,
  uuid,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_or_get_seller_classifier_batch(
  uuid,
  uuid,
  uuid,
  uuid,
  text
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_seller_classifier_batch_provisioning(
  uuid,
  uuid,
  integer,
  bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_seller_classifier_batch_provisioning(
  uuid,
  uuid,
  integer,
  bigint
) TO service_role;

REVOKE ALL ON FUNCTION public.fail_seller_classifier_batch_provisioning(
  uuid,
  text,
  boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_seller_classifier_batch_provisioning(
  uuid,
  text,
  boolean
) TO service_role;

REVOKE ALL ON FUNCTION public.claim_seller_classifier_batch_provisioning_retry(
  uuid,
  uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_seller_classifier_batch_provisioning_retry(
  uuid,
  uuid
) TO service_role;

COMMIT;
