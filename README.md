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
- A separately running local classifier API for classifier-assisted workflows.

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

Browser-safe values use `VITE_` names. The service-role key is server-only and
must never use a `VITE_` prefix, appear in browser code, or be printed in logs.
The local `.env` file is ignored by Git.

The required classifier organization for the prototype is
`00000000-0000-0000-0000-000000000001`. Seller ownership remains in Bazoria's
`seller_classifier_batches` records; the browser sees only the opaque Bazoria
workflow identifier.

## Start Bazoria Web

Start the classifier stack first by following the cross-repository guide. Then
run Bazoria Web in its own terminal:

```bash
cd /Users/hoangdeveloper/catalog-website
nvm use
npm run dev
```

Open `http://localhost:8080`. Sign in at `http://localhost:8080/auth`.

Supported classifier routes include:

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

## Local Dispatch And Recovery

Normal classifier import authorization schedules the exact import through the
Bazoria server process. Normal product publication is also dispatched by the
Bazoria server process. Browser polling only reads progress; it does not start
work.

The continuous import worker is recovery-only. Run it only when diagnosing or
recovering durable pending imports:

```bash
cd /Users/hoangdeveloper/catalog-website
set -a
source .env
set +a
npm run worker:classifier-import
```

The classifier's optional multimodal worker is a separate classifier process;
see the cross-repository start guide.

## Deployed Product Activation Worker

User Acceptance Testing and production dispatch product activation through a
private, standalone worker service. It starts independently from Bazoria Web
and exposes only `GET /health` and the authenticated internal Cloud Tasks
endpoint:

```bash
npm run worker:product-activation
```

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

```bash
npm run reconcile:product-activation-dispatches
```

The command requires cloud dispatch mode, the same Cloud Tasks and server-side
Supabase configuration as the website dispatcher, and the reconciliation batch
size and deadline settings from `.env.example`. It dispatches sequentially,
never executes activation work itself, and exits nonzero if selected work
remains pending or a dispatch failed. It is intended for the scheduled Cloud
Run Job owned by deployment ticket `0038`; browser reads never run it.

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
