locals {
  environment_abbreviation = var.environment == "production" ? "prod" : "uat"
  identity_catalog         = jsondecode(file("${path.module}/../identity-catalog.json"))
  secret_catalog           = jsondecode(file("${path.module}/../secret-catalog.json"))
  service_catalog          = jsondecode(file("${path.module}/../service-catalog.json"))
  platform_services        = toset(local.service_catalog.platform)
  service_account_emails = {
    for key, account in local.identity_catalog.serviceAccounts :
    key => "baz-${local.environment_abbreviation}-${account.suffix}@${var.project_id}.iam.gserviceaccount.com"
  }
  secrets = {
    for key, secret in local.secret_catalog.secrets : key => {
      accessor_members = toset([
        for account_key in secret.accessorServiceAccountKeys :
        "serviceAccount:${local.service_account_emails[account_key]}"
      ])
      purpose_label = secret.purposeLabel
      secret_id     = "bazoria-${local.environment_abbreviation}-${secret.suffix}"
    }
  }
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

module "secret_foundation" {
  source = "../modules/secret-foundation"

  environment = var.environment
  project_id  = var.project_id
  region      = var.region
  secrets     = local.secrets

  depends_on = [module.platform_services]
}
