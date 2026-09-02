#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
required_version="$(tr -d '[:space:]' < "${repository_root}/.terraform-version")"
actual_version="$(terraform version -json | node -e 'let value=""; process.stdin.on("data", chunk => value += chunk); process.stdin.on("end", () => process.stdout.write(JSON.parse(value).terraform_version));')"

if [[ "${actual_version}" != "${required_version}" ]]; then
  printf 'Terraform %s is required; found %s.\n' "${required_version}" "${actual_version}" >&2
  exit 1
fi

node "${repository_root}/scripts/terraform/foundation-contract.mjs"
node "${repository_root}/scripts/terraform/identity-contract.mjs"
node "${repository_root}/scripts/terraform/secret-contract.mjs"
node "${repository_root}/scripts/terraform/artifact-contract.mjs"
node "${repository_root}/scripts/terraform/runtime-contract.mjs"
node "${repository_root}/scripts/terraform/edge-contract.mjs"
node "${repository_root}/scripts/terraform/monitoring-contract.mjs"
terraform -chdir="${repository_root}/infrastructure/google-cloud" fmt -check -recursive

for root in bootstrap platform modules/runtime-activation-platform modules/custom-domain-load-balancer modules/operational-monitoring; do
  data_directory="${root//\//-}"
  export TF_DATA_DIR="${repository_root}/.terraform-data/${data_directory}"
  terraform -chdir="${repository_root}/infrastructure/google-cloud/${root}" init -backend=false -input=false
  terraform -chdir="${repository_root}/infrastructure/google-cloud/${root}" validate
  terraform -chdir="${repository_root}/infrastructure/google-cloud/${root}" test
done
