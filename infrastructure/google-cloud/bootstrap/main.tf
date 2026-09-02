locals {
  service_catalog    = jsondecode(file("${path.module}/../service-catalog.json"))
  bootstrap_services = toset(local.service_catalog.bootstrap)
  identity_catalog   = jsondecode(file("${path.module}/../identity-catalog.json"))
}

module "project_contract" {
  source = "../modules/project-contract"

  billing_account_id = var.billing_account_id
  environment        = var.environment
  organization_id    = var.organization_id
  project_id         = var.project_id
  project_number     = var.project_number
  region             = var.region
}

module "bootstrap_services" {
  source = "../modules/project-services"

  project_id = var.project_id
  services   = local.bootstrap_services

  depends_on = [module.project_contract]
}

module "state_bucket" {
  source = "../modules/state-bucket"

  bootstrap_operator_principal = var.bootstrap_operator_principal
  environment                  = var.environment
  project_id                   = var.project_id
  region                       = var.region
  state_bucket_name            = var.state_bucket_name
  terraform_identity_principal = module.identity_foundation.terraform_identity_principal

  depends_on = [module.bootstrap_services, module.identity_foundation]
}

module "identity_foundation" {
  source = "../modules/identity-foundation"

  custom_roles = {
    for key, value in local.identity_catalog.customRoles : key => {
      role_id     = value.roleId
      title       = value.title
      description = value.description
      permissions = toset(value.permissions)
    }
  }
  environment = var.environment
  federation_providers = {
    for key, value in local.identity_catalog.github.providers : key => {
      provider_id         = value.providerId
      deployment_role     = value.deploymentRole
      service_account_key = value.serviceAccountKey
      workflow_file       = value.workflowFile
    }
  }
  github_accepted_events = toset(local.identity_catalog.github.acceptedEvents)
  github_branch_ref      = local.identity_catalog.github.branchRef
  github_owner           = var.github_owner
  github_owner_id        = var.github_owner_id
  github_repository      = var.github_repository
  github_repository_id   = var.github_repository_id
  project_id             = var.project_id
  project_number         = var.project_number
  service_accounts = {
    for key, value in local.identity_catalog.serviceAccounts : key => {
      suffix                  = value.suffix
      display_name            = value.displayName
      description             = value.description
      terraform_can_act_as    = value.terraformCanActAs
      can_act_as_task_invoker = value.canActAsTaskInvoker
    }
  }
  terraform_project_roles = toset(local.identity_catalog.terraformProjectRoles)

  depends_on = [module.bootstrap_services]
}

resource "google_project_iam_audit_config" "artifact_registry_data_write" {
  project = var.project_id
  service = "artifactregistry.googleapis.com"

  audit_log_config {
    log_type = "DATA_WRITE"
  }

  depends_on = [module.bootstrap_services]
}
