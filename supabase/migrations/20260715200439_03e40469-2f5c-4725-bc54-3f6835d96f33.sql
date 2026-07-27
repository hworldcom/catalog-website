-- Drop the broad public SELECT policy that allowed listing all files in the bucket
DROP POLICY IF EXISTS "Public can view product images" ON storage.objects;

-- Allow authenticated users to read only their own images (prevents public listing)
CREATE POLICY "Users can view their own images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'product-images'
  AND owner = auth.uid()
);