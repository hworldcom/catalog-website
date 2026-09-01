locals {
  service_catalog   = jsondecode(file("${path.module}/../service-catalog.json"))
  platform_services = toset(local.service_catalog.platform)
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

module "platform_services" {
  source = "../modules/project-services"

  project_id = var.project_id
  services   = local.platform_services

  depends_on = [module.project_contract]
}
