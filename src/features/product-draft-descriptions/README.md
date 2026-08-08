# ProductDraft Descriptions

This feature owns authoritative multilingual ProductDraft descriptions. The
adjacent `product-draft-description-generation` feature owns the explicit
seller-authorized provider call from tickets 0027a2, 0027c, and 0035b. The saved
seller-product page exposes explicit generation and multilingual review controls
through this feature.

## Languages And Provenance

Version 1 supports exactly `pl`, `en`, `de`, and `vi`, returned in that order.
Each present language row records the current text, source, facts revision, and
model provenance when applicable. A missing row represents an empty language.

Human writes normalize line endings, trim surrounding whitespace, and record
the current facts revision. They replace model provenance. An omitted language
is preserved; a submitted null or blank value clears only that language.
Each localized description is limited to 300 Unicode characters after
normalization. Existing longer rows remain readable but must be shortened
before an explicit save or publication.

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

Authenticated sellers call the separately named
`getMyProductDraftDescriptions` and `updateMyProductDraftDescriptions`
operations. Both derive the seller from the authenticated request and use the
same service with seller-scoped access; the browser never supplies a seller
identifier.

The read snapshot includes derived `outdated` state. A description is outdated
when its facts revision is missing or older than the current facts revision;
that value is not stored or backfilled.

## Generation Contract

`generateMyProductDraftDescriptions({ productDraftId })` resolves the current
seller and validates server-only OpenAI configuration before claiming work. It
makes one bounded strict-schema multimodal request with the persisted selected
cover, optional approved category context, and one valid reviewed facts record
for Polish, English, German, and Vietnamese text. Individual facts may remain
empty or unknown. It then atomically preserves human rows and writes only
missing or model-owned rows. A source-controlled `product-description-v3`
pipeline version records the category-optional cover-grounded generation policy
used. Missing, unavailable, unsupported, or unusable covers fail explicitly;
generation never falls back to category-only prose or another gallery image.
Generated descriptions use the same 300-character limit, and optional model
title proposals use the shared 50-character title limit. A missing, blank, or
overlong proposal leaves the title blank without blocking valid descriptions.

Generation is synchronous and explicit. Upload, import, page reads, and facts
edits never start it. Durable attempt tokens prevent expired or superseded
requests from writing late results, and category, facts, or selected-cover
changes reject the whole provider response without partial persistence.

## Seller Editor

The saved-product page renders one description editor for Polish, English,
German, and Vietnamese. It shows provenance and outdated state, submits only
changed languages, and preserves dirty language values when facts refresh the
server snapshot. The legacy single-description field remains only on the
new-product form.

Generation is available only through the explicit button and is coordinated
with the product, facts, description, and publication states. While generation
is active, all related controls are disabled. A successful result replaces the
complete description snapshot and may update a blank title without remounting
the product editor or discarding unrelated local product fields.
