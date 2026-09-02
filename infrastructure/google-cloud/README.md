# Google Cloud Infrastructure

This directory owns isolated Bazoria Google Cloud infrastructure for user
acceptance testing (UAT) and production. Terraform never infers a project from
the active Google Cloud command-line configuration.

## Toolchain

- Terraform: `1.15.9`, pinned by the repository `.terraform-version` file.
- Google provider: `~> 7.46.0`, resolved exactly in each root lock file.
- Supported lock platforms: `darwin_arm64` and `linux_amd64`.

The pinned versions deliberately use the final stable Terraform `1.15` patch
and Google provider `7.x` release rather than newly released major versions.

Install the exact Terraform version on macOS with `tfenv`:

```bash
brew install tfenv
cd /Users/hoangdeveloper/catalog-website
tfenv install
tfenv use
terraform version
```

The reported version must be `1.15.9` before running repository commands.

## Layout

- `bootstrap/` creates one protected state bucket and enables the minimum APIs
  required to establish remote state. Its backend declaration is generated and
  ignored: local for the first apply, then Google Cloud Storage for migration.
- `platform/` enables the remaining reviewed APIs and is extended by later
  infrastructure tickets.
- `modules/` contains reusable modules without environment defaults.
- `environments/` contains reviewed non-secret inputs and backend settings.
- `identity-catalog.json` is the exact service-account, custom-role, and GitHub
  federation contract shared by both environments.
- `artifact-catalog.json` is the exact private repository, direct access, and
  permission-smoke contract shared by both environments.
- `inventory/` contains reviewed external identifiers and, after apply, the
  generated non-secret applied inventory. `reviewed-identity-access.json`
  records every direct and inherited identity binding in scope.

Google Container Analysis is not enabled. Ticket `0038f` owns the repository
container vulnerability scan.

## Local Validation

Validation does not contact UAT or production:

```bash
cd /Users/hoangdeveloper/catalog-website
npm run infra:foundation:check
npm run infra:identity:check
npm run infra:artifact:check
npm run infra:monitoring:check
npm run infra:terraform:validate
```

The second command formats-checks, initializes with hosted backends disabled,
validates, and runs mock-provider Terraform tests for both roots.

## Authentication Preflight

Terraform uses Application Default Credentials (ADC) for the initial operator
plans and applies. These credentials are local user credentials, not a
downloaded service-account key.

```bash
gcloud auth login
gcloud auth application-default login
gcloud auth list --filter=status:ACTIVE
```

The reviewed operator is `hoang@lnlabs.xyz`. Do not continue if another account
is active. The local default project may remain `catalog-classifier`; every
command and every Terraform provider uses an explicit reviewed project.

Verify the external inventory before planning:

```bash
gcloud projects describe bazoria-uat-lnlabs \
  --format='yaml(projectId,projectNumber,parent)'
gcloud billing projects describe bazoria-uat-lnlabs \
  --format='yaml(projectId,billingAccountName,billingEnabled)'
gcloud projects describe bazoria-prod-lnlabs \
  --format='yaml(projectId,projectNumber,parent)'
gcloud billing projects describe bazoria-prod-lnlabs \
  --format='yaml(projectId,billingAccountName,billingEnabled)'
```

Expected organization: `33779488200`. Expected billing account:
`014CA9-692646-D9E4CE`. Billing must be enabled for both projects.

The reviewed GitHub source is repository `hworldcom/catalog-website`, numeric
repository identifier `1313750742`, owned by `hworldcom`, numeric owner
identifier `144285964`. Federation conditions require both names and both
numeric identifiers. Because the repository was created on July 27, 2026, the
condition also requires GitHub's immutable subject form, such as
`repo:hworldcom@144285964/catalog-website@1313750742:environment:uat`.

## Initial Bootstrap Plan

Plan one environment at a time. A plan reads the selected project but does not
create or change resources.

For UAT:

