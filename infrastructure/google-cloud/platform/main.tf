locals {
  environment_abbreviation = var.environment == "production" ? "prod" : "uat"
  artifact_catalog         = jsondecode(file("${path.module}/../artifact-catalog.json"))
  edge_catalog             = jsondecode(file("${path.module}/../edge-catalog.json"))
  identity_catalog         = jsondecode(file("${path.module}/../identity-catalog.json"))
  runtime_catalog          = jsondecode(file("${path.module}/../runtime-catalog.json"))
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
  artifact_repository = {
    format         = local.artifact_catalog.repository.format
    immutable_tags = local.artifact_catalog.repository.immutableTags
    mode           = local.artifact_catalog.repository.mode
    purpose_label  = local.artifact_catalog.repository.purposeLabel
    reader_members = toset([
      for account_key in local.artifact_catalog.repository.readerServiceAccountKeys :
      "serviceAccount:${local.service_account_emails[account_key]}"
    ])
    repository_id = "bazoria-${local.environment_abbreviation}-${local.artifact_catalog.repository.suffix}"
    writer_members = toset([
      for account_key in local.artifact_catalog.repository.writerServiceAccountKeys :
      "serviceAccount:${local.service_account_emails[account_key]}"
    ])
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

module "artifact_registry_foundation" {
  source = "../modules/artifact-registry-foundation"

  environment = var.environment
  project_id  = var.project_id
  region      = var.region
  repository  = local.artifact_repository

  depends_on = [module.platform_services]
}

module "runtime_activation_platform" {
  for_each = var.runtime_configuration == null ? {} : { enabled = var.runtime_configuration }

  source = "../modules/runtime-activation-platform"

  artifact_repository_id = local.artifact_repository.repository_id
  environment            = var.environment
  project_id             = var.project_id
  project_number         = var.project_number
  region                 = var.region
  runtime_configuration  = each.value
  runtime_contract       = local.runtime_catalog
  service_account_emails = {
    website        = local.service_account_emails.web
    worker         = local.service_account_emails.activationWorker
    reconciliation = local.service_account_emails.reconciliation
    task_invoker   = local.service_account_emails.taskInvoker
    scheduler      = local.service_account_emails.scheduler
  }
  secret_ids = {
    openai_api_key        = local.secrets.openaiApiKey.secret_id
    supabase_service_role = local.secrets.supabaseServiceRole.secret_id
  }

  depends_on = [
    module.platform_services,
    module.secret_foundation,
    module.artifact_registry_foundation,
  ]
}

module "custom_domain_load_balancer" {
  for_each = var.runtime_configuration == null ? {} : { enabled = var.runtime_configuration }

  source = "../modules/custom-domain-load-balancer"

  canonical_origin          = each.value.canonical_origin
  edge_contract             = local.edge_catalog
  environment               = var.environment
  expected_canonical_origin = local.runtime_catalog.canonicalOrigins[var.environment]
  project_id                = var.project_id
  region                    = var.region
  website_service_name      = module.runtime_activation_platform["enabled"].runtime_inventory.website.name

  depends_on = [
    module.platform_services,
    module.runtime_activation_platform,
  ]
}
