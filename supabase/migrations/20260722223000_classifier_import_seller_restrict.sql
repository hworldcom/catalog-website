DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.classifier_import_runs AS run
    LEFT JOIN public.sellers AS seller ON seller.id = run.seller_id
    WHERE seller.id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot add classifier_import_runs seller foreign key: one or more imports reference a missing seller';
  END IF;
END;
$$;

ALTER TABLE public.classifier_import_runs
  ADD CONSTRAINT classifier_import_runs_seller_id_fkey
  FOREIGN KEY (seller_id)
  REFERENCES public.sellers(id)
  ON DELETE RESTRICT;
