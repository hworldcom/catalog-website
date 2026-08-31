# Bazoria Web

Bazoria Web is the authenticated storefront, seller dashboard, and delegated
administrator interface for the catalog-classifier workflow. Browser features
belong in this repository. Ticket `0032d` removed the deprecated standalone
classifier frontend from the classifier repository.

The cross-repository startup sequence is documented in
[`catalog-classifier/docs/local-start.md`](../catalog-classifier/docs/local-start.md).
The canonical browser and backend quality-assurance flow is documented in
[`catalog-classifier/docs/manual-qa.md`](../catalog-classifier/docs/manual-qa.md).

## Runtime Requirements

- Node.js 22.13.0 or newer, as recorded in `.nvmrc`.
- npm 10.9.2 or newer.
- Docker Desktop or another Docker-compatible runtime for local database work.
- Access to the isolated Bazoria User Acceptance Testing (UAT) Supabase project
  only when running an explicit hosted preflight or migration.
- A separately running local classifier API only when testing the optional
  classifier-assisted workflow locally.

UAT and production use separate Supabase projects and credentials. Neither
hosted project is linked persistently in this repository.

## Install

From the Bazoria repository:

```bash
cd /Users/hoangdeveloper/catalog-website
nvm use
npm ci
```

When `nvm` is unavailable, the repository provides Node.js 22 wrappers:

```bash
cd /Users/hoangdeveloper/catalog-website
npm run ci:node22
```

## Environment

Create the local environment from the committed non-secret template:

```bash
cd /Users/hoangdeveloper/catalog-website
cp .env.example .env
```

Obtain the UAT publishable key, service-role key, seller identifiers, and
administrator user identifiers through the project owner. Do not commit them.

The server reads the browser-safe Supabase URL and publishable key at runtime
and exposes only those values through `GET /api/runtime-config`. Browser code
does not use build-time `VITE_SUPABASE_*` values. The service-role key is
server-only and must never appear in browser code, the runtime public response,
or logs. The local `.env` file is ignored by Git.

The required classifier organization for the prototype is
`00000000-0000-0000-0000-000000000001`. Seller ownership remains in Bazoria's
`seller_classifier_batches` records; the browser sees only the opaque Bazoria
workflow identifier.

Classifier-assisted upload is release-gated. User Acceptance Testing and
production must set `BAZORIA_CLASSIFIER_ASSISTED_UPLOAD_ENABLED=false` and must
not configure classifier integration variables. Local development also
defaults to disabled. Set the flag to `true` locally only when the classifier
API is running and the classifier values in `.env` are complete; startup then
validates both the seller workflow and import configuration before accepting
traffic.

## Start Bazoria Web

For manual product workflows, run Bazoria Web directly. For local
classifier-assisted testing, first enable the release gate in `.env` and start
the classifier stack by following the cross-repository guide. Then run Bazoria
Web in its own terminal:

```bash
cd /Users/hoangdeveloper/catalog-website
nvm use
npm run dev
```

Without an active Node.js version manager, use `npm run dev:node22`. Deployment
packaging does not change either local development path.

Open `http://localhost:8080`. Sign in at `http://localhost:8080/auth`.

When explicitly enabled locally, supported classifier routes include:

```text
/seller/classifier-batches
/seller/classifier-batches/new
/seller/classifier-batches/{workflowId}/upload
/seller/classifier-batches/{workflowId}/processing
/seller/classifier-batches/{workflowId}/review
/seller/classifier-batches/{workflowId}/import
/admin/classifier-uploads/new
/admin/classifier-uploads/{workflowId}
```

Administrator routes are currently opened directly. Every administrator
operation remains server-authorized through the configured prototype
administrator allowlist.

When classifier-assisted upload is disabled, its seller and administrator
entry points are hidden, direct browser routes redirect to the normal product
areas, and direct server operations return the stable
`classifier_assisted_upload_disabled` outcome. Historical ProductDrafts and
products imported from classifier workflows remain available through normal
product routes. UAT renders a persistent `UAT` environment badge; production
does not.

## Local Dispatch And Recovery

Normal classifier import authorization schedules the exact import through the
Bazoria server process. Normal product publication is also dispatched by the
Bazoria server process. Browser polling only reads progress; it does not start
work.

The continuous import worker is recovery-only. Run it only when diagnosing or
recovering durable pending imports while classifier-assisted upload is enabled
locally:

```bash
cd /Users/hoangdeveloper/catalog-website
set -a
source .env
set +a
npm run worker:classifier-import
```

The command refuses startup with `classifier_assisted_upload_disabled` while
the release gate is false and does not read classifier integration settings.

The classifier's optional multimodal worker is a separate classifier process;
see the cross-repository start guide.

## Deployed Product Activation Worker

User Acceptance Testing and production dispatch product activation through a
private, standalone worker service. It starts independently from Bazoria Web
and exposes only `GET /health` and the authenticated internal Cloud Tasks
endpoint:

The compiled production command is `npm run start:product-activation-worker`.
Local engineering checks may continue to use
`npm run worker:product-activation`.

The worker uses the publication image-count, concurrency, item-timeout,
worker-deadline, and claim-timeout settings plus the server-side Supabase
credentials, task audience, task-caller service account, and Cloud Run `PORT`.
It does not need queue creation credentials and does not serve browser routes.
Local development continues to use the in-process product activation
dispatcher; the standalone command exists for the private deployed service and
deployment smoke tests.

