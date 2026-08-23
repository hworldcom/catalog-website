# Admin Feature

Owns internal admin workflows.

Current status:

- durable classifier-import coordination and `ProductDraft` source identity are
  implemented server-side;
- new imports are created only through seller-owned or administrator-delegated
  classifier workflows that stored the immutable seller before upload;
- existing import status, retry, reconciliation, and dispatch endpoints remain
  available by import identifier under `/v1/admin/classifier-imports`;
- promoted classifier images are copied into Bazoria-owned storage by the
  import worker, with new and retried ProductDraft images written to the
  private `product-draft-images` bucket;
- administrator authorization immediately dispatches the exact durable import
  through the local backend; and
- `/admin/classifier-imports` is a compatibility redirect to delegated upload,
  while durable import detail pages remain available for support and recovery;
- allowlisted administrators can continue administrator-created seller
  workflows through delegated browser review and ProductDraft import, using
  protected thumbnail delivery, immutable seller context, and durable
  action-attempt auditing;
- an allowlisted cross-seller ProductDraft index is available at
  `/admin/product-drafts`, with stable filters, cursor pagination, immutable
  classifier source context, and private signed previews;
- the unified ProductDraft review includes shared title and structured-facts
  editors, with published and archived records rendered read-only; and
- an allowlisted moderation queue is available at `/admin/moderation`, with
  protected seller and product detail routes under
  `/admin/moderation/{submissionType}/{submissionId}` for immutable comparison,
  replay-safe decisions, backend-authorized activation recovery, and private
  image delivery; and
- every preserved classifier-import administrator operation validates the
  Supabase bearer token and server-only prototype-administrator allowlist
  before constructing its service-role runtime.

Boundaries:

- Seller-facing workflows stay in `src/features/seller`.
- Buyer/account workflows stay in `src/features/account`.
- Catalog-classifier ingestion, grouping, image processing, and review semantics
  remain owned by the classifier service unless a specific admin integration
  ticket says otherwise.
- Classifier-approved groups must become `ProductDraft` records through an
  explicit server-side import first, never public products automatically.
- A raw classifier batch identifier is not an ownership boundary and cannot
  create a new Bazoria import.
- Classifier import configuration and service-role database access remain
  server-only.
- Browser polling only reads progress; backend dispatch initiates worker
  execution.
- Cross-seller prototype administrator operations require membership in
  `BAZORIA_PROTOTYPE_ADMIN_USER_IDS`.
- The authenticated navigation context only controls visibility of the
  moderation link. Every moderation read independently enforces administrator
  authorization on the server.
- Moderation action failures cross the server boundary as stable codes. An
  outcome-unknown write retains its exact request identifier and normalized
  payload in component memory until the administrator retries it or completes
  an authoritative discard-and-refresh.
- Seller and administrator product moderation views share the generic read-only
  refresh coordinator. Polling and credential refresh only read durable state;
  they never initiate activation work.
- ProductDraft index and review reads remain disabled until
  `BAZORIA_ADMIN_PRODUCT_DRAFTS_ENABLED=true` and the durable private-image
  cutover is complete.
- ProductDraft preview URLs are short-lived opaque capabilities. Browser code
  keeps them only in the current snapshot and never persists them in route
  search parameters.
- This allowlist is temporary prototype authorization. Production role
  assignment through `public.user_roles` remains separate work.
