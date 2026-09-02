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
    github_owner                 = "hworldcom"
    github_owner_id              = "144285964"
    github_repository            = "hworldcom/catalog-website"
    github_repository_id         = "1313750742"
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
    condition = module.state_bucket.direct_principals == tolist([
      "serviceAccount:baz-uat-terraform@bazoria-uat-lnlabs.iam.gserviceaccount.com",
      "user:hoang@lnlabs.xyz",
    ])
    error_message = "Only the operator and matching Terraform identity may receive direct state grants."
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

  assert {
    condition = {
      for key, account in module.identity_foundation.service_accounts : key => account.account_id
      } == {
      activationWorker = "baz-uat-activation-worker"
      artifactRelease  = "baz-uat-artifact-release"
      reconciliation   = "baz-uat-reconciliation"
      scheduler        = "baz-uat-scheduler"
      taskInvoker      = "baz-uat-task-invoker"
      terraform        = "baz-uat-terraform"
      web              = "baz-uat-web"
    }
    error_message = "UAT service accounts must use the exact reviewed identifiers."
  }

  assert {
    condition     = module.identity_foundation.federation.pool.id == "bazoria-uat-github"
    error_message = "UAT federation must use the reviewed pool identifier."
  }

  assert {
    condition = sort(keys(module.identity_foundation.federation.providers)) == tolist([
      "artifact",
      "terraform",
    ])
    error_message = "Federation must create separate artifact and Terraform providers."
  }

  assert {
    condition = module.identity_foundation.custom_roles.secretContainerAdmin.permissions == tolist([
      "secretmanager.locations.get",
      "secretmanager.locations.list",
      "secretmanager.secrets.create",
      "secretmanager.secrets.get",
      "secretmanager.secrets.getIamPolicy",
      "secretmanager.secrets.list",
      "secretmanager.secrets.setIamPolicy",
      "secretmanager.secrets.update",
    ])
    error_message = "The secret custom role must contain only reviewed container permissions."
  }
}
