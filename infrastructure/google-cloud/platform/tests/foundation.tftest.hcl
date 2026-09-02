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
    billing_account_id     = "014CA9-692646-D9E4CE"
    cleanup_policy_dry_run = true
    environment            = "uat"
    organization_id        = "33779488200"
    project_id             = "bazoria-uat-lnlabs"
    project_number         = "145571383840"
    region                 = "europe-west3"
    state_bucket_name      = "bazoria-uat-lnlabs-tfstate"
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

  assert {
    condition = jsonencode(sort(keys(module.secret_foundation.secret_containers))) == jsonencode([
      "openaiApiKey",
      "supabaseServiceRole",
    ])
    error_message = "The platform must create only the reviewed secret containers."
  }

  assert {
    condition = jsonencode(module.secret_foundation.secret_containers.openaiApiKey) == jsonencode({
      accessor_members = [
        "serviceAccount:baz-uat-web@bazoria-uat-lnlabs.iam.gserviceaccount.com",
      ]
      name          = "projects/bazoria-uat-lnlabs/secrets/bazoria-uat-openai-api-key"
      purpose_label = "openai-api-key"
      replication   = "europe-west3"
      secret_id     = "bazoria-uat-openai-api-key"
    })
    error_message = "The OpenAI secret container or access differs."
  }

  assert {
    condition = jsonencode(module.secret_foundation.secret_containers.supabaseServiceRole) == jsonencode({
      accessor_members = [
        "serviceAccount:baz-uat-activation-worker@bazoria-uat-lnlabs.iam.gserviceaccount.com",
        "serviceAccount:baz-uat-reconciliation@bazoria-uat-lnlabs.iam.gserviceaccount.com",
        "serviceAccount:baz-uat-web@bazoria-uat-lnlabs.iam.gserviceaccount.com",
      ]
      name          = "projects/bazoria-uat-lnlabs/secrets/bazoria-uat-supabase-service-role"
      purpose_label = "supabase-service-role"
      replication   = "europe-west3"
      secret_id     = "bazoria-uat-supabase-service-role"
    })
    error_message = "The Supabase secret container or access differs."
  }

  assert {
    condition = jsonencode(module.artifact_registry_foundation.repository) == jsonencode({
      format         = "DOCKER"
      immutable_tags = false
      location       = "europe-west3"
      mode           = "STANDARD_REPOSITORY"
      name           = "projects/bazoria-uat-lnlabs/locations/europe-west3/repositories/bazoria-uat-containers"
      purpose_label  = "container-images"
      reader_members = [
        "serviceAccount:baz-uat-terraform@bazoria-uat-lnlabs.iam.gserviceaccount.com",
      ]
      registry_host   = "europe-west3-docker.pkg.dev"
      repository_id   = "bazoria-uat-containers"
      repository_path = "europe-west3-docker.pkg.dev/bazoria-uat-lnlabs/bazoria-uat-containers"
      writer_members = [
        "serviceAccount:baz-uat-artifact-release@bazoria-uat-lnlabs.iam.gserviceaccount.com",
      ]
    })
    error_message = "The private Artifact Registry repository or direct access differs."
  }

  assert {
    condition = module.artifact_registry_foundation.cleanup == {
      application_retention_days      = 14
      dry_run                         = true
      keep_recent_version_count       = 5
      permission_smoke_retention_days = 7
      policy_ids = tolist([
        "delete-bazoria-web-by-age",
        "delete-superseded-permission-smoke",
        "keep-bazoria-web-protected-tags",
        "keep-permission-smoke-latest",
        "keep-recent-bazoria-web",
      ])
    }
    error_message = "The UAT Artifact Registry cleanup policy differs."
  }

  assert {
    condition     = output.runtime_inventory == null
    error_message = "The checked-in platform variables must not create runtime resources before release input is provided."
  }

  assert {
    condition     = output.edge_inventory == null
    error_message = "The checked-in platform variables must not create edge resources before release input is provided."
  }

  assert {
    condition     = output.monitoring_inventory == null
    error_message = "The checked-in platform variables must not create monitoring before runtime and notification channels are provided."
  }
}