```bash
cd /Users/hoangdeveloper/catalog-website
export TF_DATA_DIR="$PWD/.terraform-data/bootstrap-uat"
rm -rf "$TF_DATA_DIR"
node scripts/terraform/configure-bootstrap-backend.mjs \
  --mode local \
  --environment uat
terraform -chdir=infrastructure/google-cloud/bootstrap init \
  -reconfigure \
  -input=false
terraform -chdir=infrastructure/google-cloud/bootstrap plan \
  -input=false \
  -var-file=../environments/uat/bootstrap.tfvars.json \
  -out=/tmp/bazoria-uat-bootstrap.tfplan
terraform -chdir=infrastructure/google-cloud/bootstrap show \
  -json /tmp/bazoria-uat-bootstrap.tfplan > /tmp/bazoria-uat-bootstrap.tfplan.json
npm run infra:foundation:plan:check -- \
  --plan /tmp/bazoria-uat-bootstrap.tfplan.json \
  --environment uat \
  --root bootstrap
```

For production, use a distinct data directory and production variables:

```bash
cd /Users/hoangdeveloper/catalog-website
export TF_DATA_DIR="$PWD/.terraform-data/bootstrap-production"
rm -rf "$TF_DATA_DIR"
node scripts/terraform/configure-bootstrap-backend.mjs \
  --mode local \
  --environment production
terraform -chdir=infrastructure/google-cloud/bootstrap init \
  -reconfigure \
  -input=false
terraform -chdir=infrastructure/google-cloud/bootstrap plan \
  -input=false \
  -var-file=../environments/production/bootstrap.tfvars.json \
  -out=/tmp/bazoria-production-bootstrap.tfplan
terraform -chdir=infrastructure/google-cloud/bootstrap show \
  -json /tmp/bazoria-production-bootstrap.tfplan \
  > /tmp/bazoria-production-bootstrap.tfplan.json
npm run infra:foundation:plan:check -- \
  --plan /tmp/bazoria-production-bootstrap.tfplan.json \
  --environment production \
  --root bootstrap
```

Do not apply either plan without explicit review and approval. Never run both
environment bootstraps from the same local state file.

## Apply And State Migration

Immediately before apply, regenerate and review the plan. After approval, use
the matching environment data directory. For UAT:

```bash
terraform -chdir=infrastructure/google-cloud/bootstrap apply \
  /tmp/bazoria-uat-bootstrap.tfplan
node scripts/terraform/configure-bootstrap-backend.mjs \
  --mode gcs \
  --environment uat
terraform -chdir=infrastructure/google-cloud/bootstrap init \
  -migrate-state \
  -input=false \
  -backend-config=../environments/uat/bootstrap.gcs.tfbackend
terraform -chdir=infrastructure/google-cloud/bootstrap state list
gcloud storage ls gs://bazoria-uat-lnlabs-tfstate/terraform/bootstrap/
```

Only after the remote state and its versioned object are verified, remove the
local backup:

```bash
rm -f infrastructure/google-cloud/bootstrap/terraform.tfstate \
  infrastructure/google-cloud/bootstrap/terraform.tfstate.backup \
  .terraform-data/state/bootstrap-uat/terraform.tfstate \
  .terraform-data/state/bootstrap-uat/terraform.tfstate.backup
```

Use the production backend file and bucket for production. Never copy, import,
or migrate state between environments.

## Platform Plan And Apply

After the matching bootstrap state is remote, initialize the platform root.
For UAT:

```bash
cd /Users/hoangdeveloper/catalog-website
export TF_DATA_DIR="$PWD/.terraform-data/platform-uat"
terraform -chdir=infrastructure/google-cloud/platform init \
  -input=false \
  -backend-config=../environments/uat/platform.gcs.tfbackend
terraform -chdir=infrastructure/google-cloud/platform plan \
  -input=false \
  -var-file=../environments/uat/platform.tfvars.json \
  -out=/tmp/bazoria-uat-platform.tfplan
terraform -chdir=infrastructure/google-cloud/platform show \
  -json /tmp/bazoria-uat-platform.tfplan > /tmp/bazoria-uat-platform.tfplan.json
npm run infra:foundation:plan:check -- \
  --plan /tmp/bazoria-uat-platform.tfplan.json \
  --environment uat \
  --root platform
```

Apply only the reviewed saved plan. Repeat with a distinct production data
directory and the production backend and variable files.

## Identity Foundation Plan And Apply

