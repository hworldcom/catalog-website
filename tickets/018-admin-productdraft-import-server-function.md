# Ticket 018 - Admin ProductDraft Import Server Function

## Goal

Create an admin-only Bazoria server function that imports approved classifier groups into Bazoria `ProductDraft` records.

## Dependencies

- Ticket 016 ProductDraft import plan.
- Ticket 017 classifier API client.
- Bazoria ProductDraft persistence exists.
- Image promotion strategy exists or a temporary placeholder is explicitly approved.

## Target Files

- `src/features/admin/product-draft-import.functions.ts`
- `src/features/admin/server/image-promotion.service.ts`
- `src/features/admin/server/category-mapping.service.ts`

## Scope

- Require admin authorization.
- Fetch approved classifier groups server-side.
- Map classifier organization to Bazoria seller.
- Map classifier approved category to Bazoria category.
- Copy or promote non-duplicate approved images into Bazoria-owned public storage.
- Create `ProductDraft` records with classifier source references.
- Make import idempotent for the same source batch/group.
- Do not publish products.

## Acceptance Criteria

- Admin can import an approved classifier batch into product drafts.
- Re-running import does not create duplicate drafts.
- Imported images are stored in Bazoria-owned public storage, not classifier private storage.
- ProductDrafts remain unpublished until Bazoria review/publish.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.
