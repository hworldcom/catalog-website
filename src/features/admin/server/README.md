# Admin Server-Only Helpers

Server-only admin helpers live here.

Admin authorization must be enforced server-side, not only in the user
interface.

Classifier import modules in this folder own:

- strict server-only configuration validation;
- classifier approved-group response validation;
- delegated administrator review and import wrappers that always use the
  workflow's immutable stored seller;
- token-fenced administrator action attempts for group approval, batch
  approval/import authorization, and import retry;
- durable import status, retry, reconciliation, and dispatch coordination;
- immediate claim-specific local import dispatch after durable authorization;
- attempt-token-fenced worker orchestration;
- the Supabase repository adapter.

New import authorization belongs to seller-owned and administrator-delegated
classifier workflows. Those workflows store the immutable seller before
upload and create or find imports through
`create_or_get_owned_classifier_import(...)`. A raw classifier batch
identifier cannot create an import. Workers always use the seller identifier
stored on the claimed import run.

The production image-preparation adapter reads normalized classifier JPEGs,
performs create-only writes to the bucket stored on each ProductDraft image,
and reconciles promoted objects in that same bucket. New and retried
ProductDraft promotions target the private `product-draft-images` bucket.
Legacy available rows remain explicitly associated with `product-images`
until the storage-cutover workflow moves them. The Bazoria server immediately
schedules the exact durable import after authorization, retry, or
reconciliation. Browser status polling remains read-only.
`runNextClassifierImport` and the continuous claim-next worker remain recovery
and diagnostic tools; they are not required for the normal local
administrator flow.

Required server-only classifier import settings:

```text
BAZORIA_CLASSIFIER_API_BASE_URL
BAZORIA_CLASSIFIER_IMPORT_DISPATCH_MODE=local
BAZORIA_DEFAULT_CLASSIFIER_ORGANIZATION_ID
BAZORIA_PROTOTYPE_ADMIN_USER_IDS
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
```

`BAZORIA_PROTOTYPE_ADMIN_USER_IDS` is a strictly validated comma-separated
list of Supabase user Universally Unique Identifiers (UUIDs). Empty,
malformed, leading-comma, trailing-comma, and doubled-comma values do not grant
administrator access. Raw browser requests attach the current Supabase access
token; their handlers authenticate and authorize before creating a
service-role runtime.

`BAZORIA_DEFAULT_SELLER_ID` is retired and must be removed from operator
configuration. The server does not read it. Seller attribution comes only from
the authorized seller-owned workflow.

Optional positive timeout settings and their defaults:

```text
BAZORIA_CLASSIFIER_APPROVED_GROUPS_TIMEOUT_SECONDS=30
BAZORIA_CLASSIFIER_IMPORT_RUN_LEASE_TIMEOUT_SECONDS=900
BAZORIA_CLASSIFIER_IMAGE_READ_TIMEOUT_SECONDS=30
BAZORIA_DELEGATED_ADMIN_ACTION_TIMEOUT_SECONDS=30
BAZORIA_DELEGATED_ADMIN_ACTION_LEASE_TIMEOUT_SECONDS=120
BAZORIA_IMAGE_STORAGE_HEAD_TIMEOUT_SECONDS=15
BAZORIA_IMAGE_STORAGE_WRITE_TIMEOUT_SECONDS=60
BAZORIA_IMAGE_PROMOTION_CLAIM_TIMEOUT_SECONDS=300
BAZORIA_CLASSIFIER_IMPORT_WORKER_POLL_INTERVAL_SECONDS=5
```

## Retired Product-Code Cutover

The one-time product-code cutover and its linked-project migration procedure
targeted a retired disposable database. Do not run that reset command against
the isolated UAT or production projects. Current database preflight and
migration commands are documented in the repository root `README.md`; ticket
`0038d` owns the replacement UAT fixture workflow.

The delegated administrator action timeout is bounded from 1 through 300
seconds. Its lease is bounded from 31 through 900 seconds and must be at least
30 seconds longer than the action timeout. Unknown remote outcomes remain
reclaimable; only deterministic validation or business-state failures become
terminal audit failures.

The promotion claim timeout must be at least the image-read, storage-head, and
storage-write timeouts plus 120 seconds. Image promotion requires the
server-side Supabase service-role key; never expose that credential to browser
code. The `product-images` bucket remains public for seller uploads and
published-product delivery. ProductDraft promotion code must always pass the
durable bucket explicitly and must never fall back to the public bucket.

## Recovery Import Worker

Start the classifier API separately with both approved export flags enabled:

```text
CATALOG_APPROVED_GROUPS_EXPORT_ENABLED=true
CATALOG_APPROVED_IMAGE_EXPORT_ENABLED=true
```

Normal administrator authorization does not require this command. To recover
or diagnose durable pending work, start the Bazoria worker from the Bazoria
repository in its own terminal.
Load the existing server-only `.env` into that terminal before starting the
process:

```bash
cd /Users/hoangdeveloper/catalog-website
set -a
source .env
set +a
npm run worker:classifier-import
```

The command requires Node.js 22.13 or newer. It validates configuration before
claiming work, processes one import at a time, immediately checks for more work
after a terminal attempt, and polls at the configured interval while idle.
Each output line is a structured JSON event. A `worker_heartbeat` event is
written at startup and every 60 seconds so local process liveness can be
observed without an HTTP health endpoint.

Press `Ctrl+C` once for graceful shutdown. An idle wait is interrupted
immediately. If an import is active, the process finishes that attempt and exits
without claiming another one. Durable leases allow a later worker process to
recover an attempt after an ungraceful process exit.

