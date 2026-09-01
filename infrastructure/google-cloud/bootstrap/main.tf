locals {
  service_catalog    = jsondecode(file("${path.module}/../service-catalog.json"))
  bootstrap_services = toset(local.service_catalog.bootstrap)
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

  depends_on = [module.bootstrap_services]
}
