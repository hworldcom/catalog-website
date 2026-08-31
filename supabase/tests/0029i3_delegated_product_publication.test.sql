BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(5);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.apply_scoped_product_draft_description_patch(uuid,uuid,boolean,text,boolean,text,boolean,text,boolean,text)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.apply_scoped_product_draft_description_patch(uuid,uuid,boolean,text,boolean,text,boolean,text,boolean,text)',
      'EXECUTE'
    ),
  'seller-scoped description writes remain server-only'
);

SELECT ok(
  NOT has_function_privilege(
    'service_role',
    'public.authorize_product_publication_with_correlation(uuid,uuid,boolean,text,boolean,text,uuid,integer,text,numeric,text,public.stock_status,boolean,text,boolean,text[],uuid,text)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.authorize_product_publication_with_correlation(uuid,uuid,boolean,text,boolean,text,uuid,integer,text,numeric,text,public.stock_status,boolean,text,boolean,text[],uuid,text)',
      'EXECUTE'
    ),
  'the superseded delegated publication authorizer is retired'
);

SELECT ok(
  NOT has_function_privilege(
    'service_role',
    'public.retry_product_publication_with_correlation(uuid,uuid,uuid,text)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.retry_product_publication_with_correlation(uuid,uuid,uuid,text)',
      'EXECUTE'
    ),
  'the superseded delegated publication retry is retired'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.submit_initial_product_moderation(uuid,uuid,bigint,uuid,uuid)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.submit_initial_product_moderation(uuid,uuid,bigint,uuid,uuid)',
      'EXECUTE'
    ),
  'initial product moderation submission remains server-only'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.decide_product_moderation_submission(uuid,bigint,text,text,uuid,uuid)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.decide_product_moderation_submission(uuid,bigint,text,text,uuid,uuid)',
      'EXECUTE'
    ),
  'administrator product decisions remain server-only'
);

SELECT * FROM finish();
ROLLBACK;