Ticket `0038e2a` extends the operator-controlled bootstrap root with seven
environment-specific service accounts, two protected custom roles, a GitHub
Workload Identity Federation pool, separate Terraform and artifact providers,
and the reviewed impersonation and state-bucket bindings. It does not create
service-account keys, secrets, registries, queues, runtimes, jobs, or
schedulers.

Because bootstrap state is already remote, plan UAT directly against its
remote backend:

```bash
cd /Users/hoangdeveloper/catalog-website
export TF_DATA_DIR="$PWD/.terraform-data/bootstrap-uat"
node scripts/terraform/configure-bootstrap-backend.mjs \
  --mode gcs \
  --environment uat
terraform -chdir=infrastructure/google-cloud/bootstrap init \
  -reconfigure \
  -input=false \
  -backend-config=../environments/uat/bootstrap.gcs.tfbackend
terraform -chdir=infrastructure/google-cloud/bootstrap plan \
  -input=false \
  -var-file=../environments/uat/bootstrap.tfvars.json \
  -out=/tmp/bazoria-uat-identity.tfplan
terraform -chdir=infrastructure/google-cloud/bootstrap show \
  -json /tmp/bazoria-uat-identity.tfplan \
  > /tmp/bazoria-uat-identity.tfplan.json
npm run infra:foundation:plan:check -- \
  --plan /tmp/bazoria-uat-identity.tfplan.json \
  --environment uat \
  --root bootstrap
```

Review the complete plan and obtain explicit approval immediately before
applying its saved plan. After UAT apply, verify the seven service accounts,
custom roles, Workload Identity Federation resources, state bindings, and lack
of user-managed keys. Then repeat the plan, approval, apply, and verification
sequence for production using its own `TF_DATA_DIR`, backend, variable file,
and `/tmp/bazoria-production-identity.tfplan` output. Never apply both
environments from one initialized Terraform directory.

After an environment apply, set these non-secret variables on the matching
protected GitHub environment:

- `BAZORIA_GOOGLE_TERRAFORM_WORKLOAD_IDENTITY_PROVIDER`;
- `BAZORIA_GOOGLE_TERRAFORM_SERVICE_ACCOUNT`;
- `BAZORIA_GOOGLE_ARTIFACT_WORKLOAD_IDENTITY_PROVIDER`; and
- `BAZORIA_GOOGLE_ARTIFACT_SERVICE_ACCOUNT`.

Use the exact values from the bootstrap `foundation_inventory` output. Run
`terraform-environment.yml` to prove the Terraform identity can read the
matching platform state and produce a read-only plan. Run
`artifact-release.yml` to prove the artifact identity cannot impersonate the
Terraform account and vice versa. Allow five minutes for new federation policy
to propagate before treating a failed first attempt as a configuration defect.

Bootstrap identity and trust changes remain operator-controlled. The
federated Terraform identity manages only the separately initialized platform
root and cannot edit its own trust, custom roles, project grants, or state
bucket policy.

## Secret Containers And Runtime Access

Ticket `0038e2b` adds two protected, matching-environment Secret Manager
containers to the platform root:

- `bazoria-uat-supabase-service-role` and
  `bazoria-prod-supabase-service-role`;
- `bazoria-uat-openai-api-key` and `bazoria-prod-openai-api-key`.

Each container uses one user-managed replica in `europe-west3`, carries only
the `environment`, `managed_by`, and `purpose` labels, and has Terraform
`prevent_destroy` protection. The website, activation worker, and
reconciliation accounts can access the matching Supabase secret. Only the
website account can access the matching OpenAI secret. The Terraform,
artifact-release, task-invoker, scheduler, anonymous, public, and
other-environment identities receive no payload access.

Terraform creates containers and access policies only. It must never create,
read, output, or store a secret version or payload. Plan and apply the platform
root one environment at a time using the commands in **Platform Plan And
Apply**, and obtain separate approval for each saved plan.

After an environment apply, add each initial value from a trusted operator
terminal without placing the value in a command argument, repository file, or
Terraform variable:

