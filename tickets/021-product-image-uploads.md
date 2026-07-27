# Ticket 021 - Product Image Uploads

## Status

Implemented on 2026-07-18. The seller upload limit was raised to 20 MB locally and in the linked
Supabase project on 2026-07-26. One authenticated browser upload remains as manual validation.

## Goal

Let sellers upload product images and storefront logos/cover images directly instead of pasting URLs.

## Cloud Storage - Public Bucket

- Create or update a public `product-images` bucket with:
  - a 20 MB per-file limit;
  - allowed MIME types `image/jpeg`, `image/png`, and `image/webp`.
- Add row-level security policies on `storage.objects` so:
  - public image URLs remain readable through the public bucket endpoint;
  - anonymous users cannot list the bucket;
  - authenticated users can list/read only objects they own;
  - only authenticated users can upload;
  - uploads must be under a path prefixed with the current user's ID, for example `auth.uid()/...`;
  - users can update or delete only objects they own;
  - ownership checks use the current `owner_id` column.

The public bucket controls public delivery. A broad anonymous `SELECT` policy on
`storage.objects` is not required for public URLs and would expose object listings.

## Upload Component

The existing component lives at `src/features/seller/components/image-upload.tsx` with these props:

- `value`
- `onChange`
- `folder`, limited to `products` or `storefront`
- `label`

Expected behavior:

- show a preview of the current image;
- accept JPG, PNG, and WebP files;
- enforce a maximum file size of 20 MB;
- upload to `<uid>/<folder>/<uuid>.<ext>` through the browser Supabase client using the user's session;
- return the public URL through `onChange(publicUrl)`;
- include a remove button to clear the image;
- keep a URL text field as a fallback for external images.

Derive the stored extension from the validated MIME type instead of trusting the uploaded
filename.

## Wire Into Editors

- Product editor: replace the `cover_image_url` text input with `ImageUpload` using `folder="products"`.
- Storefront editor: replace `logo_url` and `cover_image_url` inputs with `ImageUpload` using `folder="storefront"`.

## Display

- Product pages already render `cover_image_url`.
- Seller storefront pages already render `cover_image_url`.
- Render `logo_url` on the public seller storefront when one is configured.

## Removal Semantics

The remove button clears the form value. The database value changes only after the seller saves
the editor. Deleting replaced or detached Storage objects is intentionally deferred because an
immediate deletion could break the currently saved product or storefront when a seller cancels
their changes.

## Out Of Scope

- Multiple images per product. The `product_images` table exists but is not wired anywhere.
- Image resizing.
- Thumbnail generation.
- Image optimization. The 20 MB cap keeps uploads reasonable for now.
- Automatic cleanup of replaced or detached Storage objects.

## Acceptance Criteria

- Sellers can upload product cover images.
- Sellers can upload storefront logo and cover images.
- Sellers can remove uploaded image values from forms.
- Sellers can still paste external image URLs as a fallback.
- Public product and storefront pages render uploaded images.
- Public seller storefronts render the configured storefront logo.
- Anonymous users cannot list objects in `product-images`.
- Bucket-level restrictions reject files larger than 20 MB and MIME types other than JPG, PNG, or
  WebP.
- Upload validation and path generation have focused automated tests.
- An authenticated browser upload is verified against the configured Supabase project.
- `npm run lint:node22` passes with no new errors.
- `npm run test:node22` passes.
- `npm run build:node22` passes.

## Implementation Notes

- `src/features/seller/components/image-upload.tsx` uses shared validation and path helpers.
- `src/features/seller/components/image-upload.helpers.ts` maps validated MIME types to trusted
  extensions and builds user-prefixed object paths.
- `supabase/migrations/20260718190000_harden_product_image_storage.sql` creates or updates the
  bucket configuration and replaces the policies with `owner_id` checks.
- `supabase/migrations/20260726120000_increase_product_image_upload_limit.sql` raises the existing
  `product-images` bucket limit to 20 MB without changing the private ProductDraft image bucket.
- The public seller storefront renders `logo_url` and stacks its contact action on narrow screens.

## Validation

- [x] Upload validation and path tests pass.
- [x] Full test suite passes: 61 files and 386 tests.
- [x] `npm run lint:node22` passes with no errors. The 12 reported Fast Refresh warnings predate
      this ticket.
- [x] `npm run build:node22` passes for the Vercel target.
- [x] An existing public `product-images` logo responds with HTTP 200 and `image/png`.
- [x] Public storefront logo layout checked at 1440 px desktop and 500 px mobile widths.
- [x] Apply the 20 MB correction migration locally and to the linked Supabase project.
- [x] Verify the linked `product-images` bucket reports a 20 MB limit while retaining the expected
      MIME-type restrictions.
- [ ] Verify JPG, PNG, and WebP uploads with an authenticated seller in the browser.
- [ ] Verify the deployed bucket rejects unsupported MIME types and files larger than 20 MB.
