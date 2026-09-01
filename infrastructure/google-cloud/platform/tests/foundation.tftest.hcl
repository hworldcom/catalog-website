mock_provider "google" {
  mock_data "google_project" {
    defaults = {
      billing_account = "014CA9-692646-D9E4CE"
      number          = "145571383840"
      org_id          = "33779488200"
      project_id      = "bazoria-uat-lnlabs"
    }
  }
}

run "uat_platform_enables_only_reviewed_services" {
  command = plan

  variables {
    billing_account_id = "014CA9-692646-D9E4CE"
    environment        = "uat"
    organization_id    = "33779488200"
    project_id         = "bazoria-uat-lnlabs"
    project_number     = "145571383840"
    region             = "europe-west3"
    state_bucket_name  = "bazoria-uat-lnlabs-tfstate"
  }

  assert {
    condition     = length(module.platform_services.enabled_services) == 14
    error_message = "The platform must enable the complete reviewed API catalog."
  }

  assert {
    condition     = !contains(module.platform_services.enabled_services, "containeranalysis.googleapis.com")
    error_message = "Google Container Analysis is deferred for this release."
  }

  assert {
    condition     = module.platform_services.services_retained_on_destroy
    error_message = "Platform APIs must remain enabled when removed from Terraform state."
  }
}