```bash
read -r -s BAZORIA_SECRET_VALUE
printf '%s' "${BAZORIA_SECRET_VALUE}" | gcloud secrets versions add SECRET_NAME \
  --project=PROJECT_ID \
  --data-file=-
unset BAZORIA_SECRET_VALUE
```

Replace `SECRET_NAME` and `PROJECT_ID` with the reviewed matching-environment
container and project. Do not paste payloads into chat. Record the explicit
enabled version resource name for later runtime deployment; runtime
configuration must never reference `latest`.

## Artifact Registry And Release Verification

Ticket `0038e2c` adds one protected private Docker repository per environment:

- `bazoria-uat-containers` in `bazoria-uat-lnlabs`;
- `bazoria-prod-containers` in `bazoria-prod-lnlabs`.

Both repositories are standard regional repositories in `europe-west3` with
Terraform `prevent_destroy` protection. No `allUsers` or
`allAuthenticatedUsers` binding is allowed. The matching artifact-release
service account is the only Bazoria-managed direct writer. The matching
Terraform account is a direct reader so a later Cloud Run deployment can
validate its selected image digest.

The same-project Google-managed Cloud Run service agent keeps its inherited
project-level `roles/run.serviceAgent` role. That predefined role includes an
artifact upload capability. It is recorded separately in
`reviewed-identity-access.json`; it is not a direct repository grant and is not
used by the Bazoria release workflow.

Plan and apply the platform root one environment at a time using **Platform
Plan And Apply**. Before each apply, review the exact repository identifier,
region, lifecycle protection, direct reader and writer, inherited service-agent
entry, and the reserved `permission-smoke` path. Apply UAT only after explicit
approval, verify it, and repeat the separately approved process for production.

After an environment repository exists, run the protected
`artifact-release.yml` workflow for that environment. It installs Open Container
Initiative Registry As Storage (ORAS) `1.3.3`, proves the artifact identity
cannot impersonate Terraform, and publishes the bounded checked-in fixture to:

```text
europe-west3-docker.pkg.dev/PROJECT_ID/REPOSITORY_ID/permission-smoke:latest
```

The workflow requires the push digest, the resolved tag digest, and Artifact
Registry metadata to agree. It uses `testIamPermissions` against the opposite
environment and requires all tested write permissions to be absent; it never
attempts a cross-environment upload. The `permission-smoke` path is reserved for
infrastructure verification and cannot be selected as a runtime image. Building
the Bazoria application image and validating a runtime image digest are owned
by later deployment tickets.

## Plan-Only Cloud Run Activation Infrastructure

Ticket `0038e3` adds an opt-in runtime module for the public website, private
product-activation worker, reconciliation job, activation queue, and
reconciliation scheduler. The normal checked-in UAT and production variable
files omit `runtime_configuration`, so this ticket cannot deploy a placeholder
image or change the already-applied foundation.

The module accepts one image from the matching environment repository using an
explicit `@sha256:` digest. It rejects mutable tags, another environment's
repository, the reserved permission-smoke path, `latest` secret versions, and
public or provider configuration belonging to another environment. The first
real values and hosted apply remain owned by `0038f`.

The worker uses the deterministic Cloud Run URL:

```text
https://bazoria-ENV-activation-worker-PROJECT_NUMBER.europe-west3.run.app
```

That same value is the task URL and OpenID Connect audience. The queue also
enforces the private worker host, activation endpoint, task-invoker identity,
rate, and retry policy. The application writes the reviewed 270-second
dispatch deadline on every task because Cloud Tasks does not expose that value
as queue configuration.

Only the website and reconciliation identities receive queue-scoped
`roles/cloudtasks.enqueuer` and `roles/cloudtasks.viewer`. The viewer grant is
used only for the exact-name task lookup that resolves an ambiguous create.
Only the task-invoker identity can invoke the worker, and only the scheduler
identity can invoke the reconciliation job.

Validate the inert platform root and the complete synthetic runtime plans with:

```bash
cd /Users/hoangdeveloper/catalog-website
npm run infra:runtime:check
npm run infra:terraform:validate
```

The synthetic digest exists only in Terraform tests and must never be passed to
a hosted plan or apply.

## Plan-Only Custom-Domain Edge Infrastructure

