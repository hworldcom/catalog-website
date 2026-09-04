# Ticket 0039c1: UAT Marketplace Fixtures

## Status

Implemented and seeded in hosted UAT on 2026-08-10.

## Ownership

- Repository: `catalog-website`
- Migrated from: `catalog-classifier/tickets/0039c1-uat-marketplace-fixtures.md`
- Migrated on: 2026-08-15
- Record type: completed implementation ticket

## Objective

Replace the current disposable seller catalog in the hosted Bazoria User
Acceptance Testing (UAT) project with a small, visually useful marketplace
fixture set. Create four seller accounts, sixteen published products, generated
seller and product images, and enough audience/category variation to test the
public navigation and authenticated seller upload workflows.

This is a server-only UAT setup operation. It is not an application startup
seed, database migration, browser action, or production-data contract.

## Environment Boundary

The command may run only when `SUPABASE_URL` identifies the hosted UAT project:

```text
https://jhkouuxouplqcfecjutd.supabase.co
```

Reject a local, production, unknown, or malformed destination before deleting
or creating any data. Require an additional explicit confirmation variable:

```text
BAZORIA_ALLOW_UAT_FIXTURE_RESET=true
```

Use server-only Supabase administrator and service-role credentials. Never
expose them to the browser. The fixed seller password below is intentionally a
UAT-only credential and must never be reused for a real seller or production
account.

The hard-reset phase also requires a server-only PostgreSQL connection string:

```text
BAZORIA_UAT_DATABASE_URL=postgresql://...
```

The command validates that either the direct database host or the pooler user
contains the exact UAT project reference before opening the connection. Direct
database access is required because `product_code_allocations` intentionally
denies service-role table deletion. Keep the destructive SQL inside this
command; do not add a deployed UAT-reset database function.

## QA Account Contract

Create and email-confirm these Supabase Auth accounts and connect each account
to exactly one seller:

| Seller | Email | Password |
| --- | --- | --- |
| Luna Atelier | `qa.luna-atelier@bazoria.test` | `Bazoria-QA-2026!` |
| Vela Essentials | `qa.vela-essentials@bazoria.test` | `Bazoria-QA-2026!` |
| Northline Menswear | `qa.northline-menswear@bazoria.test` | `Bazoria-QA-2026!` |
| Little Orbit Kids | `qa.little-orbit@bazoria.test` | `Bazoria-QA-2026!` |

The accounts must be able to:

- sign in through the normal Bazoria authentication page;
- open only their own seller dashboard and products;
- create a direct multi-image ProductDraft;
- start and resume a classifier-assisted upload; and
- never read or mutate another fixture seller's private records.

Keep prototype-administrator accounts and unrelated administrator allowlist
configuration unchanged.

## Seller Fixture Matrix

Create four published, storefront-enabled sellers with generated names, short
descriptions, logos, and storefront cover images:

| Seller | Slug | Audience focus | Product categories |
| --- | --- | --- | --- |
| Luna Atelier | `luna-atelier` | Women | Dresses, Skirts, Cardigans, Blazers |
| Vela Essentials | `vela-essentials` | Women | Leggings, Sweaters, Coats, Vests |
| Northline Menswear | `northline-menswear` | Men | Trousers, Jeans, Jackets, T-shirts |
| Little Orbit Kids | `little-orbit-kids` | Kids | Hoodies, Shorts, Sweatpants, Tracksuit sets |

Each seller must have a unique valid company code under the existing company-
code contract. Seller attribution is immutable after fixture creation.

Sportswear and Sweatshirts intentionally remain empty. This preserves a real
empty-category case while populating sixteen of the eighteen garment leaves.

## Product Contract

Create four published products per seller. Every fixture product must have:

- a concise title and factual English description;
- the leaf category shown in the fixture matrix;
- exactly the seller's audience focus as its authoritative audience membership;
- a valid allocated product code rather than a hand-written placeholder;
- a plausible UAT price, currency, minimum order quantity, pack size, and stock
  state;
- one generated public catalog image; and
- a completed durable public-image publication state consistent with its cover
  and gallery rows.

For one product per seller, add a second generated gallery image. The selected
cover remains the first image and gallery ordering must be deterministic.

Create products through the existing protected draft, audience, image, product-
code, and publication operations wherever available. A fixture-only service-
role operation may orchestrate those contracts, but it must not leave a schema
state that the normal application could not produce. Do not bypass required
audience, product-code, public-image manifest, cover, or seller-ownership
invariants with raw published-row insertion.

## Image Contract

- Generate original synthetic catalog photographs and seller branding for this
  fixture set. Do not hotlink third-party product images.
- Each storefront cover must incorporate that fixture seller's own logo mark
  and exact seller name as part of the showroom scene. Keep the left side clear
  enough for the storefront's live heading and actions, and place the embedded
  branding on the right so it remains distinct from the dynamic page content.
- The repository has no dedicated seller-media bucket. Store generated UAT
  seller logos and covers in the existing public `product-images` bucket under
  `uat-marketplace-fixtures/sellers/{sellerSlug}/...`. This is a fixture-only
  public-media convention, not a general seller-media upload contract.
- Upload draft and public product media through the existing private-draft and
  durable-publication storage contracts.
- Use stable object-key prefixes owned by this fixture set so cleanup can
  identify objects without listing or deleting unrelated storage.
- Generated images must contain no third-party logos, trademarks, watermarks,
  prices, or text that looks like a real certification.
