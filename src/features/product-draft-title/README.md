# ProductDraft Title

This feature owns the normalized title and title provenance attached to a
Bazoria `ProductDraft`.

## Title Contract

Titles are normalized on the server by trimming leading and trailing
whitespace and collapsing internal whitespace to one space. The normalized
title may contain at most 50 Unicode characters.

Drafts may have a blank title. A blank title is stored with a `null`
`title_source` and is displayed as **Untitled product**. A ProductDraft cannot
be published with a blank or overlength normalized title.

`products.title_source` records who last supplied the title:

- `human` for a seller or administrator edit;
- `model` for future automated title generation; or
- `null` when the title is blank or its source is unknown.

Ticket 0026g does not generate titles. A later generation workflow may fill
only an eligible blank title and must use the same normalization and
persistence boundary.

## Browser Contract

Authenticated code imports the TanStack server functions from
`product-draft-title.functions.ts`:

- `getProductDraftTitle({ productDraftId })`
- `updateProductDraftTitle({ productDraftId, title })`

The server returns the complete current snapshot, including the normalized
title, title source, product status, and whether the title is editable. A
successful update always marks a nonblank title as human-authored; clearing the
title clears its source.

The shared `ProductDraftTitleEditor` is rendered on the unified administrator
review page. Seller product create and update operations use the same title
service rather than a separate title implementation.

## Seller Saves

Seller updates are presence-aware:

- an omitted `title` leaves both `title` and `title_source` untouched;
- an included title is normalized and persisted with the other product fields
  in one database update; and
- an included blank title clears `title_source`.

New seller products must include a title field, although a draft may explicitly
start blank. Published and archived titles are read-only.

## Authorization

An authenticated seller may read or update titles only for ProductDrafts owned
by that seller. Prototype administrators listed in the server-only,
comma-separated `BAZORIA_PROTOTYPE_ADMIN_USER_IDS` environment variable may
read or update titles for any seller.

The Supabase service-role key is used only after the authenticated request has
been resolved to one of those access contexts.

## Persistence

The database preserves all existing title bytes when `title_source` is added.
Existing normalized nonblank titles are marked `human`; normalized blank titles
receive a `null` source.

A database trigger provides the final publication and immutability guard:

- draft-to-published transitions reject blank or overlength normalized titles;
- published and archived title fields cannot be changed; and
- only `human`, `model`, or `null` title sources are accepted.

Application code maps expected validation, not-found, and read-only outcomes to
stable ProductDraft title errors. Unexpected database failures remain
server-side failures.
