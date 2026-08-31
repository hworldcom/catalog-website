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
- Access to the hosted Bazoria User Acceptance Testing (UAT) Supabase project.
- A separately running local classifier API only when testing the optional
  classifier-assisted workflow locally.

The hosted Supabase project with reference `jhkouuxouplqcfecjutd` is UAT. It
contains no production data. Production must use a separate Supabase project
and separate credentials.

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

## UAT Database Migrations

Applying migrations to hosted UAT is a controlled engineering operation, not a
normal application startup step. An authorized engineer may link the command
line interface and apply committed migrations:

```bash
cd /Users/hoangdeveloper/catalog-website
npx -y supabase@latest link --project-ref jhkouuxouplqcfecjutd
npx -y supabase@latest db push --linked
```

Review the migration plan before confirming it. Never run `supabase db reset`
against hosted UAT. Automated tests must use mocks or isolated test state and
must not read or mutate UAT.

## UAT Marketplace Fixtures

Ticket `0039c1` provides a destructive, server-only command for replacing the
disposable hosted UAT seller catalog with four QA sellers and sixteen published
products. It is not an application startup seed and must never target
production.

The generated JPEG source pack is kept locally under the ignored
`.uat-fixtures/0039c1` directory. Before running the command, configure the
normal hosted UAT Supabase server variables and these additional variables in
`.env`:

```text
BAZORIA_ALLOW_UAT_FIXTURE_RESET=true
BAZORIA_UAT_DATABASE_URL=postgresql://postgres.jhkouuxouplqcfecjutd:<password>@<pooler-host>:6543/postgres
BAZORIA_UAT_FIXTURE_ASSET_DIR=.uat-fixtures/0039c1
```

Obtain the database connection string from the hosted UAT project's Supabase
**Connect** panel. The command validates both the Supabase application URL and
database connection string against project reference
`jhkouuxouplqcfecjutd` before reading assets or mutating data.

Run the complete seed twice, then verify it:

```bash
npm run seed:uat-marketplace-fixtures
npm run seed:uat-marketplace-fixtures
npm run verify:uat-marketplace-fixtures
```

The second seed must retain the first run's product codes. Use
`npm run reset:uat-marketplace-fixtures` only when an empty seller catalog is
intentionally required; `seed` already resets a non-fixture seller catalog.

## Validation

Run the supported checks with the repository's required Node.js version:

```bash
cd /Users/hoangdeveloper/catalog-website
npm run test:node22
npm run lint:node22
npm run build:node22
```

The database contract tests under `supabase/tests` are run only against an
explicit isolated test database. They must not target hosted UAT.

## Security Boundaries

- Browser requests use the Supabase publishable key and authenticated session.
- Website server code alone may use the Supabase service-role key.
- Browser classifier workflows use opaque Bazoria workflow identifiers.
- Raw classifier batch, organization, task, provider, and storage identifiers
  remain server-side.
- Direct classifier API commands documented for local quality assurance are
  engineering checks, not production browser contracts.
