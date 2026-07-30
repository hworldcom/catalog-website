CREATE OR REPLACE FUNCTION public.create_or_get_seller_classifier_batch(
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
