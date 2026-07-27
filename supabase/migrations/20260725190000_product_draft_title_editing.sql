BEGIN;

ALTER TABLE public.products
  ADD COLUMN title_source text;

ALTER TABLE public.products
  ADD CONSTRAINT products_title_source_check
  CHECK (title_source IS NULL OR title_source IN ('human', 'model'));

UPDATE public.products
SET title_source = CASE
  WHEN btrim(regexp_replace(title, '[[:space:]]+', ' ', 'g')) = '' THEN NULL
  ELSE 'human'
END;

CREATE FUNCTION public.enforce_product_draft_title()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_title text;
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.status IN ('published', 'archived')
    AND (
      NEW.title IS DISTINCT FROM OLD.title
      OR NEW.title_source IS DISTINCT FROM OLD.title_source
    )
  THEN
    RAISE EXCEPTION 'product_draft_title_not_editable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'published'
    AND (
      TG_OP = 'INSERT'
      OR OLD.status IS DISTINCT FROM 'published'
    )
  THEN
    normalized_title := btrim(
      regexp_replace(NEW.title, '[[:space:]]+', ' ', 'g')
    );

    IF normalized_title = ''
      OR char_length(normalized_title) > 120
    THEN
      RAISE EXCEPTION 'product_draft_title_invalid'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_00_title
  BEFORE INSERT OR UPDATE OF status, title, title_source ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_draft_title();

REVOKE ALL ON FUNCTION public.enforce_product_draft_title()
  FROM PUBLIC, anon, authenticated;

COMMIT;
