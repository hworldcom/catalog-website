resource "google_secret_manager_secret" "secrets" {
  for_each = var.secrets

  project   = var.project_id
  secret_id = each.value.secret_id
  labels = {
    environment = var.environment
    managed_by  = "terraform"
    purpose     = each.value.purpose_label
  }

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

locals {
  accessor_bindings = merge([
    for secret_key, secret in var.secrets : {
      for member in secret.accessor_members : "${secret_key}/${member}" => {
        member     = member
        secret_key = secret_key
      }
    }
  ]...)
}

resource "google_secret_manager_secret_iam_member" "accessors" {
  for_each = local.accessor_bindings

  project   = var.project_id
  secret_id = google_secret_manager_secret.secrets[each.value.secret_key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = each.value.member
}
