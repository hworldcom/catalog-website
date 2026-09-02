output "secret_containers" {
  description = "Non-secret Secret Manager container and access inventory."
  value = {
    for key, secret in var.secrets : key => {
      accessor_members = sort(tolist(secret.accessor_members))
      name             = "projects/${var.project_id}/secrets/${secret.secret_id}"
      purpose_label    = secret.purpose_label
      replication      = var.region
      secret_id        = secret.secret_id
    }
  }
}