The worker never autonomously reclaims terminal failures. Use the existing
administrator retry action or retry API to requeue eligible work as `pending`.
The worker will then claim it normally.

## Legacy ProductDraft Image Cutover

Ticket `0026c3` provides a one-time, server-only deployment command that
accounts for every ProductDraft image created before private draft-image
storage was enabled:

```bash
cd /Users/hoangdeveloper/catalog-website
set -a
source .env
set +a
npm run reconcile:product-draft-images -- --batch-size 50
```

The batch size defaults to `50` and must be an integer from `1` through `100`.
The command uses only the server-side Supabase URL and service-role key plus
the existing storage timeouts. It emits one structured JSON result line and
exits nonzero if a release-blocking object remains. It never prints object
bytes or credentials.

Do not run the command while any old web process or classifier-import worker
can still write ProductDraft objects to the public `product-images` bucket.
The deployment order is:

1. stop classifier-import dispatch;
2. gracefully drain all old import workers;
3. apply the private-write and cutover migrations;
4. deploy the private-bucket-aware application and worker;
5. prove one smoke promotion exists only in `product-draft-images`;
6. run the reconciliation command to terminal state;
7. verify cutover version `private-product-draft-images-v1` is `completed`;
8. set `BAZORIA_ADMIN_PRODUCT_DRAFTS_ENABLED=true`; and
9. resume normal dispatch and worker execution.

The command is restartable. Global and per-image attempt tokens reject stale
results, expired claims are recoverable, object work is limited to five
concurrent rows, and public objects are deleted only after their private copies
are verified. A final discovery scan and a fresh confirming scan must both
reach the end of the public `product-drafts/` prefix before completion.

Nonblocking missing legacy bytes remain visible in durable reconciliation
state for later placeholder rendering. Conflicting, unverifiable, unowned, or
undeletable public objects prevent completion. After an operator corrects or
deliberately removes one failed object, a service-role-only caller may reset
that exact row:

```sql
SELECT public.retry_product_draft_image_storage_reconciliation(
  'private-product-draft-images-v1',
  'product-drafts/<product-draft-id>/images/<image-id>.jpg'
);
```

The retry function returns `false` while the cutover is running, after the
cutover has completed, for an unknown key, or for a row that is not failed.
Run the deployment command again after a successful retry.

Administrator ProductDraft index and review handlers must first authenticate
and authorize the prototype administrator, then call:

```ts
await (await getProductDraftAdminGate()).assertEnabled();
```

The gate requires `BAZORIA_ADMIN_PRODUCT_DRAFTS_ENABLED` to equal exactly
`true` and the durable cutover version to be `completed`. It caches only a
successful completed-state read for 30 seconds. Every other state and every
database read failure returns `503 admin_product_drafts_not_enabled`. No
application startup path runs reconciliation implicitly.

## Private ProductDraft Image Delivery

Use `ProductDraftImageDeliveryService` for administrator index previews and
review galleries. The service accepts grouped ProductDraft and image
identifiers, verifies ownership and durable state with set-based reads, and
returns grouped delivery results in request order. It never exposes a
standalone storage destination key.

One invocation accepts at most 100 unique ProductDraft and image pairs.
Repeated image identifiers within one ProductDraft entry are deduplicated;
duplicate ProductDraft entries are rejected. Storage work uses one shared
ten-operation concurrency limit. Each verification and signing request has a
ten-second timeout, the complete invocation has a 30-second deadline, and
successful signed URLs expire after five minutes.

Pending, failed, missing, and unavailable images return deterministic
nonfatal results without URLs. Images that belong to another ProductDraft are
masked as missing. A storage configuration, credential, network, rate-limit,
or service failure fails the complete invocation without returning partial
signed results.

Consuming server functions must authenticate and authorize the prototype
administrator and pass only the confirmed administrator context into the
runtime. They must also apply:

```ts
applyPrivateProductDraftImageResponseHeaders();
```

This emits `Cache-Control: private, no-store`. Signed URLs are opaque bearer
capabilities: do not parse, log, persist, or place them in route search
parameters. The ProductDraft index and review page own browser refresh
behavior when a signed URL expires or an image load fails.

Do not place TanStack `createServerFn` exports in this folder if they need to be
imported by route or client code. Put focused `*.functions.ts` files at the
feature root instead.

## Administrator ProductDraft Index

`AdminProductDraftIndexService` supplies the cross-seller read model for
`/admin/product-drafts`. Its server function authenticates and authorizes the
prototype administrator before checking the ProductDraft deployment gate or
constructing a service-role runtime.

The repository reads ProductDraft rows in `created_at DESC, id DESC` order.
Its opaque versioned cursor binds the final row identity to the resolved limit,
status filter, and seller filter. A cursor cannot be reused with a different
request.

Each page resolves seller, category, facts revision, immutable classifier
source membership, and ordered ProductDraft image rows through set-based
queries. Conflicting classifier source memberships fail the read instead of
choosing an arbitrary historical import.

Preview selection preserves the stored cover identity:

1. use the stored cover image when present;
2. otherwise use the first image by `source_position ASC, id ASC`; or
3. return a missing preview when there is no image row.

The service submits at most one selected image per ProductDraft to
`ProductDraftImageDeliveryService` in one bulk invocation. It never scans for a
second storage fallback. Only an available result includes a private signed URL
and expiry; every other delivery state remains a nonfatal placeholder unless
the complete delivery service is unavailable.
