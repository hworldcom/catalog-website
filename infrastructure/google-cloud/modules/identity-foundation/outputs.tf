output "custom_roles" {
  description = "Non-secret custom role inventory."
  value = {
    for key, role in var.custom_roles : key => {
      name        = "projects/${var.project_id}/roles/${role.role_id}"
      permissions = sort(tolist(role.permissions))
    }
  }
}

output "federation" {
  description = "Non-secret GitHub federation inventory."
  value = {
    pool = {
      id   = local.pool_id
      name = "projects/${var.project_number}/locations/global/workloadIdentityPools/${local.pool_id}"
    }
    providers = {
      for key, provider in var.federation_providers : key => {
        deployment_role = provider.deployment_role
        name            = "projects/${var.project_number}/locations/global/workloadIdentityPools/${local.pool_id}/providers/${provider.provider_id}"
        workflow_files  = sort(tolist(provider.workflow_files))
      }
    }
  }
}

output "service_accounts" {
  description = "Non-secret service-account inventory."
  value = {
    for key, account_id in local.service_account_ids : key => {
      account_id = account_id
      email      = local.service_account_emails[key]
      name       = "projects/${var.project_id}/serviceAccounts/${local.service_account_emails[key]}"
    }
  }
}

output "terraform_identity_principal" {
  description = "IAM principal for the matching Terraform deployment identity."
  value       = local.terraform_principal
}