- Use meaningful image alternative text derived from the fixture product title
  in public interfaces; do not encode accessibility text into the bitmap.

Generated source assets may remain local and untracked. The durable UAT copies
live in Supabase Storage.

## Destructive Cleanup Contract

Before creating the fixture set, remove the current disposable UAT seller data:

- existing seller-owned ProductDrafts and published products;
- product audience memberships, descriptions, facts, codes, images, publication
  runs, and source/import memberships owned by those products;
- website-side classifier workflow and import records attributed to the removed
  sellers;
- seller profile rows and their seller-owned storage objects; and
- seller Supabase Auth users that are not retained prototype administrators.

Capture database-owned object keys before deleting rows. Delete private and
public storage objects only when the key belongs to a removed seller or product,
and verify storage deletion before reporting success. Do not delete shared
configuration, taxonomy, migrations, categories, administrator accounts, or
classifier-service database records.

Use existing protected cleanup or archival functions where their contract
requires them. If a hard delete is required for disposable fixture data, perform
it only in the server-only UAT command and in foreign-key-safe order.

## Idempotency And Failure Contract

Provide commands conceptually equivalent to:

```text
npm run reset:uat-marketplace-fixtures
npm run seed:uat-marketplace-fixtures
```

The seed command may invoke reset automatically after validating the target and
confirmation flag. Re-running after a complete or partial attempt must converge
to exactly four fixture sellers and sixteen fixture products without duplicate
accounts, products, codes, memberships, database image rows, or storage objects.

Database transactions cannot include Auth or Storage operations. Execute the
operation in explicit phases, persist or print a phase summary, and make every
phase safe to retry. On failure, return a non-zero exit code with the failed
phase and stable identifiers, without printing access tokens or service-role
keys.

## Post-Moderation Handoff

This implemented command targets the pre-moderation schema. It must not run
after ticket `0040` migrations because direct public-row construction would
bypass immutable moderation history.

Retain its fixture manifest, QA credential contract, generated source-image
pack, expected audience/category coverage, and deterministic product-code inputs
as restoration inputs. Ticket `0038` owns adapting or replacing the command so
the same logical synthetic marketplace is recreated with valid approved seller
profiles, immutable product submissions, administrator decisions, completed
activation runs, and public manifests. New row and object identifiers are
allowed. This adaptation happens after the `0040` schema and workflows are
complete and is used after the guarded hosted UAT reset.

## Non-Goals

- Production sample data or production account creation.
- Populating every category for every audience.
- Testing seller or product moderation from ticket `0040` in this
  pre-moderation implementation. Ticket `0038` owns the replacement seed and its
  moderation-history verification.
- Adding another public fixture endpoint or browser-visible reset button.
- Deleting durable classifier-service batches from the separate classifier
  database.

## Acceptance Criteria

- The previous disposable UAT sellers and their website-owned catalog records
  are absent.
- Exactly four fixture sellers and sixteen fixture products are present.
- Women shows both women-focused sellers and their eight products.
- Men shows Northline Menswear and its four products.
- Kids shows Little Orbit Kids and its four products.
- Clothing contains the expected populated categories for each audience.
- Sportswear and Sweatshirts remain successful empty cases.
- Every product has a visible cover; four products have a second gallery image.
- Seller logos and covers are visible without third-party hotlinks.
- Each fixed QA credential signs in and resolves only its expected seller.
- Every QA seller can begin both direct and classifier-assisted upload flows.
- A second seed run produces no duplicates and no changed product codes.
- The command refuses to run without the exact UAT project and explicit
  confirmation flag.

## Dependencies

- `0039a-product-audience-persistence-and-editing`.
- `0039b-audience-aware-public-catalog-reads`.
- `0039c-responsive-clothing-and-seller-navigation`.
- Existing seller ownership, product-code, private image, durable publication,
  direct upload, and classifier-assisted upload contracts.

## Validation Notes

- Add command tests for destination refusal, missing confirmation, idempotent
  Auth lookup, cleanup scoping, storage-key scoping, and retry after each phase.
- Run the command twice against UAT and compare seller, product, product-code,
  membership, image-row, and storage-object counts.
- Sign in once as each QA seller and verify seller isolation.
- Create one direct multi-image draft and one classifier-assisted workflow from
  at least two different fixture accounts.
- Inspect Women, Men, and Kids navigation, seller menus, storefronts, category
  pages, product cards, and product galleries at desktop and mobile widths.

## Implementation Result

- Added guarded reset, seed, and verify commands in `catalog-website`.
- Generated and uploaded 28 original JPEG assets: four logos, four storefront
  covers, and twenty product-gallery images.
- Updated fixture bundle `0038d-v2` with four branded storefront covers that
  pair each seller's existing showroom scene with its own logo and exact name.
- The first complete seed removed four disposable sellers and created the four
  fixture sellers, sixteen published products, and twenty public product-image
  rows.
- A second complete seed performed no reset, created no duplicates, and kept
  all sixteen product codes unchanged.
- All four fixed QA accounts signed in and resolved to exactly their expected
  seller owner row.
- Public reads returned 2 sellers and 8 products for Women, 1 seller and 4
  products for Men, and 1 seller and 4 products for Kids.
- Sportswear and Sweatshirts returned successful empty product lists.
- All 28 public seller and product JPEG URLs returned a successful image
  response.
- Automated website validation passed: 160 test files with 987 tests, lint
  with pre-existing Fast Refresh warnings only, and a production build.
