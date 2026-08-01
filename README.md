# Bazoria Web

Bazoria Web is the authenticated storefront, seller dashboard, and delegated
administrator interface for the catalog-classifier workflow. Browser features
belong in this repository. The deprecated standalone classifier frontend under
`catalog-classifier/apps/web` is not a supported development target.

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
