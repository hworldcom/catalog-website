CREATE OR REPLACE FUNCTION public.initialize_product_draft_facts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    OR (
      TG_OP = 'UPDATE'
      AND NEW.status = 'draft'
      AND OLD.status IS DISTINCT FROM NEW.status
    )
  THEN
    INSERT INTO public.product_draft_facts (product_draft_id)
    VALUES (NEW.id)
    ON CONFLICT (product_draft_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.initialize_product_draft_facts()
  FROM PUBLIC, anon, authenticated;

INSERT INTO public.product_draft_facts (product_draft_id)
SELECT product.id
FROM public.products AS product
ON CONFLICT (product_draft_id) DO NOTHING;
