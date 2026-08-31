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
