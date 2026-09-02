resource "google_artifact_registry_repository" "containers" {
  project                = var.project_id
  location               = var.region
  repository_id          = var.repository.repository_id
  description            = "Private Bazoria ${var.environment} container images."
  format                 = var.repository.format
  mode                   = var.repository.mode
  cleanup_policy_dry_run = var.cleanup_policy_dry_run
  labels = {
    environment = var.environment
    managed_by  = "terraform"
    purpose     = var.repository.purpose_label
  }

  cleanup_policies {
    id     = var.cleanup.policy_ids.keepProtectedApplicationTags
    action = "KEEP"

    condition {
      tag_state             = "TAGGED"
      tag_prefixes          = var.cleanup.protected_application_tag_prefixes
      package_name_prefixes = [var.cleanup.application_package]
    }
  }

  cleanup_policies {
    id     = var.cleanup.policy_ids.keepRecentApplicationVersions
    action = "KEEP"

    most_recent_versions {
      package_name_prefixes = [var.cleanup.application_package]
      keep_count            = var.cleanup.keep_recent_version_count
    }
  }

  cleanup_policies {
    id     = var.cleanup.policy_ids.deleteApplicationByAge
    action = "DELETE"

    condition {
      tag_state             = "ANY"
      package_name_prefixes = [var.cleanup.application_package]
      older_than            = "${var.cleanup.application_retention_days * 86400}s"
    }
  }

  cleanup_policies {
    id     = var.cleanup.policy_ids.keepPermissionSmokeLatest
    action = "KEEP"

    condition {
      tag_state             = "TAGGED"
      tag_prefixes          = [var.cleanup.permission_smoke_tag_prefix]
      package_name_prefixes = [var.cleanup.permission_smoke_package]
    }
  }

  cleanup_policies {
    id     = var.cleanup.policy_ids.deleteSupersededPermissionSmoke
    action = "DELETE"

    condition {
      tag_state             = "UNTAGGED"
      package_name_prefixes = [var.cleanup.permission_smoke_package]
      older_than            = "${var.cleanup.permission_smoke_retention_days * 86400}s"
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_artifact_registry_repository_iam_member" "writers" {
  for_each = var.repository.writer_members

  project    = var.project_id
  location   = google_artifact_registry_repository.containers.location
  repository = google_artifact_registry_repository.containers.repository_id
  role       = "roles/artifactregistry.writer"
  member     = each.value
}

resource "google_artifact_registry_repository_iam_member" "readers" {
  for_each = var.repository.reader_members

  project    = var.project_id
  location   = google_artifact_registry_repository.containers.location
  repository = google_artifact_registry_repository.containers.repository_id
  role       = "roles/artifactregistry.reader"
  member     = each.value
}
