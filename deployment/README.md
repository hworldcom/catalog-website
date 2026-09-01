# Deployment Inventory

This directory contains non-secret, reviewable deployment facts. It never
contains database passwords, application keys, user credentials, or complete
database connection strings.

- `reference-data.json` is the exact category and product-audience baseline.
- `environments/uat.json` records the isolated UAT project.
- `environments/production.json` records the isolated production project.

Environment inventories are validated by the 0038c2 database and storage
commands. Their `bootstrap` fields remain `null` until schema, reference data,
storage, authentication, email delivery, and administrator setup have all been
verified for that environment. The recorded Git commit is the clean commit used
to perform the bootstrap, not the later commit that records the result.

The authentication inventory also records the account password policy and the
public Google sign-in release gate. Google remains disabled until the dedicated
provider deployment passes. A `null` password-policy verifier means an operator
still needs to confirm in the matching Supabase dashboard that the minimum
length is eight, required characters are disabled, and the recorded Site URL
and redirects remain unchanged. Record the operator and verification time only
after that check succeeds.

Secret bootstrap values belong only in the ignored root files
`.env.supabase.uat.local` and `.env.supabase.production.local`. Hosted writes
always require an explicit environment and matching project confirmation.

## UAT Marketplace Fixtures

The fixture commands are server-only operations. Their non-secret target facts
come from `environments/uat.json`; credentials are supplied by the operator or
the protected GitHub `uat` environment:

| Value                                    | Owner                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| `BAZORIA_DEPLOYMENT_ENVIRONMENT`         | command or protected workflow; always `uat`                            |
| `BAZORIA_UAT_FIXTURE_PROJECT_REF`        | protected UAT environment variable                                     |
| `BAZORIA_UAT_FIXTURE_ADMIN_USER_ID`      | protected UAT environment variable; must be in the inventory allowlist |
| `BAZORIA_UAT_FIXTURE_USER_PASSWORD`      | protected UAT environment secret; seed only                            |
| `BAZORIA_UAT_FIXTURE_ASSET_DIR`          | optional local override; seed only                                     |
| `BAZORIA_UAT_FIXTURE_RESET_CONFIRMATION` | explicit operator input; reset only                                    |
| `BAZORIA_UAT_DATABASE_URL`               | protected UAT environment secret                                       |
| `SUPABASE_URL`                           | protected UAT environment variable                                     |
| `SUPABASE_SERVICE_ROLE_KEY`              | protected UAT environment secret                                       |

The tracked synthetic bundle is under `fixtures/uat/0038d`. It is validated
before fixture mutations and is excluded from container build contexts and
runtime images.
