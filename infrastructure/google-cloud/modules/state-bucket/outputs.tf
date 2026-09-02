output "bucket_name" {
  description = "State bucket name."
  value       = google_storage_bucket.state.name
}

output "direct_principals" {
  description = "Direct state principals managed during bootstrap."
  value = sort(distinct(concat(
    [google_storage_bucket_iam_member.bootstrap_operator.member],
    [for binding in google_storage_bucket_iam_member.terraform_identity : binding.member],
  )))
}

output "direct_bindings" {
  description = "Direct state-bucket bindings managed during bootstrap."
  value = concat(
    [{
      member = google_storage_bucket_iam_member.bootstrap_operator.member
      role   = google_storage_bucket_iam_member.bootstrap_operator.role
    }],
    [for binding in google_storage_bucket_iam_member.terraform_identity : {
      member = binding.member
      role   = binding.role
    }],
  )
}

output "security_contract" {
  description = "Non-secret bucket security settings used by validation and inventory."
  value = {
    force_destroy               = google_storage_bucket.state.force_destroy
    public_access_prevention    = google_storage_bucket.state.public_access_prevention
    uniform_bucket_level_access = google_storage_bucket.state.uniform_bucket_level_access
    versioning_enabled          = google_storage_bucket.state.versioning[0].enabled
  }
}
