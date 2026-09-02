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
