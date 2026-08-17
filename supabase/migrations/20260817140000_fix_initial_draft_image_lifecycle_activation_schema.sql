BEGIN;

-- The versioned activation schema replaced product_draft_id with product_id.
-- These four initial-draft gallery functions still contain the old lock query.
DO $migration$
DECLARE
  target_function regprocedure;
  function_definition text;
  stale_run_references integer;
  stale_item_references integer;
BEGIN
  FOREACH target_function IN ARRAY ARRAY[
    'public.prepare_seller_product_draft_image_uploads(uuid,uuid,bigint,jsonb,uuid[])'::regprocedure,
    'public.finalize_seller_product_draft_image_uploads(uuid,uuid,jsonb)'::regprocedure,
    'public.update_seller_product_draft_image_gallery(uuid,uuid,bigint,uuid[],uuid)'::regprocedure,
    'public.begin_seller_product_draft_image_removal(uuid,uuid,uuid,bigint)'::regprocedure
  ]
  LOOP
    function_definition := pg_get_functiondef(target_function::oid);
    stale_run_references := (
      length(function_definition)
      - length(replace(function_definition, 'run.product_draft_id', ''))
    ) / length('run.product_draft_id');
    stale_item_references := (
      length(function_definition)
      - length(replace(function_definition, 'item.product_draft_id', ''))
    ) / length('item.product_draft_id');

    IF stale_run_references <> 1 OR stale_item_references <> 1 THEN
      RAISE EXCEPTION
        'initial_draft_image_lifecycle_compatibility_precondition_failed:%:%:%',
        target_function::text,
        stale_run_references,
        stale_item_references;
    END IF;

    function_definition := replace(
      function_definition,
      'run.product_draft_id',
      'run.product_id'
    );
    function_definition := replace(
      function_definition,
      'item.product_draft_id',
      'item.product_id'
    );
    EXECUTE function_definition;
  END LOOP;
END;
$migration$;

DO $verification$
DECLARE
  target_function regprocedure;
  function_definition text;
BEGIN
  FOREACH target_function IN ARRAY ARRAY[
    'public.prepare_seller_product_draft_image_uploads(uuid,uuid,bigint,jsonb,uuid[])'::regprocedure,
    'public.finalize_seller_product_draft_image_uploads(uuid,uuid,jsonb)'::regprocedure,
    'public.update_seller_product_draft_image_gallery(uuid,uuid,bigint,uuid[],uuid)'::regprocedure,
    'public.begin_seller_product_draft_image_removal(uuid,uuid,uuid,bigint)'::regprocedure
  ]
  LOOP
    function_definition := pg_get_functiondef(target_function::oid);
    IF function_definition LIKE '%run.product_draft_id%'
      OR function_definition LIKE '%item.product_draft_id%'
    THEN
      RAISE EXCEPTION
        'initial_draft_image_lifecycle_compatibility_verification_failed:%',
        target_function::text;
    END IF;
  END LOOP;
END;
$verification$;

COMMIT;
