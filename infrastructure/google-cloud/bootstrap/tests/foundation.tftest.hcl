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

run "uat_bootstrap_is_private_and_versioned" {
  command = plan

  variables {
    billing_account_id           = "014CA9-692646-D9E4CE"
    bootstrap_operator_principal = "user:hoang@lnlabs.xyz"
    environment                  = "uat"
    organization_id              = "33779488200"
    project_id                   = "bazoria-uat-lnlabs"
    project_number               = "145571383840"
    region                       = "europe-west3"
    state_bucket_name            = "bazoria-uat-lnlabs-tfstate"
  }

  assert {
    condition     = module.state_bucket.bucket_name == "bazoria-uat-lnlabs-tfstate"
    error_message = "The state bucket must use the reviewed deterministic name."
  }

  assert {
    condition     = module.state_bucket.direct_principals == ["user:hoang@lnlabs.xyz"]
    error_message = "Only the reviewed bootstrap operator may receive a direct bootstrap grant."
  }

  assert {
    condition     = module.state_bucket.security_contract.public_access_prevention == "enforced"
    error_message = "Public access prevention must be enforced."
  }

  assert {
    condition     = module.state_bucket.security_contract.uniform_bucket_level_access
    error_message = "Uniform bucket-level access must be enabled."
  }

  assert {
    condition     = module.state_bucket.security_contract.versioning_enabled
    error_message = "State object versioning must be enabled."
  }

  assert {
    condition     = module.bootstrap_services.services_retained_on_destroy
    error_message = "Bootstrap APIs must remain enabled when removed from Terraform state."
  }
}
