CREATE OR REPLACE FUNCTION pg_temp.approve_fixture_seller(
  p_seller_id uuid,
  p_storefront_enabled boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  fixture_actor_id constant uuid := '40000000-0000-4000-8000-000000000001';
  selected_seller public.sellers%ROWTYPE;
  approved_submission_id uuid;
  approved_revision bigint;
BEGIN
  INSERT INTO auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    fixture_actor_id,
    'authenticated',
    'authenticated',
    'approved-seller-fixture@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT seller.*
  INTO selected_seller
  FROM public.sellers AS seller
  WHERE seller.id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fixture_seller_not_found';
  END IF;

  approved_submission_id := selected_seller.approved_profile_submission_id;
  IF approved_submission_id IS NULL THEN
    SELECT coalesce(max(submission.revision), 0) + 1
    INTO approved_revision
    FROM public.seller_profile_submissions AS submission
    WHERE submission.seller_id = p_seller_id;

    INSERT INTO public.seller_profile_submissions (
      seller_id,
      revision,
      submission_kind,
      status,
      name,
      slug,
      city,
      country,
      whatsapp,
      email,
      about,
      established_year,
      seller_request_id,
      submitted_by_user_id,
      administrator_user_id,
      decision_request_id,
      decided_at
    )
    VALUES (
      p_seller_id,
      approved_revision,
      'initial',
      'approved',
      selected_seller.name,
      selected_seller.slug,
      selected_seller.city,
      selected_seller.country,
      selected_seller.whatsapp,
      selected_seller.email,
      selected_seller.about,
      selected_seller.established_year,
      gen_random_uuid(),
      fixture_actor_id,
      fixture_actor_id,
      gen_random_uuid(),
      now()
    )
    RETURNING id INTO approved_submission_id;
  END IF;

  UPDATE public.sellers AS seller
  SET approved_profile_submission_id = approved_submission_id,
      storefront_enabled = p_storefront_enabled
  WHERE seller.id = p_seller_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assign_fixture_product_audience()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.product_audience_memberships (product_id, audience)
  VALUES (NEW.id, 'women')
  ON CONFLICT (product_id, audience) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qa_assign_fixture_product_audience ON public.products;
CREATE TRIGGER trg_qa_assign_fixture_product_audience
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION pg_temp.assign_fixture_product_audience();