## Deployed Product Activation Dispatch Reconciliation

User Acceptance Testing and production run one bounded server-only pass to
recover activation runs committed before their deterministic Cloud Task was
confirmed:

The compiled production command is
`npm run start:product-activation-reconciliation`. Local engineering checks may
continue to use `npm run reconcile:product-activation-dispatches`.

The command requires cloud dispatch mode, the same Cloud Tasks and server-side
Supabase configuration as the website dispatcher, and the reconciliation batch
size and deadline settings from `.env.example`. It dispatches sequentially,
never executes activation work itself, and exits nonzero if selected work
remains pending or a dispatch failed. It is intended for the scheduled Cloud
Run Job owned by deployment ticket `0038`; browser reads never run it.

## Production Runtime Artifact

`npm run build` creates the Nitro Node server and three compiled role entry
points under `.output`:

```text
npm run start:web
npm run start:product-activation-worker
npm run start:product-activation-reconciliation
```

The checked-in multi-stage `Dockerfile` packages those entries into one
non-root Node.js 22.13.1 image. Build the tested architecture explicitly:

```bash
docker build \
  --platform linux/amd64 \
  --build-arg BAZORIA_RELEASE_COMMIT="$(git rev-parse HEAD)" \
  --build-arg BAZORIA_BUILD_ID=local \
  --tag bazoria-web:local .
```

Cloud Run selects a role by overriding the image command; it does not rebuild
the image. The web role exposes database-free `GET /healthz`, build identity at
`GET /version`, and runtime browser configuration at
`GET /api/runtime-config`. Run `npm run qa:container-runtime` for the local
container health and configuration smoke test.

## Database Tooling

The repository pins Supabase command-line interface version `2.116.0` in the
package lockfile. Run it only through the npm commands below; do not use a global
installation, `supabase@latest`, or persistent project-link state.

Start the local Supabase stack, reset it through the complete migration history,
and run all database contracts with:

```bash
cd /Users/hoangdeveloper/catalog-website
npm run supabase:start
npm run db:local:reset
npm run db:local:test
```

The complete deployment-foundation check starts the local stack when needed,
resets without seed data, runs every Structured Query Language (SQL) contract,
reruns the deployment-foundation contract explicitly, and checks generated
TypeScript database types:

```bash
npm run db:local:verify
```

Generate database types only from the clean local schema. The check command
uses a temporary file and never modifies the worktree:

```bash
npm run db:types:generate
npm run db:types:check
```

Docker must be running for every local database command. An unavailable runtime
fails with `supabase_local_runtime_unavailable` rather than falling through to a
hosted target.

### Hosted Environment Preflight

Copy the non-secret templates into ignored root files and enter the matching
project reference, application URL, and percent-encoded database connection:

```bash
cp supabase/environments/uat.env.example .env.supabase.uat.local
cp supabase/environments/production.env.example .env.supabase.production.local
```

Run a read-only preflight for exactly one named environment:

```bash
npm run db:environment:preflight -- --environment uat
npm run db:environment:preflight -- --environment production
```

The command validates the target before connecting, prints no credentials, and
reports `uninitialized`, `behind`, `current`, `unknown_history`, or
`schema_drift`. It compares migration history through the explicit database
URL, performs a database-push dry run, and checks generated types and the
deployment foundation when versions are current.

`unknown_history` means the hosted history is not a prefix of the repository
history. `schema_drift` means versions match but types, extensions, storage, or
row-level security do not. Investigate either state; do not repair it with a
forced push or history rewrite.

### Hosted Environment Migration

After reviewing a valid preflight, apply the displayed migration range only
with the exact selected project reference:

```bash
npm run db:environment:migrate -- \
  --environment uat \
  --confirm-project <uat-project-reference>

npm run db:environment:migrate -- \
  --environment production \
  --confirm-project <production-project-reference>
```

The write command repeats preflight, uses `supabase db push --db-url`, and
verifies the target is `current` afterward. A current target is a successful
no-op. These commands never run `db reset` against a hosted database and cannot
be redirected by stale local link state. Applying hosted migrations remains a
manually approved release operation; ordinary tests mock all hosted command
boundaries.

## UAT Marketplace Fixtures

The earlier fixture command targets a retired disposable project and must not be
used with either isolated environment. Ticket `0038d` will replace it with a
moderation-compatible, explicitly guarded UAT fixture workflow after the new
database and storage foundation is bootstrapped.

## Validation

Run the supported checks with the repository's required Node.js version:

```bash
cd /Users/hoangdeveloper/catalog-website
npm run test:node22
npm run lint:node22
npm run build:node22
```

The database contract tests under `supabase/tests` run only against local
Supabase. They must not target hosted UAT or production.

## Security Boundaries

- Browser requests use the Supabase publishable key and authenticated session.
- Website server code alone may use the Supabase service-role key.
- Browser classifier workflows use opaque Bazoria workflow identifiers.
- Raw classifier batch, organization, task, provider, and storage identifiers
  remain server-side.
- Direct classifier API commands documented for local quality assurance are
  engineering checks, not production browser contracts.