Ticket `0038e4` adds a second opt-in module alongside the digest-bound runtime.
It defines one isolated global external Application Load Balancer per
environment, including a fixed IPv4 address, regional serverless network
endpoint group, HTTPS routing, permanent HTTP redirect, TLS 1.2 policy, and a
Google-managed Certificate Manager certificate.

The module activates only when `runtime_configuration` creates the matching
website service. Checked-in UAT and production variable files therefore remain
inert until `0038f` supplies a real immutable image and reviewed runtime values.

Certificate validation uses one global `PER_PROJECT_RECORD` authorization per
environment. Terraform outputs the exact home.pl `A` and `CNAME` records,
including a trailing-dot canonical-name value, and commands for checking DNS,
certificate state, HTTPS, and the HTTP redirect. Terraform never modifies
home.pl.

Cloud CDN remains disabled. Unknown hosts are redirected to the environment's
canonical host instead of being forwarded to the application, and HTTP
redirects preserve the original path and query. Fixed addresses and all
Certificate Manager resources are protected from ordinary destruction in both
environments.

Validate the edge contract and synthetic UAT and production plans with:

```bash
cd /Users/hoangdeveloper/catalog-website
npm run infra:edge:check
npm run infra:terraform:validate
```

No DNS change, certificate issuance, public traffic, or hosted Terraform apply
occurs until the guided `0038f` deployment.

## Plan-Only Operational Monitoring

Ticket `0038e5a` adds an opt-in monitoring module alongside the digest-bound
runtime and custom-domain edge. It defines five environment-isolated
log-derived metrics, ten alert policies, and two public HTTPS checks. The
health check requires exactly HTTP 204 from `/healthz`; the catalog check
requires exactly HTTP 200 and the bounded `bazoria-public-catalog-v1` marker
from `/?lang=EN&audience=women`.

The module activates only when both `runtime_configuration` and
`monitoring_configuration` are supplied. Checked-in environment variable files
omit both, so repository validation cannot create monitoring resources. A
hosted release must provide an enabled monitoring configuration with one or
more existing, verified channel resource names from the same project:

```hcl
monitoring_configuration = {
  alerting_enabled = true
  notification_channel_names = [
    "projects/PROJECT_ID/notificationChannels/CHANNEL_ID",
  ]
}
```

Terraform rejects an empty list, duplicate channels, cross-project channels,
and direct `run.app` uptime origins. It never creates an email channel or
receives a recipient address. Create and verify the channels in Cloud
Monitoring before the first real plan, then run one bounded UAT test
notification after apply. A reviewed maintenance plan may temporarily set
`alerting_enabled` to `false`; direct console changes are configuration drift.

Validate the complete monitoring catalog and both synthetic environment plans
with:

```bash
cd /Users/hoangdeveloper/catalog-website
npm run infra:monitoring:check
npm run infra:terraform:validate
```

## Applied Inventory

After both roots are applied in both environments, write each non-secret output
to a temporary file:

```bash
terraform -chdir=infrastructure/google-cloud/bootstrap output \
  -json foundation_inventory > /tmp/uat-bootstrap.json
terraform -chdir=infrastructure/google-cloud/platform output \
  -json foundation_inventory > /tmp/uat-platform.json
```

Repeat with the production backend initialized in its own `TF_DATA_DIR`, then
generate the checked-in inventory:

```bash
node scripts/terraform/generate-foundation-inventory.mjs \
  --uat-bootstrap /tmp/uat-bootstrap.json \
  --uat-platform /tmp/uat-platform.json \
  --production-bootstrap /tmp/production-bootstrap.json \
  --production-platform /tmp/production-platform.json \
  --output infrastructure/google-cloud/inventory/applied-foundation.json
```

Review the generated file before committing it. It must contain no credentials
or secret values.

## Recovery And Destruction

- State buckets use object versioning and `prevent_destroy` in both
  environments.
- APIs remain enabled if their Terraform resources are removed from state.
- Never use `terraform destroy` for a state root.
- Recover an accidentally changed state object from the bucket's object
  versions before any further plan.
- Deleting a state bucket requires a reviewed source change removing
  `prevent_destroy`, an explicit backup, and a separately approved break-glass
  operation.
