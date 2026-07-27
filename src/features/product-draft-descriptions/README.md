# ProductDraft Descriptions

This feature owns authoritative multilingual ProductDraft descriptions. It does
not call a generation provider or render browser controls; those belong to
tickets 0027a2 and 0027b.

## Languages And Provenance

Version 1 supports exactly `pl`, `en`, `de`, and `vi`, returned in that order.
Each present language row records the current text, source, facts revision, and
model provenance when applicable. A missing row represents an empty language.

Human writes normalize line endings, trim surrounding whitespace, and record
the current facts revision. They replace model provenance. An omitted language
is preserved; a submitted null or blank value clears only that language.

## Compatibility Projection

`product_draft_descriptions` is authoritative. `products.description` remains
a temporary English projection for existing seller and public reads. Database
triggers keep that projection synchronized and reject direct divergent writes.

Seller product saves are presence-aware: an omitted description preserves the
English row, while an included description is an intentional English patch
committed atomically with the other submitted product fields.

## Server Contract

Authenticated prototype administrators call:

- `getProductDraftDescriptions({ productDraftId })`
- `updateProductDraftDescriptions({ productDraftId, descriptions })`

Both use a service-role repository only after the administrator allowlist has
been checked. The browser never accesses description rows or database functions
directly. Reads work for all ProductDraft statuses; writes require `draft`.

The read snapshot includes derived `outdated` state. A description is outdated
when its facts revision is missing or older than the current facts revision;
that value is not stored or backfilled.
