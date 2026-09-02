output "repository" {
  description = "Non-secret Artifact Registry repository and direct access inventory."
  value = {
    format          = var.repository.format
    immutable_tags  = var.repository.immutable_tags
    location        = var.region
    mode            = var.repository.mode
    name            = "projects/${var.project_id}/locations/${var.region}/repositories/${var.repository.repository_id}"
    purpose_label   = var.repository.purpose_label
    reader_members  = sort(tolist(var.repository.reader_members))
    registry_host   = "${var.region}-docker.pkg.dev"
    repository_id   = var.repository.repository_id
    repository_path = "${var.region}-docker.pkg.dev/${var.project_id}/${var.repository.repository_id}"
    writer_members  = sort(tolist(var.repository.writer_members))
  }
}

output "cleanup" {
  description = "Non-secret Artifact Registry cleanup policy inventory."
  value = {
    application_retention_days      = var.cleanup.application_retention_days
    dry_run                         = var.cleanup_policy_dry_run
    keep_recent_version_count       = var.cleanup.keep_recent_version_count
    permission_smoke_retention_days = var.cleanup.permission_smoke_retention_days
    policy_ids                      = sort(values(var.cleanup.policy_ids))
  }
}
