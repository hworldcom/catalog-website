# Admin Screens

Route-rendered admin view components live here.

TanStack route files stay in `src/routes` and import screens from this folder.

Current classifier-import screens provide:

- cursor-paginated discovery of approved classifier batches;
- read-only destination-store attribution and explicit import authorization;
- durable status restoration and sequential polling;
- server-derived recovery dispatch for pending or expired work;
- retry and reconciliation actions controlled by the backend response; and
- seller-aware links to imported ProductDraft records; and
- a **Review facts** link for every imported ProductDraft, opening the
  prototype-administrator structured-facts route.

The ProductDraft index at `/admin/product-drafts` provides:

- cross-seller draft, published, and archived ProductDraft discovery for an
  allowlisted prototype administrator;
- exact seller and status filters plus stable cursor pagination;
- deterministic cover-or-first-image preview selection;
- state-specific placeholders for pending, failed, missing, and unavailable
  private previews;
- one coalesced snapshot refresh when a signed preview expires or fails; and
- review links that preserve the exact list limit, filters, and current cursor.

The unified `/admin/product-drafts/{productDraftId}` review destination belongs
to ticket `0026e2`. Ticket `0026d` owns the index and its navigation contract,
not the destination screen.

The read-only moderation queue at `/admin/moderation` provides:

- mixed seller and product submission cards for allowlisted administrators;
- deterministic submission, review, activation, seller, and page-size filters;
- stable forward-cursor pagination and complete detail return links;
- bounded private previews with row-local placeholders; and
- deliberate refresh without polling or moderation side effects.

The moderation detail route at
`/admin/moderation/{submissionType}/{submissionId}` provides:

- immutable proposed-versus-approved seller and product comparisons;
- current taxonomy labels with immutable category-identifier fallback;
- private seller media and product galleries with row-local placeholders;
- confirmation and bounded-reason dialogs for administrator decisions;
- exact in-memory request replay after an outcome-unknown write;
- backend-authorized dispatch, activation, and public-image cleanup retries;
- read-only active-state polling plus signed-image expiry and failure refresh;
  and
- complete validated return navigation to the moderation queue.
