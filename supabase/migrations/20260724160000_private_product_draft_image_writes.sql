INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'product-draft-images',
  'product-draft-images',
  false,
  5242880,
  ARRAY['image/jpeg']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.product_draft_images
  ADD COLUMN storage_bucket text;

UPDATE public.product_draft_images
SET storage_bucket = CASE
  WHEN status = 'available' THEN 'product-images'
  ELSE 'product-draft-images'
END;

ALTER TABLE public.product_draft_images
  ALTER COLUMN storage_bucket SET DEFAULT 'product-draft-images',
  ALTER COLUMN storage_bucket SET NOT NULL,
  ADD CONSTRAINT product_draft_images_storage_bucket
    CHECK (
      storage_bucket IN (
        'product-images',
        'product-draft-images'
      )
    );
