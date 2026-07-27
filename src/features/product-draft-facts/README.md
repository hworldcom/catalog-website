# ProductDraft Facts

This feature owns the reviewed structured facts attached to a Bazoria
`ProductDraft`.

## Browser contract

Authenticated code imports the TanStack server functions from
`product-draft-facts.functions.ts`:

- `getProductDraftFacts({ productDraftId })`
- `updateProductDraftFacts({ productDraftId, patch })`

The browser sends only fact fields and `uncertainFields`. It never sends
`fieldSources` or a revision. The server normalizes and validates the patch,
derives human sources, and returns the complete current snapshot.

The current version 2 document contains only optional `colors` and
`materialComposition` values. Product category remains controlled by
`products.category_id` and is not duplicated in this document. The removed
version 1 fields are rejected by both browser-facing validation and the
database patch function.

## Editor

`ProductDraftFactsEditor` is the shared connected editor used by both ProductDraft
review paths:

- the existing seller ProductDraft edit screen; and
- the unified administrator review at
  `/admin/product-drafts/{productDraftId}`, reached from the ProductDraft index
  or classifier import detail page.

The old `/admin/product-drafts/{productDraftId}/facts` route redirects to the
unified review while preserving valid return-navigation and language
parameters.

The editor renders **Optional product details** with exactly **Colors** and
**Material composition**. It submits only touched fields whose normalized
values differ from the latest server snapshot. Clearing material composition
sends `null`; clearing the newline-separated colors control sends `[]`. A
successful update replaces the complete local snapshot with the server
response.

Published and archived ProductDrafts use the same editor in read-only mode.
Field sources and uncertainty markers are visible, but neither can be edited in
this version.

## Authorization

An authenticated seller can access facts only for products owned by that
seller. Prototype administrators listed in the server-only, comma-separated
`BAZORIA_PROTOTYPE_ADMIN_USER_IDS` environment variable can access facts for
any seller. This allowlist bypasses seller ownership only; published and
archived products remain read-only.

The Supabase service-role key is used only after the authenticated request has
been resolved to one of those access contexts.

## Persistence

The `product_draft_facts` row is initialized by a database trigger whenever a
product is created, regardless of its initial status. A transition back to
draft also repairs a missing row without replacing an existing facts document.
The compatibility migration backfills every existing product, including
published and archived products. Rows remain attached through later status
changes.

Partial updates use the service-role-only
`apply_product_draft_facts_patch` database function. It locks the latest facts
row, merges the normalized patch, preserves unrelated fields, and increments
the revision once for a semantic change.

The version 2 migration validates every stored version 1 document before
changing any row. It preserves colors, renames material to material
composition, removes the other version 1 fields, and increments every migrated
facts revision exactly once.
