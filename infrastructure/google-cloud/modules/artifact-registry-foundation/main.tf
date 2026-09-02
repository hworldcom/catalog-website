resource "google_artifact_registry_repository" "containers" {
  project       = var.project_id
  location      = var.region
  repository_id = var.repository.repository_id
  description   = "Private Bazoria ${var.environment} container images."
  format        = var.repository.format
  mode          = var.repository.mode
  labels = {
    environment = var.environment
    managed_by  = "terraform"
    purpose     = var.repository.purpose_label
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
